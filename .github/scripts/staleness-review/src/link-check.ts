/**
 * External link checker for integration READMEs.
 *
 * Extracts all external URLs from markdown content (skipping code blocks
 * and inline code) and checks each with a HEAD request (falling back to
 * GET). Rejects requests to private/reserved IP ranges to prevent SSRF.
 * Returns broken links grouped by integration.
 */

import * as fs from "node:fs";
import * as dns from "node:dns/promises";
import * as path from "node:path";
import matter from "gray-matter";
import * as core from "@actions/core";

export interface BrokenLink {
  url: string;
  status: number | "error";
  reason: string;
}

export interface IntegrationLinkReport {
  /** Relative path from repo root, e.g. integrations/hooks/pre-request/foo/README.md */
  filePath: string;
  /** Integration name from frontmatter */
  name: string;
  /** Current status from frontmatter */
  status: string;
  brokenLinks: BrokenLink[];
}

// ---------------------------------------------------------------------------
// URL extraction
// ---------------------------------------------------------------------------

/** Strip fenced code blocks (``` ... ```) and inline code (` ... `) from markdown. */
function stripCodeFromMarkdown(body: string): string {
  // Remove fenced code blocks first (greedy across lines)
  let stripped = body.replace(/```[\s\S]*?```/g, "");
  // Remove inline code spans
  stripped = stripped.replace(/`[^`]+`/g, "");
  return stripped;
}

/** Strip trailing punctuation that is not part of a URL. */
function stripTrailingJunk(url: string): string {
  return url.replace(/[.,;:'"!?)]+$/, "");
}

/**
 * Extract external (http/https) URLs from markdown body text,
 * excluding URLs inside code blocks and inline code.
 */
function extractExternalUrls(body: string): string[] {
  const stripped = stripCodeFromMarkdown(body);

  const linkRegex = /\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  // Bare URLs not already inside a markdown link. Excludes common
  // trailing punctuation and markdown-significant characters.
  const bareUrlRegex = /(?<![(\[])(https?:\/\/[^\s<>)\]"'`,]+)/g;

  const urls = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(stripped)) !== null) {
    urls.add(stripTrailingJunk(match[1].trim()));
  }
  while ((match = bareUrlRegex.exec(stripped)) !== null) {
    urls.add(stripTrailingJunk(match[1].trim()));
  }

  return [...urls];
}

/**
 * Extract URLs from frontmatter fields (e.g. provider_url).
 */
function extractFrontmatterUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  if (typeof data.provider_url === "string" && /^https?:\/\//.test(data.provider_url)) {
    urls.push(data.provider_url);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// SSRF protection
// ---------------------------------------------------------------------------

/** RFC 1918 / RFC 6598 / link-local / loopback / metadata ranges. */
function isPrivateIp(ip: string): boolean {
  // IPv4 patterns
  if (
    ip.startsWith("10.") ||
    ip.startsWith("127.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("0.")
  ) {
    return true;
  }
  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  // 100.64.0.0/10 (CGN / Tailscale range)
  if (ip.startsWith("100.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 64 && second <= 127) return true;
  }
  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x): extract the embedded
  // IPv4 address and check it against private ranges.
  if (ip.toLowerCase().startsWith("::ffff:")) {
    const embedded = ip.slice(7); // strip "::ffff:" prefix
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(embedded)) {
      return isPrivateIp(embedded);
    }
  }
  // Long-form IPv4-mapped IPv6: 0:0:0:0:0:ffff:x.x.x.x
  const longFormMatch = ip.toLowerCase().match(/^0+:0+:0+:0+:0+:f{4}:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (longFormMatch) {
    return isPrivateIp(longFormMatch[1]);
  }
  // IPv6 loopback and private
  if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
    return true;
  }
  return false;
}

/**
 * Validate that a URL does not target private/reserved infrastructure.
 * Returns an error message if blocked, null if safe.
 */
async function checkSsrf(url: string): Promise<string | null> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return "Malformed URL";
  }

  // Reject bare IP addresses
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith("[")) {
    if (isPrivateIp(hostname.replace(/[[\]]/g, ""))) {
      return "URL targets a private/reserved IP address";
    }
  }

  // Resolve hostname and check all IPs
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const all = [...addresses, ...addresses6];

    for (const ip of all) {
      if (isPrivateIp(ip)) {
        return `URL hostname ${hostname} resolves to private IP ${ip}`;
      }
    }
  } catch {
    // DNS resolution failure: the URL is likely broken anyway; let
    // the fetch attempt surface the real error.
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTTP checking
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000;

/** Check a single URL. Returns null if reachable, a BrokenLink if not. */
async function checkUrl(url: string): Promise<BrokenLink | null> {
  // SSRF guard: reject private/reserved targets
  const ssrfBlock = await checkSsrf(url);
  if (ssrfBlock) {
    core.info(`Skipping URL (SSRF protection): ${url} - ${ssrfBlock}`);
    return null; // Not a broken link; just excluded from checking
  }

  const headers = { "User-Agent": "aperture-catalog-staleness-bot/1.0" };

  // HEAD request with its own timeout
  const headController = new AbortController();
  const headTimeout = setTimeout(() => headController.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: headController.signal,
      redirect: "follow",
      headers,
    });
    clearTimeout(headTimeout);

    // Some servers reject HEAD; fall back to GET with a fresh timeout
    if (response.status === 405 || response.status === 403) {
      const getController = new AbortController();
      const getTimeout = setTimeout(() => getController.abort(), REQUEST_TIMEOUT_MS);
      try {
        response = await fetch(url, {
          method: "GET",
          signal: getController.signal,
          redirect: "follow",
          headers,
        });
      } finally {
        clearTimeout(getTimeout);
      }
    }

    if (response.ok) {
      return null;
    }

    return { url, status: response.status, reason: `HTTP ${response.status}` };
  } catch (err) {
    clearTimeout(headTimeout);
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("abort")) {
      return { url, status: "error", reason: "Request timed out (15s)" };
    }

    return { url, status: "error", reason: message };
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Find all integration READMEs and check their external links.
 *
 * Returns only integrations that have at least one broken link.
 */
export async function checkAllIntegrations(
  repoRoot: string,
): Promise<IntegrationLinkReport[]> {
  const integrationsDir = path.join(repoRoot, "integrations");
  const reports: IntegrationLinkReport[] = [];

  const readmes = findReadmes(integrationsDir);
  core.info(`Found ${readmes.length} integration README(s) to check.`);

  for (const absolutePath of readmes) {
    const filePath = path.relative(repoRoot, absolutePath);
    const content = fs.readFileSync(absolutePath, "utf-8");
    const parsed = matter(content);
    const name = (parsed.data.name as string) || path.basename(path.dirname(absolutePath));
    const status = (parsed.data.status as string) || "community";

    if (status === "deprecated") {
      core.info(`Skipping deprecated integration: ${name}`);
      continue;
    }

    // Collect URLs from both markdown body and frontmatter
    const bodyUrls = extractExternalUrls(parsed.content);
    const fmUrls = extractFrontmatterUrls(parsed.data as Record<string, unknown>);
    const urls = [...new Set([...bodyUrls, ...fmUrls])];

    if (urls.length === 0) {
      core.info(`${name}: no external links found.`);
      continue;
    }

    core.info(`${name}: checking ${urls.length} external link(s)...`);

    // Sequential to avoid rate-limiting target servers
    const brokenLinks: BrokenLink[] = [];
    for (const url of urls) {
      const result = await checkUrl(url);
      if (result) {
        brokenLinks.push(result);
        core.warning(`${name}: broken link ${result.url} - ${result.reason}`);
      }
    }

    if (brokenLinks.length > 0) {
      reports.push({ filePath, name, status, brokenLinks });
    }
  }

  return reports;
}

/** Recursively find all README.md files under a directory. */
function findReadmes(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findReadmes(fullPath));
    } else if (entry.name === "README.md") {
      results.push(fullPath);
    }
  }

  return results;
}
