import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import matter from "gray-matter";
import { validateCallouts } from "../src/callouts.js";
import { validateFrontmatter } from "../src/frontmatter.js";
import { validateContent } from "../src/index.js";
import { validateSemantics } from "../src/semantics.js";
import type { IntegrationFrontmatter } from "../src/types.js";

const fixtureRoot = new URL("./fixtures/", import.meta.url);

function validate(group: "positive" | "negative", name: string): string[] {
  const file = new URL(`${group}/${name}.md`, fixtureRoot);
  const content = readFileSync(file, "utf8");
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  return validateSemantics(content, `${group}/${name}.md`, frontmatter).issues.map(
    (entry) => entry.message,
  );
}

for (const type of ["pre-request", "post-response", "provider", "tool"]) {
  test(`accepts substantive ${type} integration`, () => {
    assert.deepEqual(validate("positive", type), []);
  });

  test(`full orchestration accepts ${type} fixture without autofix`, () => {
    const content = readFileSync(new URL(`positive/${type}.md`, fixtureRoot), "utf8");
    const directory = type === "pre-request" || type === "post-response"
      ? `integrations/hooks/${type}/example/README.md`
      : `integrations/${type}s/example/README.md`;
    const result = validateContent(content, directory, process.cwd(), "2026-08-12", false);
    assert.deepEqual(result.issues, []);
    assert.equal(result.modified, false);
  });
}

test("checks hook, grant, ApertureGrant, GrantSendHook, event, and send fields", () => {
  const messages = validate("negative", "pre-request").join("\n");
  for (const expected of [
    "retry_count",
    "bogus_grant",
    "bogus_aperture",
    "bogus_hook",
    "incompatible",
    "Invalid send value `secrets`",
    "Send value `response_body` is unavailable for `pre_request`",
    "Send value `tools` is unavailable for `pre_request`",
  ]) {
    assert.match(messages, new RegExp(expected));
  }
});

test("rejects unknown events", () => {
  assert.match(validate("negative", "post-response").join("\n"), /after_response/);
});

test("provider contract requires providers map and forbids generic send_hooks", () => {
  const messages = validate("negative", "provider").join("\n");
  assert.match(messages, /providers.*map/i);
  assert.match(messages, /must not include `send_hooks`/);
  assert.match(messages, /Invalid ApertureGrant field `model`/);
});

test("applies provider and tool contracts from additional_types", () => {
  const content = readFileSync(new URL("positive/pre-request.md", fixtureRoot), "utf8");
  for (const [type, expected] of [
    ["provider", /providers.*map/i],
    ["tool", /tool or client settings/i],
  ] as const) {
    const changed = content.replace(/^additional_types:.*$/m, `additional_types: [${type}]`);
    const frontmatter = matter(changed).data as IntegrationFrontmatter;
    const messages = validateSemantics(changed, `${type}.md`, frontmatter).issues
      .map((entry) => entry.message)
      .join("\n");
    assert.match(messages, expected);
  }
});

test("allows send_hooks when any declared integration type is a hook", () => {
  const content = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8")
    .replace("additional_types: []", "additional_types: [post_response_hook]")
    .replace(
      '"models": "exampleai/**"',
      '"models": "exampleai/**", "send_hooks": [{ "name": "audit", "events": ["entire_request"], "send": ["estimated_cost"] }]',
    );
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  const messages = validateSemantics(content, "provider-hook.md", frontmatter).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.doesNotMatch(messages, /must not include `send_hooks`/);
});

test("accepts response fields when a hook entry includes a post-response event", () => {
  const fixture = readFileSync(new URL("positive/pre-request.md", fixtureRoot), "utf8");
  for (const event of ["entire_request", "tool_call_entire_request"]) {
    const content = fixture.replace(
      '"events": ["pre_request"], "send": ["request_body", "user_message"]',
      `"events": ["pre_request", "${event}"], "send": ["request_body", "response_body", "raw_responses", "tools"]`,
    );
    const result = validateContent(content, "integrations/hooks/pre-request/policy/README.md", process.cwd(), "2026-08-12", false);
    assert.deepEqual(result.issues, []);
  }
});

test("validates every provider baseurl and model value", () => {
  const fixture = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8");
  const cases: Array<[string, string, RegExp]> = [
    ['"baseurl": "https://api.provider.test"', '"baseurl": ""', /absolute HTTP\(S\).*baseurl/],
    ['"baseurl": "https://api.provider.test"', '"baseurl": "/api"', /absolute HTTP\(S\).*baseurl/],
    ['"baseurl": "https://api.provider.test"', '"baseurl": "ftp://api.provider.test"', /absolute HTTP\(S\).*baseurl/],
    ['"baseurl": "https://api.provider.test"', '"baseurl": "https://api.provider.test/v1"', /must not end in `\/v1`/],
    ['"models": ["example-model"]', '"models": [""]', /non-empty `models` array of non-empty strings/],
    ['"models": ["example-model"]', '"models": [1]', /non-empty `models` array of non-empty strings/],
  ];
  for (const [before, after, expected] of cases) {
    const content = fixture.replace(before, after);
    const frontmatter = matter(content).data as IntegrationFrontmatter;
    const messages = validateSemantics(content, "provider-invalid.md", frontmatter).issues
      .map((entry) => entry.message)
      .join("\n");
    assert.match(messages, expected);
  }
});

test("reports malformed strict JSON configuration blocks", () => {
  const content = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8")
    .replace('"models": ["example-model"]', '"models": ["example-model",]');
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  const messages = validateSemantics(content, "malformed.md", frontmatter).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.match(messages, /Configuration-like `json` block.*malformed JSON/);
});

