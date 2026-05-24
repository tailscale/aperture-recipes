/**
 * Deprecation escalation.
 *
 * Finds open issues labelled "stale" that are older than 60 days
 * and updates the corresponding integration's frontmatter status
 * to "deprecated". Uses targeted string replacement to avoid
 * reformatting the entire frontmatter block.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import * as core from "@actions/core";
import * as github from "@actions/github";

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

export interface EscalationResult {
  integration: string;
  issueNumber: number;
  filePath: string;
}

/**
 * Replace the `status` value in YAML frontmatter without reformatting.
 * Returns the updated file content, or null if the status line was not found.
 */
function replaceStatus(content: string, newStatus: string): string | null {
  // Match the status field in the frontmatter section (between --- delimiters).
  // Anchor the opening delimiter: it must appear at index 0, or at index 1
  // when preceded by a BOM (charCode 0xFEFF).
  const statusRegex = /^(status:\s*).+$/m;
  const fmStart = content.indexOf("---");
  if (
    fmStart !== 0 &&
    !(fmStart === 1 && content.charCodeAt(0) === 0xfeff)
  ) {
    return null;
  }
  const fmEnd = findClosingFrontmatter(content, fmStart + 3);

  if (fmEnd === -1) return null;

  // Scope the replacement to the frontmatter section only, then recombine
  // with the rest of the file to avoid accidentally replacing a "status:"
  // string in the document body.
  const frontmatterSection = content.slice(0, fmEnd);
  if (!statusRegex.test(frontmatterSection)) return null;

  const updatedFrontmatter = frontmatterSection.replace(statusRegex, `$1${newStatus}`);
  return updatedFrontmatter + content.slice(fmEnd);
}

/**
 * Validate that a file path from an issue body stays within the
 * integrations/ directory. Prevents path traversal attacks.
 */
function isPathSafe(repoRoot: string, filePath: string): boolean {
  const resolved = path.resolve(repoRoot, filePath);
  const integrationsPrefix = path.resolve(repoRoot, "integrations") + path.sep;
  return resolved.startsWith(integrationsPrefix);
}

/**
 * Check for stale issues that are 60+ days old and deprecate the
 * corresponding integrations. Returns the list of integrations that
 * were deprecated.
 */
export async function escalateStaleIntegrations(
  repoRoot: string,
): Promise<EscalationResult[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning("GITHUB_TOKEN not set — skipping escalation.");
    return [];
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  // Find open issues with the "stale" label.
  // Use paginate to handle repos with >100 stale issues.
  const staleIssues = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    labels: "stale",
    state: "open",
    per_page: 100,
  });

  if (staleIssues.length === 0) {
    core.info("No open issues with 'stale' label found.");
    return [];
  }

  // 60-day threshold matches CONTRIBUTING.md's deprecation escalation policy.
  // The separate 90-day unresponsiveness trigger (CONTRIBUTING.md) is not yet
  // automated — it requires checking issue activity, which is a future
  // enhancement.
  // TODO: Automate the 90-day unresponsiveness escalation by inspecting issue
  // comment/activity history.
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const results: EscalationResult[] = [];

  for (const issue of staleIssues) {
    // Only process issues created by this bot (have our marker)
    if (!issue.body?.includes("<!-- staleness-review -->")) {
      continue;
    }

    const createdAt = new Date(issue.created_at);
    if (createdAt > sixtyDaysAgo) {
      const daysOld = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      core.info(
        `Issue #${issue.number} is ${daysOld} days old — not yet 60 days. Skipping.`,
      );
      continue;
    }

    // Extract the file path from the issue body (we embed it on creation)
    const filePathMatch = issue.body?.match(
      /<!-- file_path: (.+?) -->/,
    );
    if (!filePathMatch) {
      core.warning(
        `Issue #${issue.number} has no file_path marker — skipping.`,
      );
      continue;
    }

    const filePath = filePathMatch[1];

    // Path traversal guard: ensure path stays under integrations/
    if (!isPathSafe(repoRoot, filePath)) {
      core.warning(
        `Issue #${issue.number} has suspicious file_path "${filePath}" — skipping.`,
      );
      continue;
    }

    const absolutePath = path.resolve(repoRoot, filePath);

    if (!fs.existsSync(absolutePath)) {
      core.warning(`File not found for issue #${issue.number}: ${filePath}`);
      continue;
    }

    // Check current status using gray-matter (read-only)
    const content = fs.readFileSync(absolutePath, "utf-8");
    const parsed = matter(content);

    if (parsed.data.status === "deprecated") {
      core.info(
        `${filePath} already deprecated — closing issue #${issue.number}.`,
      );
      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issue.number,
        state: "closed",
        state_reason: "completed",
      });
      continue;
    }

    // Targeted replacement: only change the status value, preserve all
    // other frontmatter formatting (dates, arrays, quoting).
    const updated = replaceStatus(content, "deprecated");
    if (!updated) {
      core.warning(
        `Could not find status field in frontmatter of ${filePath} — skipping.`,
      );
      continue;
    }
    fs.writeFileSync(absolutePath, updated, "utf-8");

    core.info(
      `Deprecated ${filePath} (issue #${issue.number} is 60+ days old).`,
    );

    // Comment on the issue
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issue.number,
      body:
        `This integration has been marked as **deprecated** after 60 days with no update.\n\n` +
        `The \`status\` field in \`${filePath}\` has been changed to \`deprecated\`. ` +
        `If this integration has been fixed, please open a PR to restore it.`,
    });

    // Close the issue
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issue.number,
      state: "closed",
      state_reason: "completed",
    });

    results.push({
      integration: (parsed.data.name as string) || filePath,
      issueNumber: issue.number,
      filePath,
    });
  }

  return results;
}
