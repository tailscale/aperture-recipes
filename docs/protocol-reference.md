# Guardrail Webhook Protocol Quick Reference

This is the protocol reference for the Aperture guardrail webhook. It covers
everything you need to write a hook integration for this repository.

---

## How hooks work

Aperture calls your webhook by POSTing a `HookCallData` JSON payload. For
pre-request hooks, your webhook returns a `GuardrailResponse` JSON body. For
post-response hooks, Aperture does not read your response (fire-and-forget).

```
User -> Aperture -> [POST HookCallData] -> Your Hook -> [GuardrailResponse] -> Aperture -> LLM
```

## Timing modes

| Mode | When | Synchronous? | Can affect request? |
|---|---|---|---|
| Pre-request | Before the request reaches the LLM provider | Yes | Yes - allow, block, or modify the request |
| Post-response | After the LLM response completes | No (fire-and-forget) | No - response not parsed |

## Event types

Use these values in the `events` array of a `GrantSendHook`.

### GrantSendHook fields

| Field | Type | Description |
|---|---|---|
| `name` | string | Hook key name (must match a key in the config file `hooks` map) |
| `events` | array of strings | Event types that trigger this hook (see table below) |
| `send` | array of strings | Data fields to include in the `HookCallData` payload (see [send values](#optional-fields-controlled-by-send-list)) |

| Event | Timing | Description |
|---|---|---|
| `pre_request` | Pre-request | Fires before the LLM provider receives the request. Hook returns a `GuardrailResponse`. |
| `entire_request` | Post-response | Fires once after every request completes. For logging and auditing. |
| `tool_call_entire_request` | Post-response | Fires once after the request completes, but only if the LLM response contained tool calls. |

## HookCallData - what your hook receives

Every hook receives a `HookCallData` JSON payload via HTTP POST. It always
contains `metadata`. Other fields are included only if they appear in the
hook's `send` list.

### Metadata (always present)

These fields follow the `HookMetadata` type.

| Field | Type | Description |
|---|---|---|
| `login_name` | string | Tailscale login name (for example, `"alice@example.com"`) |
| `user_agent` | string | HTTP User-Agent from the original request |
| `url` | string | The request URL |
| `model` | string | LLM model identifier (for example, `"claude-sonnet-4-20250514"`) |
| `provider` | string | Provider identifier (for example, `"anthropic"`, `"openai"`) |
| `tailnet_name` | string | Tailscale tailnet name |
| `stable_node_id` | string | Tailscale stable node ID |
| `request_id` | string | Unique request identifier |
| `session_id` | string | Session identifier grouping related requests |

### Optional fields (controlled by `send` list)

| Send value | HookCallData field | Type | Description |
|---|---|---|---|
| `request_body` | `request_body` | any JSON | The raw request body sent to the LLM provider (provider-native format) |
| `response_body` | `response_body` | any JSON | Complete response body assembled from the provider's streamed response |
| `raw_responses` | `raw_responses` | array of any JSON | Parsed SSE message data from the LLM response |
| `user_message` | `user_message` | string | Last user message extracted from the request |
| `tools` | `tool_calls` | array of `ToolUse` | Tool invocations from the LLM response |
| `grants` | `metadata.grants` | object | Third-party grant capabilities (opaque JSON) |
| `estimated_cost` | `metadata.estimated_cost` | `CostEstimate` | Estimated dollar cost and token usage |
| `quotas` | `metadata.quotas` | object | Quota bucket states (balance, capacity, rate) |

Note: the send value `tools` maps to the field `tool_calls`. All other send
values match their field names.

The send values `response_body`, `raw_responses`, and `tools` (field
`tool_calls`) are only populated for `entire_request` and
`tool_call_entire_request` events. Including them in a `pre_request` hook's
`send` list has no effect.

### ToolUse shape

Each entry in the `tool_calls` array has this shape:

```json
{
  "name": "function_name",
  "params": { "key": "value" }
}
```

- `name` (string) - the tool/function name
- `params` (object) - the tool input parameters

### CostEstimate shape

The `estimated_cost` field in metadata has this shape:

```json
{
  "dollars": 0.0042,
  "cost_basis": "anthropic/claude-sonnet-4-6",
  "usage": {
    "input_tokens": 150,
    "output_tokens": 50,
    "cached_tokens": 0
  }
}
```

- `dollars` (number) - estimated cost in US dollars
- `cost_basis` (string) - pricing source in `provider/model` format (for example, `"anthropic/claude-sonnet-4-6"`). The provider prefix matches the cost basis service: `anthropic`, `openai`, `google`, `vertex`, `bedrock`, `bedrock-us`, `bedrock-eu`, `bedrock-ap`, `azure`, `azure-eu`, `openrouter`, `vercel`.
- `usage` (object) - token breakdown. This object follows the `UsageTokens` type. Fields (all `omitempty`, only populated values appear):

  | Field | Type | Description |
  |---|---|---|
  | `input_tokens` | integer | Input tokens |
  | `output_tokens` | integer | Output tokens |
  | `cached_tokens` | integer | Tokens read from provider cache |
  | `cache_creation_input_tokens` | integer | Total cache creation tokens |
  | `cache_creation_5m_input_tokens` | integer | Cache creation tokens (5-minute TTL) |
  | `cache_creation_1h_input_tokens` | integer | Cache creation tokens (1-hour TTL) |
  | `reasoning_tokens` | integer | Reasoning/thinking tokens |
  | `image_input_tokens` | integer | Image input tokens |
  | `image_output_tokens` | integer | Image output tokens |
  | `web_search_count` | integer | Web search tool invocations |

### HookQuotaState shape

The `quotas` field in metadata is keyed by quota bucket name. Values use
nanodollars (10^-9 dollars, integer) for `current` and `capacity`. The `rate`
field is a human-readable string.

```json
{
  "daily:alice@example.com": {
    "current": 5000000000,
    "capacity": 10000000000,
    "rate": "$5.00/day"
  }
}
```

- `current` (integer) - current balance remaining in nanodollars
- `capacity` (integer) - quota limit in nanodollars
- `rate` (string) - human-readable rate description

### Custom app capabilities

Grants can include capability keys beyond `tailscale.com/cap/aperture`. When a hook includes `"grants"` in its `send` array, these custom capabilities appear in `metadata.grants`. External systems (policy engines, audit logs) can use them for authorization decisions.

Example grant with a custom capability:

```json
{
  "src": ["alice@example.com"],
  "dst": ["tag:aperture"],
  "app": {
    "tailscale.com/cap/aperture": [
      { "models": "**" },
      {
        "send_hooks": [
          {
            "name": "policy-engine",
            "events": ["entire_request"],
            "send": ["grants"]
          }
        ]
      }
    ],
    "mycompany.com/cap/policy": [
      { "tier": "enterprise", "department": "engineering" }
    ]
  }
}
```

> [!IMPORTANT]
> Tailnet policy grants require a `dst` key. Omitting it causes the grant to
> silently apply to nothing. See [Grant wiring](#2-grant-wiring-in-tailscale-grants)
> for details.

The hook receives:

```json
{
  "metadata": {
    "login_name": "alice@example.com",
    "grants": {
      "mycompany.com/cap/policy": [
        { "tier": "enterprise", "department": "engineering" }
      ]
    }
  }
}
```

> [!NOTE]
> See [Custom app capabilities](https://tailscale.com/docs/aperture/configuration#custom-app-capabilities) in the Aperture documentation.
> See [Manage AI spending](https://tailscale.com/docs/aperture/manage-spending) in the Aperture documentation for quota bucket configuration and enforcement behavior.

### Example HookCallData

A pre-request hook with `"send": ["request_body", "user_message"]` receives:

```json
{
  "metadata": {
    "login_name": "alice@example.com",
    "user_agent": "claude-code/1.0",
    "url": "https://aperture.tail1234.ts.net/v1/messages",
    "model": "claude-sonnet-4-20250514",
    "provider": "anthropic",
    "tailnet_name": "example.ts.net",
    "stable_node_id": "nSTABLE123",
    "request_id": "req_abc123",
    "session_id": "sess_xyz789"
  },
  "request_body": {
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 4096,
    "messages": [
      {"role": "user", "content": "Write a function that sorts a list"}
    ]
  },
  "user_message": "Write a function that sorts a list"
}
```

## GuardrailResponse - what your pre-request hook returns

Only pre-request hooks return a parsed response. Post-response hooks' responses
are drained but ignored.

| Field | Type | Required? | Description |
|---|---|---|---|
| `action` | string | Yes | `"allow"`, `"block"`, or `"modify"` |
| `status_code` | integer | No | HTTP status code for `block` (default 403) |
| `message` | string | No | Error message for `block` |
| `request_body` | any JSON | No | Replacement request body for `modify` |

The schema sets `additionalProperties: false` as a JSON Schema constraint for
optional client-side validation. If you validate your response against the
schema before sending, typos like `"staus_code"` are caught immediately. At
runtime, the proxy silently ignores unknown fields.

### Action examples

**Allow** (let the request proceed):

```json
{"action": "allow"}
```

**Block** (reject with an error):

```json
{
  "action": "block",
  "status_code": 403,
  "message": "Request blocked: contains disallowed content"
}
```

**Modify** (rewrite the request body):

```json
{
  "action": "modify",
  "request_body": {
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 2048,
    "messages": [
      {"role": "user", "content": "[Modified] Write a function that sorts a list"}
    ]
  }
}
```

The `modify` action replaces the **entire** request body. It does not patch
individual fields.

### Block error envelopes

When a pre-request hook blocks a request, Aperture returns a provider-specific error response to the client:

| API format | Error envelope |
|---|---|
| OpenAI Chat / Responses | `{"error": {"message": "...", "type": "guardrail_blocked"}}` |
| Anthropic Messages | `{"type": "error", "error": {"type": "invalid_request_error", "message": "..."}}` |
| Gemini / Vertex | `{"error": {"code": ..., "message": "...", "status": "PERMISSION_DENIED"}}` |
| Bedrock Invoke / Converse | Header `x-amzn-ErrorType: AccessDeniedException`; body `{"message": "..."}` |

The `status_code` and `message` from your `GuardrailResponse` populate the `...` fields. The envelope structure is determined by the API format of the original request.

## HTTP mechanics

Aperture POSTs JSON to your hook endpoint with `Content-Type: application/json`.
Your hook should return HTTP 200 with a JSON body (`Content-Type: application/json`).
For pre-request hooks, the body must be a valid `GuardrailResponse`. For
post-response hooks, the body is drained but ignored.

Non-2xx responses trigger the hook's fail policy: `fail_open` skips the hook,
`fail_closed` blocks the request with HTTP 503. Post-response hooks always fail
open regardless of the configured policy.

## Hook configuration

Aperture hook configuration has two parts.

### 1. Hook endpoint (in config file)

Defines where to send the webhook and how to authenticate:

```json
{
  "hooks": {
    "my-hook": {
      "url": "https://hooks.example.com/filter",
      "apikey": "sk-guard-abc123",
      "authorization": "bearer",
      "timeout": "10s",
      "fail_policy": "fail_closed",
      "preference": 100
    }
  }
}
```

| Field | Default | Description |
|---|---|---|
| `url` | (required) | HTTP(S) endpoint to POST to |
| `apikey` | `""` | Credential for authentication |
| `authorization` | `"bearer"` | How the key is sent (see table below) |
| `timeout` | `"5s"` | Max wait time (Go duration string) |
| `disabled` | `false` | Skip this hook without removing it |
| `fail_policy` | `"fail_open"` | `"fail_open"`: skip on error. `"fail_closed"`: block with HTTP 503. Only affects pre-request hooks. |
| `preference` | `0` | Sort priority. Higher runs first. Ties break alphabetically by key. |

**Authentication header mapping:**

| `authorization` value | HTTP header sent |
|---|---|
| `bearer` | `Authorization: Bearer <apikey>` |
| `x-api-key` | `X-Api-Key: <apikey>` |
| `x-goog-api-key` | `X-Goog-Api-Key: <apikey>` |

### 2. Grant wiring (in Tailscale grants)

Controls which users trigger the hook and what data it receives:

```json
{
  "grants": [
    {
      "src": ["group:engineering"],
      "dst": ["tag:aperture"],
      "app": {
        "tailscale.com/cap/aperture": [
          {
            "models": "anthropic/**",
            "send_hooks": [
              {
                "name": "my-hook",
                "events": ["pre_request"],
                "send": ["request_body", "user_message"]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

> [!IMPORTANT]
> **The `dst` key is required in tailnet grants**: Omitting it causes the grant
> to silently apply to nothing. Always include `"dst": ["tag:aperture"]` (or
> your Aperture node's tag).

**Model scoping** uses FQN glob patterns (`provider/model`):

- `"anthropic/**"` - all Anthropic models
- `"openai/gpt-4*"` - OpenAI GPT-4 variants
- `"**"` - all providers and models

### Grant capability fields

Each object inside the `tailscale.com/cap/aperture` array is an `ApertureGrant`. The fields most relevant to integration authors are `models` and `send_hooks` (shown above). The full set of fields:

| Field | Type | Description |
|---|---|---|
| `models` | string | Provider/model FQN glob pattern (for example, `"anthropic/**"`) |
| `send_hooks` | array | Hook wiring entries (see grant wiring above) |
| `role` | string | `"admin"` or `"user"` |
| `quotas` | array | Quota bucket references (for example, `[{"bucket": "daily:<user>"}]`) |
| `add_headers` | array of strings | Extra headers injected into upstream LLM requests (for example, `"X-Project: myproject"`) |
| `mcp_tools` | string | MCP tool FQN glob pattern (for example, `"server/tool_name"`) |
| `mcp_resources` | string | MCP resource FQN glob pattern |
| `mcp_templates` | string | MCP resource template FQN glob pattern |
| `enable_chat_ui` | boolean | Allow access to the Aperture chat UI |
| `read_metrics` | boolean | Allow access to Prometheus metrics |
| `set_cors` | boolean | Enable CORS for matching requests |
| `cors_paths` | array of strings | URL glob patterns for CORS |
| `Access-Control-Allow-Origin` | string | CORS allowed origin |
| `Access-Control-Allow-Methods` | string | CORS allowed methods |
| `Access-Control-Allow-Headers` | string | CORS allowed headers |

Most integration submissions only need `models` and `send_hooks`. The other fields are documented here for completeness.

> [!NOTE]
> See [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration#grants) in the Aperture documentation for the full grant specification.

**Grant merging**: if the same hook appears in multiple grants for a user, the
`events` and `send` lists are merged (union). The hook fires once per request.

## Hook ordering and chain behavior

When multiple pre-request hooks match a request:

1. Hooks are sorted by descending `preference`, then alphabetically by key.
1. Each hook runs sequentially.
1. `"allow"`: proceed to next hook.
1. `"block"`: stop the chain. Return error to user.
1. `"modify"`: replace request body. Next hook sees the modified body.

> [!NOTE]
> See [Guardrails](https://tailscale.com/docs/aperture/guardrails) in the Aperture documentation for conceptual guardrail guidance and failure behavior recommendations.

## Failure handling

| Scenario | `fail_open` | `fail_closed` |
|---|---|---|
| Hook unreachable | Skip, continue | Block (HTTP 503) |
| Non-2xx response | Skip, continue | Block (HTTP 503) |
| Invalid JSON response | Skip, continue | Block (HTTP 503) |
| Timeout | Skip, continue | Block (HTTP 503) |

Post-response hooks always fail open (they cannot affect the request).

## Validating your hook responses

A `GuardrailResponse` must have an `action` field set to `"allow"`, `"block"`, or `"modify"`. Unknown fields are silently ignored at runtime, but will break client-side validation if you use strict schema checking. Validate your responses in tests by checking:

1. The `action` field is one of the three valid values.
1. `status_code` is present only with `"block"` and is a valid HTTP status code.
1. `request_body` is present only with `"modify"` and contains a complete, valid request body.
1. No unrecognized fields are present (catches typos like `"staus_code"`).

## Cache impact of request modification

Any modification to request content, even a single byte, invalidates the
LLM provider's cache. The next request for the same content incurs a cache
miss, which can cost up to 10x more. For Anthropic, the default cache TTL is
5 minutes (extendable to 1 hour via header at 2x the base input token
cost).

If your hook uses the `modify` action, document this tradeoff.

> [!NOTE]
> See [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration#hooks) in the Aperture documentation for the full hook specification and provider-specific details.
