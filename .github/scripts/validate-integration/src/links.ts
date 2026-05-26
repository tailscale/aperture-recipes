/**
 * Internal link validation.
 *
 * Scans for relative markdown links and checks that the target files exist
 * in the repository. This is comment-only; no auto-fix.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import type { ValidationIssue } from "./types.js";

export interface LinksResult {
  issues: ValidationIssue[];
}

/**
 * Extract relative markdown links from content.
 *
 * Matches `[text](path)` patterns where path does not start with http://, https://, or #.
 * Returns unique paths.
 */
function extractRelativeLinks(body: string): string[] {
  const linkRegex = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
  const links: Set<string> = new Set();
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(body)) !== null) {
    const href = match[1].trim();

    // Skip absolute URLs
    if (href.startsWith("http://") || href.startsWith("https://")) {
      continue;
    }
    // Skip anchor-only links
    if (href.startsWith("#")) {
      continue;
    }
    // Skip mailto links
    if (href.startsWith("mailto:")) {
      continue;
    }

    // Strip anchor fragments from file paths
    const filePath = href.split("#")[0];
    if (filePath) {
      links.add(filePath);
    }
  }

  return [...links];
}

/**
 * Validate internal links in a file.
 *
 * @param fileContent - Full file content (with frontmatter).
 * @param filePath - Relative path from repo root.
 * @param repoRoot - Absolute path to the repository root.
 */
export function validateLinks(
  fileContent: string,
  filePath: string,
  repoRoot: string,
): LinksResult {
  const issues: ValidationIssue[] = [];

  const parsed = matter(fileContent);
  const body = parsed.content;
  const links = extractRelativeLinks(body);

  const fileDir = path.dirname(path.join(repoRoot, filePath));

  for (const link of links) {
    // Resolve relative to the file's directory
    const resolvedPath = path.resolve(fileDir, link);

    if (!fs.existsSync(resolvedPath)) {
      // Also check relative to repo root (some links are written as repo-relative)
      const repoRelativePath = path.join(repoRoot, link);
      if (!fs.existsSync(repoRelativePath)) {
        issues.push({
          file: filePath,
          message: `Broken internal link: \`${link}\`. File not found at expected path.`,
          fixed: false,
        });
      }
    }
  }

  return { issues };
}
