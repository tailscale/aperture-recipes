/**
 * Frontmatter validation and auto-fix.
 *
 * Validates required fields, normalizes integration_type typos,
 * fills missing date_submitted, and resets unauthorized "official" status.
 */

import matter from "gray-matter";
import {
  VALID_INTEGRATION_TYPES,
  VALID_STATUSES,
  TYPE_NORMALIZATIONS,
  type IntegrationFrontmatter,
  type ValidationIssue,
} from "./types.js";

export interface FrontmatterResult {
  /** Parsed frontmatter data. */
  data: IntegrationFrontmatter;
  /** Markdown body without frontmatter. */
  body: string;
  /** Issues found during validation. */
  issues: ValidationIssue[];
  /** Whether the frontmatter was modified. */
  modified: boolean;
  /** Re-serialized full file content (frontmatter + body). */
  content: string;
}

/**
 * Validate and auto-fix frontmatter in an integration file.
 *
 * @param fileContent - Raw file content including frontmatter.
 * @param filePath - Path to the file (for issue reporting).
 * @param prDate - PR open date in YYYY-MM-DD format (for date_submitted fill).
 * @param isTrustedAuthor - Whether the workflow trusts the PR author to set official status.
 */
export function validateFrontmatter(
  fileContent: string,
  filePath: string,
  prDate: string,
  isTrustedAuthor: boolean,
): FrontmatterResult {
  const issues: ValidationIssue[] = [];
  let modified = false;

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(fileContent);
  } catch {
    issues.push({
      file: filePath,
      message:
        "Could not parse YAML frontmatter. Ensure the file starts with `---` fences.",
      fixed: false,
    });
    return {
      data: {},
      body: fileContent,
      issues,
      modified: false,
      content: fileContent,
    };
  }

  const data = parsed.data as IntegrationFrontmatter;

  // --- Required fields that cannot be auto-fixed ---

  if (!data.name || (typeof data.name === "string" && !data.name.trim())) {
    issues.push({
      file: filePath,
      message:
        "Missing required frontmatter field `name`. Please add an integration name.",
      fixed: false,
    });
  }

  if (
    !data.provider ||
    (typeof data.provider === "string" && !data.provider.trim())
  ) {
    issues.push({
      file: filePath,
      message:
        "Missing required frontmatter field `provider`. Please add the provider/company name.",
      fixed: false,
    });
  }

  if (
    !data.provider_url ||
    (typeof data.provider_url === "string" && !data.provider_url.trim())
  ) {
    issues.push({
      file: filePath,
      message:
        "Missing required frontmatter field `provider_url`. Please add the provider's URL.",
      fixed: false,
    });
  }

  // --- integration_type: normalize or flag ---

  if (!data.integration_type) {
    issues.push({
      file: filePath,
      message:
        "Missing required frontmatter field `integration_type`. Must be one of: `pre_request_hook`, `post_response_hook`, `provider`, `tool`.",
      fixed: false,
    });
  } else {
    const raw = String(data.integration_type).trim().toLowerCase();
    if (
      VALID_INTEGRATION_TYPES.includes(
        raw as (typeof VALID_INTEGRATION_TYPES)[number],
      )
    ) {
      // Already valid, but ensure exact casing
      if (data.integration_type !== raw) {
        data.integration_type = raw;
        modified = true;
      }
    } else if (raw in TYPE_NORMALIZATIONS) {
      const corrected = TYPE_NORMALIZATIONS[raw];
      issues.push({
        file: filePath,
        message: `Normalized \`integration_type\` from \`${data.integration_type}\` to \`${corrected}\`.`,
        fixed: true,
      });
      data.integration_type = corrected;
      modified = true;
    } else {
      issues.push({
        file: filePath,
        message: `Invalid \`integration_type\`: \`${data.integration_type}\`. Must be one of: \`pre_request_hook\`, \`post_response_hook\`, \`provider\`, \`tool\`.`,
        fixed: false,
      });
    }
  }

  // --- date_submitted: fill if missing ---

  if (!data.date_submitted) {
    data.date_submitted = prDate;
    issues.push({
      file: filePath,
      message: `Set \`date_submitted\` to \`${prDate}\`.`,
      fixed: true,
    });
    modified = true;
  } else {
    // gray-matter parses bare YAML dates (2026-05-24) into JS Date objects.
    // Normalize back to a YYYY-MM-DD string so it round-trips correctly.
    if (data.date_submitted instanceof Date) {
      const d = data.date_submitted;
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      data.date_submitted = `${yyyy}-${mm}-${dd}`;
      // Not flagged as modified since the semantic value is unchanged;
      // we only normalize for downstream string checks.
    }
    // Validate format
    const dateStr = String(data.date_submitted);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      issues.push({
        file: filePath,
        message: `\`date_submitted\` should be in YYYY-MM-DD format. Current value: \`${dateStr}\`.`,
        fixed: false,
      });
    }
  }

  // --- status: default to community, prevent unauthorized "official" ---

  if (!data.status) {
    data.status = "community";
    issues.push({
      file: filePath,
      message: "Set missing `status` to `community`.",
      fixed: true,
    });
    modified = true;
  } else {
    const statusLower = String(data.status).trim().toLowerCase();
    if (
      !VALID_STATUSES.includes(
        statusLower as (typeof VALID_STATUSES)[number],
      )
    ) {
      issues.push({
        file: filePath,
        message: `Invalid \`status\`: \`${data.status}\`. Must be one of: \`community\`, \`official\`, \`deprecated\`. Resetting to \`community\`.`,
        fixed: true,
      });
      data.status = "community";
      modified = true;
    } else if (statusLower === "official" && !isTrustedAuthor) {
      issues.push({
        file: filePath,
        message:
          "Reset `status` from `official` to `community`. Only trusted repository contributors can set `official` status.",
        fixed: true,
      });
      data.status = "community";
      modified = true;
    }
  }

  // --- tags: validate it's an array if present ---

  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags)) {
      issues.push({
        file: filePath,
        message:
          "`tags` should be an array (for example, `tags: [guardrail, security]`).",
        fixed: false,
      });
    }
  }

  // --- additional_types: validate values ---

  if (data.additional_types !== undefined && data.additional_types !== null) {
    if (!Array.isArray(data.additional_types)) {
      issues.push({
        file: filePath,
        message: "`additional_types` should be an array.",
        fixed: false,
      });
    } else {
      const additionalTypes = data.additional_types;
      const normalizedTypes: string[] = [];
      for (const t of additionalTypes) {
        const val = String(t).trim().toLowerCase();
        if (
          !VALID_INTEGRATION_TYPES.includes(
            val as (typeof VALID_INTEGRATION_TYPES)[number],
          )
        ) {
          issues.push({
            file: filePath,
            message: `Invalid value in \`additional_types\`: \`${t}\`. Must be one of: \`pre_request_hook\`, \`post_response_hook\`, \`provider\`, \`tool\`.`,
            fixed: false,
          });
        } else {
          normalizedTypes.push(val);
        }
      }
      if (
        normalizedTypes.length === additionalTypes.length &&
        normalizedTypes.some((value, index) => value !== additionalTypes[index])
      ) {
        data.additional_types = normalizedTypes;
        modified = true;
      }
    }
  }

  // Re-serialize if modified
  const content = modified ? matter.stringify(parsed.content, data) : fileContent;

  return {
    data,
    body: parsed.content,
    issues,
    modified,
    content,
  };
}
