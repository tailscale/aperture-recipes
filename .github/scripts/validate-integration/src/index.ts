/**
 * Integration submission validator: entry point.
 *
 * Orchestrates all validation checks on integration files changed in a PR,
 * applies auto-fixes, and reports non-fixable issues as a PR comment.
 *
 * Run via: npx tsx src/index.ts
 *
 * Environment variables (set by GitHub Actions):
 *   GITHUB_TOKEN: for posting PR comments
 *   PR_NUMBER: pull request number
 *   PR_DATE: PR open date (YYYY-MM-DD)
 *   PR_AUTHOR: PR author login
 *   PR_AUTHOR_IS_ORG_MEMBER: "true" if author is org member
 *   CHANGED_FILES: newline-separated list of changed files
 *   REPO_ROOT: absolute path to repo checkout
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { validateFrontmatter } from "./frontmatter.js";
import { validateStructure } from "./structure.js";
import { validateCallouts } from "./callouts.js";
import { validateLinks } from "./links.js";
import { validateSemantics } from "./semantics.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

/** Filter changed files to only README.md files under integrations/. */
export function getIntegrationFiles(changedFiles: string[]): string[] {
  return changedFiles.filter((f) => {
    const normalized = f.replace(/\\/g, "/");
    return (
      normalized.startsWith("integrations/") &&
      path.basename(normalized) === "README.md"
    );
  });
}

/** Run all validation checks on a single integration file. */
export function validateContent(
  content: string,
  filePath: string,
  repoRoot: string,
  prDate: string,
  isOrgMember: boolean,
): ValidationResult {
  const allIssues: ValidationIssue[] = [];
  let currentContent = content;
  let anyModified = false;

  const fmResult = validateFrontmatter(currentContent, filePath, prDate, isOrgMember);
  allIssues.push(...fmResult.issues);
  if (fmResult.modified) {
    currentContent = fmResult.content;
    anyModified = true;
  }

  const structResult = validateStructure(
    currentContent,
    filePath,
    fmResult.data.integration_type,
    fmResult.data.additional_types,
  );
  allIssues.push(...structResult.issues);
  if (structResult.modified) {
    currentContent = structResult.content;
    anyModified = true;
  }

  const calloutsResult = validateCallouts(
    currentContent,
    filePath,
    fmResult.data.integration_type,
    fmResult.data.additional_types,
  );
  allIssues.push(...calloutsResult.issues);
  if (calloutsResult.modified) {
    currentContent = calloutsResult.content;
    anyModified = true;
  }

  allIssues.push(...validateSemantics(currentContent, filePath, fmResult.data).issues);
  allIssues.push(...validateLinks(currentContent, filePath, repoRoot).issues);

  return { file: filePath, issues: allIssues, modified: anyModified, content: currentContent };
}

export function validateFile(
  filePath: string,
  repoRoot: string,
  prDate: string,
  isOrgMember: boolean,
): ValidationResult {
  const absolutePath = path.join(repoRoot, filePath);
  let content: string;

  try {
    content = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return {
      file: filePath,
      issues: [
        {
          file: filePath,
          message: `Could not read file: \`${filePath}\`.`,
          fixed: false,
        },
      ],
      modified: false,
      content: "",
    };
  }

  return validateContent(content, filePath, repoRoot, prDate, isOrgMember);
}

/** Format validation issues into a markdown PR comment. */
function formatComment(results: ValidationResult[]): string {
  const unfixedIssues = results.flatMap((r) =>
    r.issues.filter((i) => !i.fixed),
  );
  const fixedIssues = results.flatMap((r) =>
    r.issues.filter((i) => i.fixed),
  );

  if (unfixedIssues.length === 0 && fixedIssues.length === 0) {
    return "";
  }

  let comment =
    "## Integration Validation Report\n\n";

  if (fixedIssues.length > 0) {
    comment += "### Auto-fixed\n\n";
    comment +=
      "The following issues were automatically fixed in a commit pushed to this branch:\n\n";
    for (const issue of fixedIssues) {
      comment += `- **\`${issue.file}\`**: ${issue.message}\n`;
    }
    comment += "\n";
  }

  if (unfixedIssues.length > 0) {
    comment += "### Needs attention\n\n";
    comment +=
      "The following issues require manual changes:\n\n";
    for (const issue of unfixedIssues) {
      comment += `- **\`${issue.file}\`**: ${issue.message}\n`;
    }
    comment += "\n";
  }

  comment +=
    "---\n*This report was generated automatically. Refer to the [contributing guide](CONTRIBUTING.md) and [template](templates/integration.md) for submission requirements.*\n";

  return comment;
}

