/**
 * Staleness review: entry point.
 *
 * Two-phase process:
 * 1. Check external links in all integration READMEs. Open issues for
 *    integrations with broken links and add a warning banner to the README.
 * 2. Escalate stale issues that are 60+ days old by changing the
 *    integration's frontmatter status to "deprecated".
 *
 * Run via: npx tsx src/index.ts
 *
 * Environment variables (set by GitHub Actions):
 *   GITHUB_TOKEN: for creating/updating issues
 *   REPO_ROOT: absolute path to repo checkout
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { checkAllIntegrations, type IntegrationLinkReport } from "./link-check.js";
import { escalateStaleIntegrations } from "./escalation.js";

/**
 * Find the closing frontmatter delimiter (`\n---`) that is exactly three
 * dashes followed by a newline, carriage return, or end-of-file.
 * Skips occurrences like `\n----` or `\n---text`.
 * Returns the index of the `\n` before `---`, or -1 if not found.
 */
function findClosingFrontmatter(content: string, startAfter: number): number {
  let pos = startAfter;
  while (true) {
    const idx = content.indexOf("\n---", pos);
    if (idx === -1) return -1;
    const afterDashes = idx + 4; // position after "\n---"
    if (afterDashes >= content.length || content[afterDashes] === "\n" || content[afterDashes] === "\r") {
      return idx;
    }
    pos = afterDashes;
  }
}

const STALENESS_BANNER_START = "<!-- staleness-banner -->";
const STALENESS_BANNER_END = "<!-- /staleness-banner -->";

/**
 * Add a staleness warning banner to a README file, right after the
 * frontmatter closing delimiter. Skips if a banner already exists.
 * Returns true if the file was modified.
 */
function addStalenessBanner(filePath: string, repoRoot: string): boolean {
  const absolutePath = path.join(repoRoot, filePath);
  const content = fs.readFileSync(absolutePath, "utf-8");

  if (content.includes(STALENESS_BANNER_START)) {
    return false; // Banner already present
  }

  // Find the closing --- of frontmatter.
  // Anchor the opening delimiter: it must appear at the very start of the file
  // (index 0) or immediately after a BOM (index 1, charCode 0xFEFF).
  const firstDashes = content.indexOf("---");
  if (
    firstDashes !== 0 &&
    !(firstDashes === 1 && content.charCodeAt(0) === 0xfeff)
  ) {
    return false;
  }
  const closingDashes = findClosingFrontmatter(content, firstDashes + 3);
  if (closingDashes === -1) return false;

  const insertPoint = closingDashes + 4; // After the newline following ---
  const banner =
    `\n${STALENESS_BANNER_START}\n` +
    `> [!WARNING]\n` +
    `> This integration has been flagged as **stale**: some external links may be broken.\n` +
    `> Refer to the tracking issue in this repository for details. If you maintain this\n` +
    `> integration, please open a PR to fix the broken links.\n` +
    `${STALENESS_BANNER_END}\n`;

  const updated = content.slice(0, insertPoint) + banner + content.slice(insertPoint);
  fs.writeFileSync(absolutePath, updated, "utf-8");
  return true;
}

/**
 * Open a GitHub issue for an integration with broken links, or update
 * an existing one. Uses a hidden marker to deduplicate.
 */
async function openOrUpdateIssue(
  report: IntegrationLinkReport,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning("GITHUB_TOKEN not set; skipping issue creation.");
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const marker = `<!-- staleness-review -->\n<!-- file_path: ${report.filePath} -->`;

  // Wrap URLs in backticks to prevent markdown injection
  const linkList = report.brokenLinks
    .map((l) => `- \`${l.url}\`: ${l.reason}`)
    .join("\n");

  const body =
    `${marker}\n\n` +
    `## Broken links detected\n\n` +
    `The following external links in **${report.name}** (\`${report.filePath}\`) are broken:\n\n` +
    `${linkList}\n\n` +
    `### What happens next\n\n` +
    `Per the [deprecation policy](CONTRIBUTING.md#deprecation-and-staleness-policy), ` +
    `this integration will be marked as **deprecated** if the links are not fixed within 60 days.\n\n` +
    `The original contributor is expected to update the documentation. ` +
    `If you are the maintainer, please open a PR to fix the broken links and close this issue.`;

  const title = `Stale: ${report.name} - broken external links`;

  // Check for an existing open issue for this integration.
  // Use paginate to handle repos with >100 stale issues.
  const existingIssues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    labels: "stale",
    state: "open",
    per_page: 100,
  });

  const existing = existingIssues.find((i) =>
    i.body?.includes(`<!-- file_path: ${report.filePath} -->`),
  );

  if (existing) {
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: existing.number,
      body,
    });
    core.info(`Updated existing issue #${existing.number} for ${report.name}`);
  } else {
    const { data: created } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels: ["stale"],
    });
    core.info(`Opened issue #${created.number} for ${report.name}`);
  }
}

async function main(): Promise<void> {
  const repoRoot = process.env.REPO_ROOT || process.cwd();
  let anyFilesModified = false;

  // Phase 1: Check links
  core.info("=== Phase 1: Checking external links ===");
  const linkReports = await checkAllIntegrations(repoRoot);

  if (linkReports.length === 0) {
    core.info("All external links are healthy.");
  } else {
    core.info(
      `Found broken links in ${linkReports.length} integration(s).`,
    );
    for (const report of linkReports) {
      await openOrUpdateIssue(report);

      // Add warning banner to the README per CONTRIBUTING.md policy
      if (addStalenessBanner(report.filePath, repoRoot)) {
        core.info(`Added staleness banner to ${report.filePath}`);
        anyFilesModified = true;
      }
    }
  }

  // Phase 2: Escalate stale issues past 60 days
  core.info("=== Phase 2: Escalating stale issues ===");
  const escalated = await escalateStaleIntegrations(repoRoot);

  if (escalated.length === 0) {
    core.info("No integrations escalated to deprecated.");
  } else {
    core.info(`Deprecated ${escalated.length} integration(s):`);
    for (const e of escalated) {
      core.info(`  - ${e.integration} (issue #${e.issueNumber})`);
    }
    anyFilesModified = true;
  }

  // Set outputs for the workflow
  core.setOutput("broken_link_count", linkReports.length.toString());
  core.setOutput("deprecated_count", escalated.length.toString());
  core.setOutput(
    "has_changes",
    anyFilesModified ? "true" : "false",
  );
}

main().catch((err) => {
  core.setFailed(`Staleness review failed: ${err}`);
  process.exit(1);
});
