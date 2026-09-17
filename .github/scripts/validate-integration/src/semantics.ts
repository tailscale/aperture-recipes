import matter from "gray-matter";
import type { IntegrationFrontmatter, ValidationIssue } from "./types.js";

const VALID_EVENTS = new Set([
  "pre_request",
  "entire_request",
  "tool_call_entire_request",
]);
const VALID_SEND_VALUES = new Set([
  "tools",
  "request_body",
  "response_body",
  "raw_responses",
  "user_message",
  "grants",
  "estimated_cost",
  "quotas",
]);
const RESPONSE_ONLY_SEND_VALUES = new Set([
  "tools",
  "response_body",
  "raw_responses",
]);
const HOOK_FIELDS = new Set([
  "url",
  "apikey",
  "authorization",
  "timeout",
  "disabled",
  "fail_policy",
  "preference",
]);
const PROVIDER_FIELDS = new Set([
  "apikey",
  "baseurl",
  "models",
  "authorization",
  "compatibility",
  "name",
  "description",
  "preference",
  "disabled",
  "cost_basis",
  "model_cost_map",
  "auth_mode",
  "add_headers",
  "upstream",
]);
const AUTHORIZATION_VALUES = new Set([
  "bearer",
  "x-api-key",
  "x-goog-api-key",
  "hec",
  "cf-aig-authorization",
]);
const AUTH_MODE_VALUES = new Set(["passthrough", "override", "none"]);
const FAIL_POLICY_VALUES = new Set(["fail_open", "fail_closed"]);
const GRANT_FIELDS = new Set(["src", "dst", "ip", "app"]);
const APERTURE_GRANT_FIELDS = new Set([
  "models",
  "send_hooks",
  "role",
  "quotas",
  "add_headers",
  "mcp_tools",
  "mcp_resources",
  "mcp_templates",
  "enable_chat_ui",
  "read_metrics",
  "set_cors",
  "cors_paths",
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Methods",
  "Access-Control-Allow-Headers",
  "connectors",
  "skills",
  "filterable_headers",
  "direct_paths",
  "read_pricing",
]);
const SEND_HOOK_FIELDS = new Set(["name", "events", "send"]);

interface SemanticResult {
  issues: ValidationIssue[];
}

interface JsonExamples {
  examples: Record<string, unknown>[];
  malformedConfigurationBlocks: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issue(file: string, message: string): ValidationIssue {
  return { file, message, fixed: false };
}

function isAbsoluteHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  if (/^https?:\/\/[A-Za-z0-9.-]*<[^<>\s/]+>[A-Za-z0-9.-]*(?::\d+)?(?:\/|$)/i.test(value)) {
    return true;
  }
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
): string[] {
  return Object.keys(value).filter((field) => !allowed.has(field));
}

