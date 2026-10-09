---
applyTo: "integrations/**"
---

# Integration submission review instructions

When reviewing pull requests that touch files under `integrations/`, evaluate the submission against every check below. These checks replace the previous AI review CI job and should be applied during Copilot code review.

## Security checks

### SEC-1: No hardcoded secrets

Scan the entire submission for real credentials, API keys, tokens, or passwords. Placeholder values (`YOUR_API_KEY_HERE`, `<api-key>`, `sk-example-xxx`) are fine. Flag values that look like real keys.

Red flags:
- Keys that follow a real provider's format (for example, `sk-` prefix with 40+ chars)
- The same suspicious key appearing in multiple places
- Passwords or tokens in environment variable examples that are not clearly placeholders

### SEC-2: send list is minimal

The `send` array in grant wiring controls what data the hook receives. It should contain only what the hook needs.

Common violations:
- Pre-request hooks sending `response_body` (there is no response yet when pre-request hooks fire)
- Sending `raw_responses` when `response_body` would suffice
- Sending `tools` when the hook never mentions tool filtering
- Sending everything "just in case"

Valid send values: `tools`, `request_body`, `response_body`, `raw_responses`, `user_message`, `grants`, `estimated_cost`, `quotas`.

### SEC-3: Security considerations section is adequate

The Security considerations section should address:
- What data leaves the Aperture perimeter (based on the `send` list)
- How credentials should be stored (not hardcoded in config)
- Whether the hook receives plaintext request/response content
- Network isolation if running on a tailnet

## Technical accuracy checks

### TECH-1: Grant uses dst for the correct location

Every tailnet policy grant example MUST include a `dst` key. Omitting it causes the grant to silently apply to nothing -- no error, no warning. Aperture config-file grants omit `dst`. Find every complete grant example, confirm its location is identified, and verify `dst` matches that location.

### TECH-2: events match integration type

- `pre_request_hook` -> events must include `pre_request`
- `post_response_hook` -> events must include `entire_request` and/or `tool_call_entire_request`
- A pre-request hook should NOT use `entire_request` or `tool_call_entire_request` unless it declares `additional_types: [post_response_hook]` in frontmatter
- A post-response hook should NOT use `pre_request`

Note: Dual-type integrations legitimately combine pre-request and post-response event types. When `additional_types` includes the other hook type, both sets of events are valid.

### TECH-3: send values are valid

Valid values: `tools`, `request_body`, `response_body`, `raw_responses`, `user_message`, `grants`, `estimated_cost`, `quotas`.

Note: the send value `tools` maps to the `HookCallData` field `tool_calls`. If the submission says the hook receives a field called `tools`, flag it -- the actual field name in the payload is `tool_calls`.

### TECH-4: GuardrailResponse is correct (pre-request hooks only)

For pre-request hooks, verify:
- Examples show valid `action` values: `allow`, `block`, or `modify`
- `modify` responses include a `request_body` field
- `block` responses include `status_code` and/or `message`
- No extra fields that would fail schema validation (`additionalProperties: false`)

Skip this check for post-response hooks (their responses are not parsed by Aperture).

### TECH-5: fail_policy is valid

Only two values are valid: `fail_open` and `fail_closed`. Check the hook config example for any other value.

### TECH-6: Hook config fields are valid

Valid hook config fields: `url`, `apikey`, `authorization`, `timeout`, `fail_policy`, `preference`, `disabled`. Flag any unrecognized fields.

## Content quality checks

### CONTENT-1: Examples are internally consistent

- curl command URLs should match the hook config URL
- Field names in examples should match the protocol spec (see `docs/protocol-reference.md`)
- Provider integrations should define the upstream in the top-level `providers` map; tool integrations should show the external tool's verified settings for pointing at Aperture. Grants authorize model access but do not configure either integration.
- Request/response pairs should be logically consistent (for example, if input has PII, output should show redaction)

### CONTENT-2: Testing steps are specific

Testing steps should include specific commands, expected outputs, and pass/fail criteria. Vague steps like "verify it works" are not useful.

### CONTENT-3: Troubleshooting is realistic (if present)

If a Troubleshooting section exists, verify symptoms are plausible and resolutions are actionable. Generic filler rows in the table are worse than no table at all.

## Additional review guidance

- Pre-request hooks modify requests, not responses. There is no mechanism to modify responses.
- Hook ordering: descending `preference`, then alphabetical by hook key. A `block` stops the chain. A `modify` updates the body for subsequent hooks.
- Grant merging: if the same hook appears in multiple grants, `events` and `send` are merged (union). The hook fires once, not once per grant.
- Fail policy: `fail_open` (default) skips unreachable hooks; `fail_closed` blocks with HTTP 503. Only affects pre-request hooks; post-response hooks always fail open.
- Config snippets should show enough to adapt, not reproduce full Aperture configurations. A brief location label and `dst` warning are sufficient; contributors do not need to show complete grant structures in both Aperture config-file and tailnet policy syntax.
- Never use "ACL" terminology. Use "grants" or "tailnet policy file" instead.
