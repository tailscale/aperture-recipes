/**
 * Shared types for the integration validation script.
 */

/** Valid integration type values. */
export const VALID_INTEGRATION_TYPES = [
  "pre_request_hook",
  "post_response_hook",
  "provider",
  "tool",
] as const;

export type IntegrationType = (typeof VALID_INTEGRATION_TYPES)[number];

/** Valid status values. */
export const VALID_STATUSES = ["community", "official", "deprecated"] as const;

export type IntegrationStatus = (typeof VALID_STATUSES)[number];

/** Maps integration_type to expected directory prefix. */
export const TYPE_DIRECTORY_MAP: Record<IntegrationType, string> = {
  pre_request_hook: "integrations/hooks/pre-request/",
  post_response_hook: "integrations/hooks/post-response/",
  provider: "integrations/providers/",
  tool: "integrations/tools/",
};

/** Common misspellings/variants that can be auto-corrected. */
export const TYPE_NORMALIZATIONS: Record<string, IntegrationType> = {
  "pre-request-hook": "pre_request_hook",
  "pre-request_hook": "pre_request_hook",
  "pre_request-hook": "pre_request_hook",
  prerequesthook: "pre_request_hook",
  "pre request hook": "pre_request_hook",
  "post-response-hook": "post_response_hook",
  "post-response_hook": "post_response_hook",
  "post_response-hook": "post_response_hook",
  postresponsehook: "post_response_hook",
  "post response hook": "post_response_hook",
};

/**
 * Required section groups for all integration types.
 *
 * Each inner array lists acceptable heading names — the file must have at least
 * one heading from each group. The first name is the preferred name used in the
 * template and auto-fix stubs. Later names are legacy alternatives accepted for
 * backward compatibility with existing submissions.
 */
export const REQUIRED_SECTION_GROUPS: string[][] = [
  ["Summary"],
  ["Prerequisites"],
  ["Setup and configuration"],
  ["Hook definition", "Aperture configuration", "Hook configuration"],
  ["Grant wiring", "Aperture configuration"],
  ["Verify the integration", "Testing"],
  ["Maintenance and support"],
];

/** Hook integration types that use the hook section structure. */
export const HOOK_TYPES: IntegrationType[] = [
  "pre_request_hook",
  "post_response_hook",
];

/**
 * Sections required for any hook integration type
 * (pre_request_hook or post_response_hook).
 */
export const HOOK_ONLY_SECTIONS: string[] = [
  "Hook definition",
  "Grant wiring",
];

/**
 * Sections required only for pre_request_hook integrations.
 */
export const PRE_REQUEST_ONLY_SECTIONS: string[] = [
  "Hook response format",
];

/** Frontmatter fields and whether they are required. */
export interface IntegrationFrontmatter {
  name?: string;
  provider?: string;
  provider_url?: string;
  integration_type?: string;
  additional_types?: string[];
  status?: string;
  date_submitted?: string | Date;
  tags?: unknown;
}

/** A single validation finding. */
export interface ValidationIssue {
  /** The file this issue relates to. */
  file: string;
  /** Short description of the issue. */
  message: string;
  /** Whether this issue was auto-fixed. */
  fixed: boolean;
}

/** Result of validating a single integration file. */
export interface ValidationResult {
  /** Path to the file. */
  file: string;
  /** All issues found. */
  issues: ValidationIssue[];
  /** Whether the file content was modified (needs writing back). */
  modified: boolean;
  /** The (possibly modified) raw file content. */
  content: string;
}
