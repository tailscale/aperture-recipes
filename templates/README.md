# Integration templates

This directory contains a single unified template for all Aperture integration submissions.

## One template, one workflow

There is one template: [`integration.md`](integration.md). All integration types use it. The `integration_type` field in frontmatter distinguishes what kind of integration you are documenting.

Valid values for `integration_type`:

| Value | Description |
|---|---|
| `pre_request_hook` | Synchronous hook that fires before the request reaches the LLM provider. Uses the `pre_request` event type. Returns a `GuardrailResponse` with allow, block, or modify action. |
| `post_response_hook` | Fire-and-forget hook that fires after the LLM response is delivered. Uses `entire_request` or `tool_call_entire_request` event types. Aperture does not parse the hook's response. |
| `provider` | Documentation for using Aperture with a specific LLM provider or reseller. |
| `tool` | Documentation for using Aperture alongside a developer tool, platform, or workflow. |

## Frontmatter: `tags`

The `tags` field is an optional array of free-form strings used for categorization. Tags help users discover integrations by capability or domain. Use lowercase, hyphenated values. Example values:

- `guardrail`: enforces policy or limits on requests
- `security`: security-focused integration
- `pii-redaction`: detects or removes personally identifiable information
- `observability`: provides visibility into LLM traffic
- `logging`: records requests or responses for audit
- `cost-tracking`: monitors or enforces spending limits
- `content-filtering`: filters or classifies content
- `compliance`: supports regulatory or organizational compliance

You can use any string value. There is no closed vocabulary. Choose tags that accurately describe what your integration does.

## Which sections apply to which types

All integration types use one template with type-specific sections. The template sections are designed to map directly to the [Tailscale docs integration-guide template](https://tailscale.com/docs/aperture/integrate) so that submissions can be imported with minimal restructuring.

### Required sections (all types)

| Section | Description |
|---|---|
| **Summary** | What this integration does and why. Write as a standalone paragraph. |
| **Prerequisites** | What the user needs from both sides (Aperture + external service). |
| **Setup and configuration** | Step-by-step instructions to configure the external service. Include working examples inline. |
| **Verify the integration** | How to confirm the integration is working. Include test steps and expected outcomes. |
| **Maintenance and support** | Who maintains this and how to get help. This section is submission-only and is not exported to the Tailscale docs site. |

### Hook-specific sections

Hook integrations (`pre_request_hook` and `post_response_hook`) use these sections:

| Section | Applies to | Description |
|---|---|---|
| **Hook definition** | All hooks | The hook entry in the Aperture config `hooks` map. Describe integration-specific field values and link to the protocol reference for the full field list. |
| **Grant wiring** | All hooks | The `send_hooks` entry that activates the hook. State whether the grant is in the Aperture config file or the tailnet policy file; config-file grants omit `dst`, while tailnet policy grants require it. |
| **Hook response format** | Pre-request hooks only | What actions the hook returns (allow, block, modify) with example responses. Include the cache impact note if the hook uses `modify`. Delete this section for post-response hooks. |

### Provider-specific sections

Provider integrations replace the hook-specific sections with:

| Section | Description |
|---|---|
| **Aperture provider configuration** | The provider entry in Aperture's top-level `providers` map, including its provider-specific `baseurl`, credential or authentication fields where applicable, and array-valued `models`. |
| **Grant access to provider models** | A grant that controls access to the configured provider. The grant capability field is `models`, with a string glob value. A grant does not define the provider. |

### Tool-specific sections

Tool integrations replace the hook-specific sections with:

| Section | Description |
|---|---|
| **Tool configuration** | The external tool's own verified setting names, with its API base URL pointed at Aperture, its model selected, and a placeholder API key only if the tool requires one. |
| **Grant access to the tool's models** | A grant that controls access to the models used by the tool. A grant does not configure the external tool. |

For either type, state whether each grant belongs in the Aperture config file or the tailnet policy file. Config-file grants omit `dst`; tailnet policy grants require it. Do not add `send_hooks` unless the integration genuinely also includes a hook.

### Optional sections (all types)

These sections are encouraged where applicable. Delete them if they don't apply:

- **Troubleshooting**: symptom/cause/resolution table. Encouraged for hook integrations where configuration issues are common.
- **Security considerations**: what data leaves the Aperture perimeter, credential handling, network path. Include this when the integration sends sensitive data to an external service.
- **Reference**: links to external documentation, guides, or API references.

### Dual-type integrations

Some integrations serve multiple roles through the same endpoint. For example, a service might act as a pre-request hook for synchronous enforcement and also as a post-response hook for asynchronous observability. For these cases, set `integration_type` to the primary type and list secondary types in the `additional_types` array:

```yaml
integration_type: pre_request_hook
additional_types: [post_response_hook]
```

The integration should be placed in the directory matching its primary type. Use `additional_types` only when the same endpoint genuinely handles multiple event types. Do not use it to list capabilities the integration does not directly provide to Aperture.

## Callouts and warnings

The template includes two kinds of guidance:

- **HTML comments** (`<!-- -->`) tell you what to write in each section. These do not render in the final document. Remove them when you are done.
- **GitHub callouts** (`> [!WARNING]`, `> [!NOTE]`, `> [!TIP]`, `> [!CAUTION]`) are visible in the rendered document and link to authoritative references (the [protocol quick reference](../docs/protocol-reference.md) and [Aperture documentation](https://tailscale.com/docs/aperture)). Keep the callouts that apply to your integration and delete the ones that do not. For example, delete the cache impact note if your hook does not use the `modify` action.

## How to use the template

1. Copy `integration.md` to the appropriate directory under `/integrations/`:
   - `integrations/hooks/pre-request/your-integration/README.md`
   - `integrations/hooks/post-response/your-integration/README.md`
   - `integrations/providers/your-integration/README.md`
   - `integrations/tools/your-integration/README.md`

   Use lowercase kebab-case for directory names (for example, `ssn-scrubber`, `my-integration`). The directory name should be a short, descriptive slug for the integration.

1. Fill in the frontmatter fields.

1. Write each section following the guidance in the HTML comments.

1. Keep relevant callouts, delete the ones that do not apply.

1. Add any supplemental files to the same directory as your README. This can include variant documentation (for example, different deployment modes), helper scripts, example code, or images. Reference all supplemental files from your README so readers can discover them.

1. Open a pull request against this repository. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full submission process.
