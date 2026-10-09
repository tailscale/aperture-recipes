/**
 * Required callout injection.
 *
 * Checks for and injects two mandatory callouts:
 * 1. dst key warning: when file has grant examples
 * 2. Cache impact note: when pre_request_hook uses modify action
 *
 * Injection targets are type-aware for hook, provider, and tool sections,
 * with legacy section names retained as fallbacks.
 */

import matter from "gray-matter";
import { HOOK_TYPES, type IntegrationType, type ValidationIssue } from "./types.js";

/** The canonical dst warning callout text from the template. */
const DST_WARNING = `> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit \`dst\` key (for example, \`"dst": ["tag:aperture"]\`). Omitting \`dst\` causes the grant to silently apply to nothing. Config-file grants do not use \`dst\`; omit it there. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.`;

/** The canonical cache impact callout text from the template. */
const CACHE_IMPACT_NOTE = `> [!NOTE]
> **Cache impact**: Modifying the current turn's content (the new user message) has no cache impact because the provider has not received it yet. However, modifying historical context (earlier messages already cached by the provider) invalidates the prompt cache and can increase estimated costs. Refer to the [protocol quick reference](../../../../docs/protocol-reference.md#cache-impact-of-request-modification) for details. If your hook only uses \`allow\` and \`block\`, delete this callout.`;

export interface CalloutsResult {
  issues: ValidationIssue[];
  modified: boolean;
  content: string;
}

/**
 * Check if the file body contains grant-related content in code blocks.
 *
 * Looks for `"grants"` or `send_hooks` inside fenced code blocks.
 */
function hasGrantExamples(body: string): boolean {
  // Extract fenced code block contents
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    const block = match[0];
    if (block.includes('"grants"') || block.includes("send_hooks")) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the file mentions the modify action (for pre-request hooks).
 *
 * Looks for the word "modify" in contexts that suggest the action value,
 * including code blocks containing `"action": "modify"` or `"modify"` as
 * a standalone reference to the action.
 */
function mentionsModifyAction(body: string): boolean {
  // Check for "modify" action in code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(body)) !== null) {
    if (match[0].includes('"modify"')) {
      return true;
    }
  }
  // Check for targeted references to the modify action in prose.
  // Matches "modify action" or "action … modify" but avoids false positives
  // on generic English usage of "modify" (for example, "modify the request").
  if (/\bmodify\s+action\b/i.test(body) || /\baction\b.*\bmodify\b/i.test(body)) {
    return true;
  }
  return false;
}

/**
 * Check if a specific callout marker is already present in the body.
 * Uses a key phrase to detect presence rather than exact string matching,
 * since contributors may have slightly reformatted the callout.
 */
function hasDstWarning(body: string): boolean {
  return (
    body.includes("grants require an explicit `dst` key") ||
    body.includes("grants require an explicit dst key") ||
    body.includes("require an explicit `dst` key") ||
    body.includes("Omitting it causes the grant to silently apply to nothing") ||
    body.includes("Omitting `dst` causes the grant to silently apply to nothing")
  );
}

function hasCacheImpactNote(body: string): boolean {
  return (
    body.includes("invalidates the prompt cache") ||
    body.includes("invalidates the LLM provider's prompt cache") ||
    body.includes("invalidates the LLM provider\u2019s prompt cache") ||
    body.includes("no prompt cache impact") ||
    body.includes("no cache impact") ||
    body.includes("prompt-cache miss") ||
    body.includes("cache miss (up to 10x cost increase)") ||
    body.includes("cache miss (up to 10x cost") ||
    body.includes("does not affect LLM provider cache behavior")
  );
}

/**
 * Inject a callout after a specific H2 section heading.
 *
 * Finds the section by heading text and inserts the callout text after the
 * section heading (before the next section or at the end of the section's
 * content).
 */