/** Post or update a PR comment. Uses a hidden marker to find previous comments. */
async function postOrUpdateComment(
  comment: string,
  prNumber: number,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning("GITHUB_TOKEN not set; skipping PR comment.");
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const marker =
    "<!-- integration-validator -->";
  const body = marker + "\n" + comment;

  // Look for an existing comment from this action
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find(
    (c) => c.body?.includes(marker),
  );

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    core.info(`Updated existing PR comment #${existing.id}`);
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    core.info("Posted new PR comment");
  }
}

/** Delete a previous validator comment if all checks pass now. */
async function deletePreviousComment(prNumber: number): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;

  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;

  const marker = "<!-- integration-validator -->";

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body?.includes(marker));
  if (existing) {
    await octokit.rest.issues.deleteComment({
      owner,
      repo,
      comment_id: existing.id,
    });
    core.info("Deleted previous validation comment; all checks pass now.");
  }
}

async function main(): Promise<void> {
  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const prNumber = parseInt(process.env.PR_NUMBER || "0", 10);
  const prDate =
    process.env.PR_DATE || new Date().toISOString().slice(0, 10);
  const isOrgMember = process.env.PR_AUTHOR_IS_ORG_MEMBER === "true";
  const changedFilesRaw = process.env.CHANGED_FILES || "";

  const changedFiles = changedFilesRaw
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);

  const integrationFiles = getIntegrationFiles(changedFiles);

  if (integrationFiles.length === 0) {
    core.info("No integration README.md files changed. Nothing to validate.");
    return;
  }

  core.info(
    `Validating ${integrationFiles.length} integration file(s): ${integrationFiles.join(", ")}`,
  );

  const results: ValidationResult[] = [];

  for (const file of integrationFiles) {
    const result = validateFile(file, repoRoot, prDate, isOrgMember);
    results.push(result);

    // Write back modified files
    if (result.modified) {
      const absolutePath = path.join(repoRoot, file);
      fs.writeFileSync(absolutePath, result.content, "utf-8");
      core.info(`Wrote auto-fixed content to ${file}`);
    }
  }

  // Report
  const totalIssues = results.reduce(
    (sum, r) => sum + r.issues.length,
    0,
  );
  const fixedCount = results.reduce(
    (sum, r) => sum + r.issues.filter((i) => i.fixed).length,
    0,
  );
  const unfixedCount = totalIssues - fixedCount;
  const anyModified = results.some((r) => r.modified);

  core.info(
    `Validation complete: ${totalIssues} issue(s) found, ${fixedCount} auto-fixed, ${unfixedCount} need attention.`,
  );

  // Set outputs for the workflow
  core.setOutput("has_fixes", anyModified ? "true" : "false");
  core.setOutput("has_unfixed_issues", unfixedCount > 0 ? "true" : "false");

  // Post PR comment only if there are issues to report
  if (prNumber > 0) {
    const comment = formatComment(results);
    if (comment) {
      await postOrUpdateComment(comment, prNumber);
    } else {
      // All clean; remove any old comment
      await deletePreviousComment(prNumber);
    }
  }

  // Log summary to action output
  for (const result of results) {
    for (const issue of result.issues) {
      const prefix = issue.fixed ? "[FIXED]" : "[NEEDS ATTENTION]";
      core.info(`${prefix} ${issue.file}: ${issue.message}`);
    }
  }

  // Fail the CI check when there are issues that could not be auto-fixed
  if (unfixedCount > 0) {
    core.setFailed(`${unfixedCount} issue(s) require manual attention.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    core.setFailed(`Validation script failed: ${err}`);
    process.exit(1);
  });
}
