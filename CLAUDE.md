# Project Context

You are helping build and maintain `aperture-catalog`, a public GitHub repository under the Tailscale organization. This repo is the official submission surface for third-party Aperture integration documentation, examples, and templates.

## What is Aperture

Aperture is a Tailscale product that acts as a gateway/proxy layer for LLM traffic. It sits between users and LLM providers (Anthropic, OpenAI, etc.) and provides visibility, cost tracking, security guardrails, and policy enforcement for AI usage.

Aperture's core capabilities include:

- Proxying LLM API requests across multiple providers
- Cost tracking and usage reporting via a dashboard
- Grant-based access control (who can use which models, how much, etc.)
- Pre-request hooks that can inspect, modify, or block requests before they reach the LLM provider
- Post-response hooks that process completed requests asynchronously (fire-and-forget, for logging and auditing)
- Integration with Tailscale's networking layer (tailnets, grants, etc.)

Aperture is configured via a config file and can also have grants defined at the tailnet level in the Tailscale admin console.

## Webhook protocol

Hooks communicate via a JSON webhook protocol. See the [protocol quick reference](docs/protocol-reference.md) for the full specification, payload types, and configuration format.

### Core types

| Type | Package | Role |
|---|---|---|
| `HookCallData` | `proxy` | The JSON payload Aperture POSTs to every hook. Contains metadata and optional data fields controlled by the `send` list. |
| `GuardrailResponse` | `proxy` | The JSON a pre-request hook returns. Controls whether to allow, block, or modify the request. Post-response hooks' responses are not parsed. |
| `HookMetadata` | `proxy` | Always-present metadata nested in `HookCallData`: user identity, model, provider, request/session IDs. |
| `HookQuotaState` | `proxy` | Quota bucket state (balance, capacity, refill rate) in nanodollars. |
| `ToolUse` | `proxy/repository` | A single tool invocation: name + params. |
| `CostEstimate` | `proxy/repository` | Estimated dollar cost, pricing key, and token usage breakdown. |
| `UsageTokens` | `proxy/repository` | Token counts: input, output, cached, cache creation (with per-TTL breakdown), reasoning, image input, image output, web search. |
| `Hook` | `proxy/config` | Hook endpoint configuration: URL, auth, timeout, fail policy, preference. |
| `GrantSendHook` | `proxy/config` | Grant wiring: hook name, event types, send fields. |

### Event types

| Event | Timing | Behavior |
|---|---|---|
| `pre_request` | Before LLM provider | Synchronous. Hook returns `GuardrailResponse` with allow/block/modify. |
| `entire_request` | After response completes | Fire-and-forget. Response not parsed. |
| `tool_call_entire_request` | After response completes (if tool calls present) | Fire-and-forget. Response not parsed. |

### Valid send values

`tools`, `request_body`, `response_body`, `raw_responses`, `user_message`, `grants`, `estimated_cost`, `quotas`

### Key behavioral rules

- **Pre-request hooks modify requests, not responses**: The `modify` action replaces `request_body`. There is no mechanism to modify responses.
- **Hook ordering**: descending `preference`, then alphabetical by hook key name. A `block` stops the chain. A `modify` updates the body for subsequent hooks.
- **Grant merging**: if the same hook appears in multiple grants for a user, `events` and `send` are merged (union). The hook fires once, not once per grant.
- **Fail policy**: `fail_open` (default) skips unreachable hooks; `fail_closed` blocks with HTTP 503. Only affects pre-request hooks; post-response hooks always fail open.
- **Schema validation**: The published JSON Schema for `GuardrailResponse` sets `additionalProperties: false`, so unknown fields fail schema validation. At runtime, the proxy silently ignores unknown fields. `HookCallData` allows additional properties in both the schema and at runtime (forward-compatible).

## Why this repo exists

Aperture needs to enable a third-party ecosystem of integrations. The team is too small to author all integration docs. This repo provides a structured PR-based submission path for partners and community members.

## Who submits to this repo

External technical contributors: partners, vendors, or community members who have built something that works with Aperture. All PRs require internal review before merge.

## Integration types

| Type | Frontmatter value | Directory | Description |
|---|---|---|---|
| Pre-request hook | `pre_request_hook` | `integrations/hooks/pre-request/` | Synchronous hook that inspects, modifies, or blocks requests. Returns a `GuardrailResponse`. |
| Post-response hook | `post_response_hook` | `integrations/hooks/post-response/` | Fire-and-forget hook for logging, auditing, or analytics. Response not parsed. |
| Provider | `provider` | `integrations/providers/` | Documentation for using Aperture with a specific LLM provider. |
| Tool | `tool` | `integrations/tools/` | Documentation for using Aperture alongside a developer tool or platform. |

Some integrations support multiple event types through the same endpoint (for example, both pre-request enforcement and post-response observability). These use the `additional_types` frontmatter field to declare secondary types and are placed in the directory matching their primary `integration_type`.

Aperture also has a connectors system (MCP servers and HTTP APIs with OAuth2 support). Connector integrations are not yet accepted in this repo. When the feature exits its current flag, a `connector` integration type and directory may be added.

## Repository structure

```
/
├── README.md                          # Repo purpose, overview, quick start
├── CONTRIBUTING.md                    # Submission guidelines and review process
├── LICENSE                            # BSD 3-Clause
├── SPEC.md                            # Original requirements document
│
├── docs/
│   └── protocol-reference.md          # Contributor-focused protocol quick reference
│
├── templates/
│   ├── integration.md                 # Single unified template for all types
│   └── README.md                      # Template usage guide
│
├── integrations/
│   ├── hooks/
│   │   ├── pre-request/               # Pre-request hook integrations
│   │   │   └── ssn-scrubber/           # Reference example
│   │   │       ├── README.md          # Primary doc (required)
│   │   │       └── *.md|*.py|*.png    # Supplemental files (optional)
│   │   └── post-response/              # Post-response hook integrations
│   ├── providers/                     # Provider integrations
│   └── tools/                         # Tool/platform integrations
│
└── .github/
    ├── CODEOWNERS
    ├── PULL_REQUEST_TEMPLATE.md
    ├── ISSUE_TEMPLATE/
    ├── copilot-instructions.md
    ├── instructions/               # AI review checklists
    ├── scripts/validate-integration/   # Deterministic validation CI
    ├── scripts/staleness-review/        # Link checking and deprecation escalation
    └── workflows/                      # CI workflow definitions
```

## Important technical context

**Grant `dst` key**: Tailnet grants (in the tailnet policy file) require an explicit `dst` key. Omitting it causes the grant to silently apply to nothing. Config-file grants do not use `dst`. Integration docs that show tailnet grant examples must include the `dst` key and warn about this; config-file grant examples should omit it.

**Cache sensitivity**: Pre-request hooks that use the `modify` action to rewrite request content invalidate the LLM provider's cache. The next request incurs a cache miss (up to 10x cost). Integration docs for modifying hooks must include the cache impact note.

**Pricing**: Aperture cost tracking is always an estimate. Integration docs should not make precise cost claims.

## Voice and tone

- Technical, clear, and direct
- Assume the reader is a developer
- No marketing language
- Working examples over abstract descriptions

## Development workflow

- Use `git commit --signoff` for all commits
- Review the [reference example](integrations/hooks/pre-request/ssn-scrubber/) before creating new content
- Cross-reference the [protocol quick reference](docs/protocol-reference.md) when writing hook integration docs
- Use canonical type names (`HookCallData`, `GuardrailResponse`, `GrantSendHook`) when referring to protocol concepts
