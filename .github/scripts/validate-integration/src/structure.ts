/**
 * Directory placement and required section checks.
 *
 * Validates that the file is in the correct directory for its integration_type,
 * and that all required H2 sections are present. Missing sections are appended
 * with TODO placeholders.
 *
 * All types use a group-based section check: each group lists acceptable
 * heading names (preferred + legacy alternatives). A file must have at least
 * one heading from each group.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, PhrasingContent } from "mdast";
import matter from "gray-matter";
import {
  TYPE_DIRECTORY_MAP,
  REQUIRED_SECTION_GROUPS,
  HOOK_TYPES,
  HOOK_ONLY_SECTIONS,
  PRE_REQUEST_ONLY_SECTIONS,
  type IntegrationType,
  type ValidationIssue,
} from "./types.js";

export interface StructureResult {
  issues: ValidationIssue[];
  modified: boolean;
  content: string;
}

/**
 * Recursively extract plain text from a phrasing content node.
 * Handles text, inlineCode, emphasis, strong, delete, and link nodes
 * so that headings like `## Setup and \`configuration\`` resolve correctly.
 */
function extractText(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return node.value;
    case "inlineCode":
      return node.value;
    case "emphasis":
    case "strong":
    case "delete":
    case "link":
      return (node.children as PhrasingContent[]).map(extractText).join("");
    default:
      return "";
  }
}

/**
 * Extract H2 heading text from a markdown AST.
 */
function extractH2Headings(tree: Root): string[] {
  const headings: string[] = [];
  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 2) {
      const text = (node.children as PhrasingContent[])
        .map(extractText)
        .join("");
      headings.push(text);
    }
  }
  return headings;
}

/**
 * Normalize a section heading for comparison.
 * Lowercases and trims whitespace.
 */
function normalizeHeading(heading: string): string {
  return heading.trim().toLowerCase();
}

/**
 * Check whether any heading in a group is present in the existing headings.
 * Returns true if at least one alternative matches.
 */
function groupSatisfied(
  group: string[],
  existingNormalized: string[],
): boolean {
  return group.some((name) =>
    existingNormalized.includes(normalizeHeading(name)),
  );
}

/**
 * Check directory placement and required sections.
 *
 * @param fileContent - Full file content (with frontmatter).
 * @param filePath - Relative path from repo root.
 * @param integrationType - Parsed integration_type from frontmatter.
 */
export function validateStructure(
  fileContent: string,
  filePath: string,
  integrationType: string | undefined,
  additionalTypes?: string[],
): StructureResult {
  const issues: ValidationIssue[] = [];
  let modified = false;

  // --- Directory placement ---

  if (
    integrationType &&
    integrationType in TYPE_DIRECTORY_MAP
  ) {
    const expectedPrefix =
      TYPE_DIRECTORY_MAP[integrationType as IntegrationType];
    if (!filePath.startsWith(expectedPrefix)) {
      issues.push({
        file: filePath,
        message: `File is in \`${filePath}\` but \`integration_type: ${integrationType}\` expects the directory \`${expectedPrefix}\`. Consider moving this file.`,
        fixed: false,
      });
    }
  }

  // --- Required sections ---

  const parsed = matter(fileContent);
  const processor = unified().use(remarkParse);
  const tree = processor.parse(parsed.content) as Root;
  const existingHeadings = extractH2Headings(tree);
  const existingNormalized = existingHeadings.map(normalizeHeading);

  const missingSections: string[] = [];

  // Group-based check: each group must have at least one heading match.
  // All integration types use the same required section groups.
  for (const group of REQUIRED_SECTION_GROUPS) {
    if (!groupSatisfied(group, existingNormalized)) {
      // Use the preferred (first) name for the auto-fix stub.
      missingSections.push(group[0]);
    }
  }

  // Collect all declared types (primary + additional) for type-aware checks.
  const allTypes: string[] = [];
  if (integrationType) {
    allTypes.push(integrationType);
  }
  if (additionalTypes) {
    for (const t of additionalTypes) {
      const normalized = String(t).trim().toLowerCase();
      if (!allTypes.includes(normalized)) {
        allTypes.push(normalized);
      }
    }
  }

  const hasAnyHookType = allTypes.some((t) =>
    HOOK_TYPES.includes(t as IntegrationType),
  );
  const hasNonHookType = allTypes.some(
    (t) => t === "provider" || t === "tool",
  );
  const hasPreRequestHook = allTypes.includes("pre_request_hook");

  // Filter out wrong stub names injected by the group-based check.
  // Hook types should not get "Aperture configuration" from groups that also
  // contain hook-specific names, and non-hook types should not get
  // "Hook definition" or "Grant wiring". The type-specific blocks below add
  // back the correct names.
  //
  // When an integration declares both hook and non-hook types, keep both sets
  // of names (union of requirements).
  if (hasAnyHookType && !hasNonHookType) {
    const idx = missingSections.indexOf("Aperture configuration");
    if (idx !== -1) {
      missingSections.splice(idx, 1);
    }
  } else if (hasNonHookType && !hasAnyHookType) {
    for (const hookSection of HOOK_ONLY_SECTIONS) {
      const idx = missingSections.indexOf(hookSection);
      if (idx !== -1) {
        missingSections.splice(idx, 1);
      }
    }
  }

  if (hasAnyHookType) {
    // Hook types require "Hook definition" and "Grant wiring" specifically
    // (not just any group alternative like "Aperture configuration").
    for (const section of HOOK_ONLY_SECTIONS) {
      if (
        !existingNormalized.includes(normalizeHeading(section)) &&
        !missingSections.includes(section)
      ) {
        missingSections.push(section);
      }
    }

    // Pre-request hooks additionally require "Hook response format"
    if (hasPreRequestHook) {
      for (const section of PRE_REQUEST_ONLY_SECTIONS) {
        if (
          !existingNormalized.includes(normalizeHeading(section)) &&
          !missingSections.includes(section)
        ) {
          missingSections.push(section);
        }
      }
    }
  }

  if (hasNonHookType) {
    // Non-hook types require "Aperture configuration"
    const section = "Aperture configuration";
    if (
      !existingNormalized.includes(normalizeHeading(section)) &&
      !missingSections.includes(section)
    ) {
      missingSections.push(section);
    }
  }

  if (missingSections.length > 0) {
    // Append missing sections with TODO placeholders
    let appendText = "";
    for (const section of missingSections) {
      appendText += `\n\n## ${section}\n\n<!-- TODO: Fill in this section -->`;
    }

    // Re-serialize with appended sections
    const newBody = parsed.content.trimEnd() + appendText + "\n";
    const newContent = matter.stringify(newBody, parsed.data);
    modified = true;

    const sectionList = missingSections.map((s) => `\`${s}\``).join(", ");
    issues.push({
      file: filePath,
      message: `Added missing required section(s): ${sectionList}. Please fill in the TODO placeholders.`,
      fixed: true,
    });

    return {
      issues,
      modified,
      content: newContent,
    };
  }

  return {
    issues,
    modified,
    content: fileContent,
  };
}