function parseJsonExamples(body: string): JsonExamples {
  const examples: Record<string, unknown>[] = [];
  let malformedConfigurationBlocks = 0;
  const codeBlock = /^```json\s*\n([\s\S]*?)^```\s*$/gim;
  for (const match of body.matchAll(codeBlock)) {
    const source = match[1].trim();
    let parsed = false;
    for (const candidate of [source, `{${source}}`]) {
      try {
        const value: unknown = JSON.parse(candidate);
        if (isRecord(value)) examples.push(value);
        parsed = true;
        break;
      } catch {
        // Some examples are object fragments, so retry with enclosing braces.
      }
    }
    if (
      !parsed &&
      /(?:["'](?:hooks|grants|providers|send_hooks)["']|\b(?:hooks|grants|providers|send_hooks)\b)\s*:/i.test(source)
    ) {
      malformedConfigurationBlocks += 1;
    }
  }
  return { examples, malformedConfigurationBlocks };
}

function sectionBody(body: string, names: string[]): string | undefined {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const heading = new RegExp(`^## (?:${escaped.join("|")})\\s*$`, "im");
  const match = heading.exec(body);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const remainder = body.slice(start);
  const end = remainder.search(/^## /m);
  return end === -1 ? remainder : remainder.slice(0, end);
}

function meaningfulText(section: string): string {
  return section
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[^\n]*$/gm, "")
    .replace(/[\s#>*_`|:[\]-]/g, "")
    .trim();
}

function declaredEvents(frontmatter: IntegrationFrontmatter): Set<string> {
  const additionalTypes = Array.isArray(frontmatter.additional_types)
    ? frontmatter.additional_types
    : [];
  const types = new Set([
    frontmatter.integration_type,
    ...additionalTypes,
  ]);
  const events = new Set<string>();
  if (types.has("pre_request_hook")) events.add("pre_request");
  if (types.has("post_response_hook")) {
    events.add("entire_request");
    events.add("tool_call_entire_request");
  }
  return events;
}

/** Validate the documented configuration and required substantive content. */
export function validateSemantics(
  fileContent: string,
  filePath: string,
  frontmatter: IntegrationFrontmatter,
): SemanticResult {
  const issues: ValidationIssue[] = [];
  const body = matter(fileContent).content;
  const { examples, malformedConfigurationBlocks } = parseJsonExamples(body);
  const allowedEvents = declaredEvents(frontmatter);
  const types = new Set([
    frontmatter.integration_type,
    ...(Array.isArray(frontmatter.additional_types) ? frontmatter.additional_types : []),
  ]);
  let hasProvidersMap = false;
  let hasProviderEntry = false;
  let hasHooksMap = false;
  let hasHookEntry = false;
  let hasSendHooks = false;

  for (let index = 0; index < malformedConfigurationBlocks; index += 1) {
    issues.push(
      issue(
        filePath,
        "Configuration-like `json` block for hooks, grants, providers, or send_hooks is malformed JSON.",
      ),
    );
  }

  const validateSendHook = (value: unknown): void => {
    if (!isRecord(value)) {
      issues.push(issue(filePath, "Each `send_hooks` entry must be an object."));
      return;
    }
    for (const field of unknownFields(value, SEND_HOOK_FIELDS)) {
      issues.push(issue(filePath, `Invalid GrantSendHook field \`${field}\`.`));
    }
    if (typeof value.name !== "string" || !value.name.trim()) {
      issues.push(issue(filePath, "Each `send_hooks` entry requires a non-empty string `name`."));
    }
    if (!Array.isArray(value.events) || value.events.length === 0) {
      issues.push(issue(filePath, "Each `send_hooks` entry requires a non-empty `events` array."));
    }
    if (!Array.isArray(value.send)) {
      issues.push(issue(filePath, "Each `send_hooks` entry requires a `send` array."));
    }
    const events = Array.isArray(value.events) ? value.events.map(String) : [];
    const sends = Array.isArray(value.send) ? value.send.map(String) : [];
    for (const event of events) {
      if (!VALID_EVENTS.has(event)) {
        issues.push(issue(filePath, `Invalid hook event \`${event}\`.`));
      } else if (!allowedEvents.has(event)) {
        issues.push(
          issue(
            filePath,
            `Event \`${event}\` is incompatible with the declared integration types.`,
          ),
        );
      }
    }
    for (const send of sends) {
      if (!VALID_SEND_VALUES.has(send)) {
        issues.push(issue(filePath, `Invalid send value \`${send}\`.`));
      }
    }
    if (
      events.includes("pre_request") &&
      !events.includes("entire_request") &&
      !events.includes("tool_call_entire_request")
    ) {
      for (const send of sends.filter((entry) => RESPONSE_ONLY_SEND_VALUES.has(entry))) {
        issues.push(
          issue(filePath, `Send value \`${send}\` is unavailable for \`pre_request\` events.`),
        );
      }
    }
  };

  const validateApertureGrant = (value: unknown): void => {
    if (!isRecord(value)) return;
    for (const field of unknownFields(value, APERTURE_GRANT_FIELDS)) {
      issues.push(issue(filePath, `Invalid ApertureGrant field \`${field}\`.`));
    }
    if (Array.isArray(value.send_hooks)) {
      hasSendHooks = true;
      value.send_hooks.forEach(validateSendHook);
    }
  };

  for (const example of examples) {
    if (isRecord(example.providers)) {
      hasProvidersMap = true;
      for (const [name, provider] of Object.entries(example.providers)) {
        hasProviderEntry = true;
        if (!isRecord(provider)) {
          issues.push(issue(filePath, `Provider \`${name}\` must be an object.`));
          continue;
        }
        for (const field of unknownFields(provider, PROVIDER_FIELDS)) {
          issues.push(issue(filePath, `Invalid provider configuration field \`${field}\`.`));
        }
        let baseurl: URL | undefined;
        if (typeof provider.baseurl === "string" && provider.baseurl.trim()) {
          try {
            baseurl = new URL(provider.baseurl);
          } catch {
            // Report the common validation issue below.
          }
        }
        if (
          !baseurl ||
          !["http:", "https:"].includes(baseurl.protocol) ||
          !baseurl.hostname
        ) {
          issues.push(
            issue(filePath, `Provider \`${name}\` requires a non-empty absolute HTTP(S) \`baseurl\`.`),
          );
        } else if (/\/v1\/?$/i.test(baseurl.pathname)) {
          issues.push(issue(filePath, `Provider \`${name}\` \`baseurl\` must not end in \`/v1\`.`));
        }
        if (
          !Array.isArray(provider.models) ||
          provider.models.length === 0 ||
          !provider.models.every((model) => typeof model === "string" && model.trim())
        ) {
          issues.push(
            issue(filePath, `Provider \`${name}\` requires a non-empty \`models\` array of non-empty strings.`),
          );
        }
        if (
          provider.authorization !== undefined &&
          (typeof provider.authorization !== "string" ||
            !AUTHORIZATION_VALUES.has(provider.authorization))
        ) {
          issues.push(issue(filePath, `Provider \`${name}\` has an invalid \`authorization\` value.`));
        }
        if (
          provider.auth_mode !== undefined &&
          (typeof provider.auth_mode !== "string" || !AUTH_MODE_VALUES.has(provider.auth_mode))
        ) {
          issues.push(issue(filePath, `Provider \`${name}\` has an invalid \`auth_mode\` value.`));
        }
      }
    }
    if (isRecord(example.hooks)) {
      hasHooksMap = true;
      for (const [name, hook] of Object.entries(example.hooks)) {
        hasHookEntry = true;
        if (!isRecord(hook)) {
          issues.push(issue(filePath, `Hook \`${name}\` must be an object.`));
          continue;
        }
        for (const field of unknownFields(hook, HOOK_FIELDS)) {
          issues.push(issue(filePath, `Invalid hook configuration field \`${field}\`.`));
        }
        if (!isAbsoluteHttpUrl(hook.url)) {
          issues.push(
            issue(filePath, `Hook \`${name}\` requires a non-empty absolute HTTP(S) \`url\`.`),
          );
        }
        if (
          hook.authorization !== undefined &&
          (typeof hook.authorization !== "string" ||
            !AUTHORIZATION_VALUES.has(hook.authorization))
        ) {
          issues.push(issue(filePath, `Hook \`${name}\` has an invalid \`authorization\` value.`));
        }
        if (
          hook.fail_policy !== undefined &&
          (typeof hook.fail_policy !== "string" || !FAIL_POLICY_VALUES.has(hook.fail_policy))
        ) {
          issues.push(issue(filePath, `Hook \`${name}\` has an invalid \`fail_policy\` value.`));
        }
      }
    }
    if (Array.isArray(example.grants)) {
      for (const grant of example.grants) {
        if (!isRecord(grant)) continue;
        for (const field of unknownFields(grant, GRANT_FIELDS)) {
          issues.push(issue(filePath, `Invalid grant field \`${field}\`.`));
        }
        const aperture = isRecord(grant.app)
          ? grant.app["tailscale.com/cap/aperture"]
          : undefined;
        if (Array.isArray(aperture)) aperture.forEach(validateApertureGrant);
      }
    }
    if (Array.isArray(example.send_hooks)) {
      hasSendHooks = true;
      example.send_hooks.forEach(validateSendHook);
    }
  }

  const integrationType = frontmatter.integration_type;
  const declaresHook = allowedEvents.size > 0;
  if (declaresHook && (!hasHooksMap || !hasHookEntry)) {
    issues.push(issue(filePath, "Hook integrations must demonstrate a non-empty Aperture `hooks` map."));
  }
  if (declaresHook && !hasSendHooks) {
    issues.push(issue(filePath, "Hook integrations must demonstrate `send_hooks` grant wiring."));
  }
  if ((types.has("provider") || types.has("tool")) && hasSendHooks && !declaresHook) {
    issues.push(
      issue(filePath, "Provider and tool integrations must not include `send_hooks` unless they also declare a hook type."),
    );
  }
  if (types.has("provider") && !hasProvidersMap) {
    issues.push(issue(filePath, "Provider integrations must demonstrate an Aperture `providers` map."));
  } else if (types.has("provider") && !hasProviderEntry) {
    issues.push(issue(filePath, "Provider integrations must demonstrate at least one `providers` entry."));
  }
  if (types.has("tool")) {
    const toolConfig = sectionBody(body, ["Tool configuration", "Aperture configuration"]);
    const hasClientSettings = toolConfig !== undefined &&
      /```[\s\S]*?\b(?:base[ _-]?url|api[ _-]?base|endpoint|provider[ _-]?url)\b[\s\S]*?```/i.test(toolConfig);
    if (!hasClientSettings) {
      issues.push(issue(filePath, "Tool integrations must demonstrate concrete tool or client settings for Aperture."));
    }
  }

  const placeholderPatterns = [
    /\{Integration Name\}/i,
    /<!--\s*TODO:/i,
    /["'`]your-hook["'`]/i,
    /https:\/\/example\.com\/hook/i,
    /<API_KEY>(?![A-Z_])/i,
    /<!--\s*(?:FOR (?:HOOK|PROVIDER)|What this integration|How to verify|Step-by-step instructions)/i,
  ];
  if (placeholderPatterns.some((pattern) => pattern.test(body))) {
    issues.push(issue(filePath, "Remove unresolved template placeholders and retained template instructions."));
  }

  const requiredSections: Array<[string, string[]]> = [
    ["Summary", ["Summary"]],
    ["Prerequisites", ["Prerequisites"]],
    ["Setup and configuration", ["Setup and configuration"]],
    ["Verify the integration", ["Verify the integration", "Testing"]],
    ["Maintenance and support", ["Maintenance and support"]],
  ];
  if (types.has("pre_request_hook") || types.has("post_response_hook")) {
    requiredSections.push(
      ["Hook definition", ["Hook definition", "Hook configuration"]],
      ["Grant wiring", ["Grant wiring"]],
    );
  }
  if (types.has("pre_request_hook")) {
    requiredSections.push(["Hook response format", ["Hook response format"]]);
  }
  if (types.has("provider")) {
    requiredSections.push(
      ["Aperture provider configuration", ["Aperture provider configuration", "Aperture configuration"]],
      ["Grant access to provider models", ["Grant access to provider models"]],
    );
  }
  if (types.has("tool")) {
    requiredSections.push(
      ["Tool configuration", ["Tool configuration", "Aperture configuration"]],
      ["Grant access to the tool's models", ["Grant access to the tool's models"]],
    );
  }
  for (const [label, names] of requiredSections) {
    const section = sectionBody(body, names);
    if (section !== undefined && meaningfulText(section).length < 12) {
      issues.push(issue(filePath, `Required section \`${label}\` is empty or not substantive.`));
    }
  }

  const verification = sectionBody(body, ["Verify the integration", "Testing"]);
  if (verification !== undefined) {
    const hasSteps = /^\s*\d+[.)]\s+\S/m.test(verification);
    const hasExample = /```[^\n]*\n[\s\S]+?```/m.test(verification);
    const hasObservableResult = /\b(?:expect(?:ed)?|observe|confirm|verify|returns?|output|status|response|log|dashboard|appears?)\b/i.test(verification);
    if (!hasSteps || !hasExample || !hasObservableResult) {
      issues.push(
        issue(
          filePath,
          "Verification must include numbered steps, a concrete example, and an expected observable result.",
        ),
      );
    }
  }

  return { issues };
}