function injectAfterSection(
  body: string,
  sectionName: string,
  calloutText: string,
): string {
  // Find the section heading
  const sectionRegex = new RegExp(
    `^(## ${escapeRegex(sectionName)})\\s*$`,
    "m",
  );
  const match = sectionRegex.exec(body);
  if (!match || match.index === undefined) {
    // Section not found; append at end as fallback
    return body.trimEnd() + "\n\n" + calloutText + "\n";
  }

  // Find the next H2 heading after this section
  const afterHeading = match.index + match[0].length;
  const restOfBody = body.slice(afterHeading);
  const nextH2 = restOfBody.search(/^## /m);

  if (nextH2 === -1) {
    // No next section; append callout at end of file
    return body.trimEnd() + "\n\n" + calloutText + "\n";
  }

  // Insert callout before the next H2 section
  const insertPoint = afterHeading + nextH2;
  const before = body.slice(0, insertPoint).trimEnd();
  const after = body.slice(insertPoint);
  return before + "\n\n" + calloutText + "\n\n" + after;
}

/**
 * Try to inject a callout after one of several candidate section names.
 * Returns the modified body on success, or null if none of the sections exist.
 */
function injectAfterFirstMatchingSection(
  body: string,
  sectionNames: string[],
  calloutText: string,
): string | null {
  for (const name of sectionNames) {
    const sectionRegex = new RegExp(
      `^## ${escapeRegex(name)}\\s*$`,
      "m",
    );
    if (sectionRegex.test(body)) {
      return injectAfterSection(body, name, calloutText);
    }
  }
  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate and inject required callouts.
 *
 * @param fileContent - Full file content (with frontmatter).
 * @param filePath - Relative path from repo root.
 * @param integrationType - Parsed integration_type from frontmatter.
 * @param additionalTypes - Parsed additional_types from frontmatter.
 */
export function validateCallouts(
  fileContent: string,
  filePath: string,
  integrationType: string | undefined,
  additionalTypes: string[] = [],
): CalloutsResult {
  const issues: ValidationIssue[] = [];
  let modified = false;

  const parsed = matter(fileContent);
  let body = parsed.content;

  const types = new Set([integrationType, ...additionalTypes]);
  const isHookType = [...types].some(
    (type) => type && HOOK_TYPES.includes(type as IntegrationType),
  );

  // --- dst key warning ---
  if (hasGrantExamples(body) && !hasDstWarning(body)) {
    // Try type-appropriate section first, then fallback to alternatives.
    const dstTargets = isHookType
      ? ["Grant wiring", "Aperture configuration"]
      : [
          "Grant access to provider models",
          "Grant access to the tool's models",
          "Aperture configuration",
          "Grant wiring",
        ];

    const result = injectAfterFirstMatchingSection(body, dstTargets, DST_WARNING);
    if (result) {
      body = result;
    } else {
      // No matching section; append at end
      body = body.trimEnd() + "\n\n" + DST_WARNING + "\n";
    }

    issues.push({
      file: filePath,
      message:
        "Injected the `dst` key warning callout. This is required because the file contains grant examples. Tailnet grants silently fail without a `dst` key.",
      fixed: true,
    });
    modified = true;
  }

  // --- Cache impact note ---
  if (types.has("pre_request_hook") && mentionsModifyAction(body)) {
    if (!hasCacheImpactNote(body)) {
      const cacheTargets = isHookType
        ? ["Hook response format", "Aperture configuration", "Grant wiring"]
        : ["Aperture configuration", "Hook response format"];

      const result = injectAfterFirstMatchingSection(body, cacheTargets, CACHE_IMPACT_NOTE);
      if (result) {
        body = result;
      } else {
        body = body.trimEnd() + "\n\n" + CACHE_IMPACT_NOTE + "\n";
      }

      issues.push({
        file: filePath,
        message:
          "Injected the cache impact callout. This is required because this pre-request hook references the `modify` action. The callout explains that current-turn modifications have no cache impact while historical context modifications do.",
        fixed: true,
      });
      modified = true;
    }
  }

  const content = modified ? matter.stringify(body, parsed.data) : fileContent;

  return {
    issues,
    modified,
    content,
  };
}