test("accepts an integration-specific historical-context cache warning", () => {
  const content = readFileSync(
    new URL("../../../../integrations/hooks/pre-request/tsheadroom/README.md", import.meta.url),
    "utf8",
  );
  const result = validateCallouts(content, "tsheadroom.md", "pre_request_hook");
  assert.equal(result.modified, false);
  assert.deepEqual(result.issues, []);
});

test("normalizes additional_types before semantic and callout validation", () => {
  const content = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8")
    .replace("additional_types: []", "additional_types: [PRE_REQUEST_HOOK]")
    .replace("## Verify the integration", "The hook action may be modify.\n\n## Verify the integration");
  const frontmatter = validateFrontmatter(
    content,
    "integrations/providers/example/README.md",
    "2026-08-12",
    false,
  );
  assert.equal(frontmatter.modified, true);
  assert.deepEqual(frontmatter.data.additional_types, ["pre_request_hook"]);

  const callouts = validateCallouts(
    frontmatter.content,
    "provider-hook.md",
    frontmatter.data.integration_type,
    frontmatter.data.additional_types,
  );
  assert.equal(callouts.modified, true);
  assert.match(callouts.content, /\*\*Cache impact\*\*/);
});

test("requires an absolute HTTP(S) hook URL", () => {
  const fixture = readFileSync(new URL("positive/post-response.md", fixtureRoot), "utf8");
  for (const replacement of ['"disabled": false', '"url": "/audit"']) {
    const content = fixture.replace('"url": "https://hooks.acme.test/audit", "disabled": false', replacement);
    const frontmatter = matter(content).data as IntegrationFrontmatter;
    const messages = validateSemantics(content, "hook-invalid.md", frontmatter).issues
      .map((entry) => entry.message)
      .join("\n");
    assert.match(messages, /Hook `audit` requires a non-empty absolute HTTP\(S\) `url`/);
  }
});

test("validates provider and hook fields and authentication enums", () => {
  const provider = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8")
    .replace('"apikey": "<EXAMPLEAI_API_KEY>"', '"api_key": "bad", "authorization": "basic", "auth_mode": "sometimes"');
  const providerData = matter(provider).data as IntegrationFrontmatter;
  const providerMessages = validateSemantics(provider, "provider-invalid.md", providerData).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.match(providerMessages, /Invalid provider configuration field `api_key`/);
  assert.match(providerMessages, /invalid `authorization`/);
  assert.match(providerMessages, /invalid `auth_mode`/);

  const hook = readFileSync(new URL("positive/post-response.md", fixtureRoot), "utf8")
    .replace('"disabled": false', '"authorization": "basic", "fail_policy": "retry"');
  const hookData = matter(hook).data as IntegrationFrontmatter;
  const hookMessages = validateSemantics(hook, "hook-invalid.md", hookData).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.match(hookMessages, /invalid `authorization`/);
  assert.match(hookMessages, /invalid `fail_policy`/);
});

test("requires hook definition and grant wiring examples", () => {
  const fixture = readFileSync(new URL("positive/post-response.md", fixtureRoot), "utf8");
  for (const [pattern, expected] of [
    [/```json\n"hooks":[\s\S]*?```/, /non-empty Aperture `hooks` map/],
    [/```json\n"send_hooks":[\s\S]*?```/, /`send_hooks` grant wiring/],
  ] as const) {
    const content = fixture.replace(pattern, "Configuration is managed externally.");
    const frontmatter = matter(content).data as IntegrationFrontmatter;
    const messages = validateSemantics(content, "hook-missing.md", frontmatter).issues
      .map((entry) => entry.message)
      .join("\n");
    assert.match(messages, expected);
  }
});

test("accepts current Aperture grant fields", () => {
  const content = readFileSync(new URL("positive/provider.md", fixtureRoot), "utf8")
    .replace(
      '"models": "exampleai/**"',
      '"models": "exampleai/**", "skills": "tag:shared/*", "direct_paths": ["GET exampleai/v1/models"], "read_pricing": true',
    );
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  const messages = validateSemantics(content, "grant-fields.md", frontmatter).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.doesNotMatch(messages, /Invalid ApertureGrant field/);
});

test("accepts an absolute hook URL with a documented hostname placeholder", () => {
  const content = readFileSync(
    new URL("../../../../integrations/hooks/pre-request/tsheadroom/README.md", import.meta.url),
    "utf8",
  );
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  const messages = validateSemantics(content, "tsheadroom.md", frontmatter).issues
    .map((entry) => entry.message)
    .join("\n");
  assert.doesNotMatch(messages, /requires a non-empty absolute HTTP\(S\) `url`/);
});


test("rejects structurally incomplete GrantSendHook entries", () => {
  const content = readFileSync(new URL("positive/post-response.md", fixtureRoot), "utf8")
    .replace(
      '"send_hooks": [{ "name": "audit", "events": ["tool_call_entire_request"], "send": ["tools", "response_body"] }]',
      '"send_hooks": [{}]',
    );
  const frontmatter = matter(content).data as IntegrationFrontmatter;
  const messages = validateSemantics(content, "incomplete.md", frontmatter).issues.map((entry) => entry.message).join("\n");
  assert.match(messages, /non-empty string `name`/);
  assert.match(messages, /non-empty `events` array/);
  assert.match(messages, /requires a `send` array/);
});

test("tool contract requires client settings and forbids generic send_hooks", () => {
  const messages = validate("negative", "tool").join("\n");
  assert.match(messages, /tool or client settings/i);
  assert.match(messages, /must not include `send_hooks`/);
});

test("rejects template residue, empty sections, and weak verification", () => {
  const messages = validate("negative", "tool").join("\n");
  assert.match(messages, /template placeholders/);
  assert.match(messages, /empty or not substantive/);
  assert.match(messages, /numbered steps.*concrete example.*observable result/);
});
