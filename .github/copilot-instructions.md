# Copilot Instructions for aperture-recipes

## What this repo is

This is the official submission surface for third-party Aperture integration documentation. Aperture is a Tailscale product that acts as a gateway/proxy for LLM traffic, providing visibility, cost tracking, security guardrails, and policy enforcement for AI usage.

External contributors submit integration docs via PR. All submissions are reviewed before merge.

## Repository layout

```
integrations/
  hooks/
    pre-request/     # Pre-request hook integrations (synchronous, returns GuardrailResponse)
    post-response/   # Post-response hook integrations (fire-and-forget)
  providers/         # LLM provider integrations
  tools/             # Developer tool/platform integrations
templates/
  integration.md     # Unified template all submissions must follow
docs/
  protocol-reference.md  # Webhook protocol spec (HookCallData, GuardrailResponse, etc.)
.github/
  scripts/validate-integration/  # Deterministic validation CI (structure, callouts, links)
  workflows/validate-integration.yml  # CI workflow for auto-fix validation
```

## Integration types

| Type | Frontmatter value | Directory |
|---|---|---|
| Pre-request hook | `pre_request_hook` | `integrations/hooks/pre-request/` |
| Post-response hook | `post_response_hook` | `integrations/hooks/post-response/` |
| Provider | `provider` | `integrations/providers/` |
| Tool | `tool` | `integrations/tools/` |

## Terminology rules

- Never use "ACL" in any context. ACLs are deprecated. Use "grants" or "tailnet policy file" instead.
- Use canonical type names when referring to protocol concepts: `HookCallData`, `GuardrailResponse`, `HookMetadata`, `HookQuotaState`, `UsageTokens`, `ToolUse`, `CostEstimate`, `GrantSendHook`.

## Validation

The repo has one CI workflow (`validate-integration.yml`) that runs deterministic checks on PRs touching `integrations/`:

- **Structure**: verifies correct directory placement and required H2 sections
- **Callouts**: injects missing `dst` key warning and cache impact note where required
- **Links**: checks that internal relative links resolve to existing files

This workflow auto-fixes what it can (missing sections, missing callouts) and comments on what it cannot.

## Required frontmatter fields

Every integration README must have YAML frontmatter with: `name`, `provider`, `provider_url`, `integration_type`, `date_submitted`. Optional: `status` (defaults to `community`), `additional_types`, `tags`.

Valid `integration_type` values: `pre_request_hook`, `post_response_hook`, `provider`, `tool`.
Valid `status` values: `community`, `official`, `deprecated`.

## Required sections

All integrations: Summary, Prerequisites, Setup and configuration, Verify the integration, Maintenance and support.

Hook integrations (`pre_request_hook`, `post_response_hook`) additionally require: Hook definition, Grant wiring. Pre-request hooks also require: Hook response format.

Non-hook integrations (`provider`, `tool`) use a single Aperture configuration section instead of the hook-specific sections.

Optional sections (delete if not applicable): Troubleshooting, Security considerations, Reference.

## Two critical gotchas reviewers must check

1. **`dst` key in grants**: Tailnet grants require an explicit `dst` key. Omitting it causes the grant to silently apply to nothing. Any submission with grant examples must warn about this.

2. **Cache impact of `modify` action**: Pre-request hooks that use the `modify` action can affect the LLM provider's prompt cache, but only when modifying historical context (earlier messages already cached by the provider). Modifying the current turn's content has no cache impact. Any pre-request hook mentioning `modify` must include the cache impact callout explaining this distinction.

## Voice and tone

- Technical, clear, direct
- Assume the reader is a developer
- No marketing language
- Working examples over abstract descriptions
- Config snippets should show enough to adapt, not reproduce full Aperture configs
