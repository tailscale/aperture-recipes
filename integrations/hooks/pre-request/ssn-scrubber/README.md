---
name: "SSN Scrubber Guardrail"
provider: "Tailscale"
provider_url: "https://tailscale.com"
integration_type: pre_request_hook
status: official
date_submitted: 2026-05-24
tags: [guardrail, security, pii-redaction]
---

# SSN Scrubber Guardrail

## Summary

A **guardrail** in Aperture is a `pre_request` hook, a synchronous HTTP endpoint
that Aperture calls *before* forwarding a request to the LLM. The proxy waits for
the hook's response and acts on it before any data leaves your network.

The `ssn-scrubber` example demonstrates the protocol and configuration for a
common guardrail pattern: inspecting and either redacting or blocking PII in
the user's message before it reaches the model. This repository does not ship
or host an SSN scrubber endpoint. The configuration and tests below exercise
an endpoint that you implement and deploy.

## Prerequisites

- A running [Aperture](https://tailscale.com/docs/aperture) instance configured with at least one LLM provider
- An HTTP endpoint that inspects request content and returns a [`GuardrailResponse`](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns)

## Setup and configuration

Implement and deploy an HTTP endpoint that recognizes SSN-shaped text and returns the documented `GuardrailResponse`. Configure it to either redact the matched text with `[REDACTED]` or block the request. The endpoint must accept Aperture's [`HookCallData`](../../../../docs/protocol-reference.md#hookcalldata---what-your-hook-receives); this repository provides documentation only, not a runnable implementation.

## Hook definition

Add the hook to the `hooks` map in your Aperture config:

```json
"hooks": {
  "ssn-scrubber": {
    "url": "http://ssn-guard.example.ts.net:8080/scrub",
    "apikey": "<HOOK_API_KEY>",
    "fail_policy": "fail_closed",
    "timeout": "500ms",
    "preference": 10
  }
}
```

### Hook fields

| Field         | Required | Description |
|---------------|----------|-------------|
| `url`         | Yes      | HTTP(S) endpoint Aperture will POST to. Can be on the public internet or on the tailnet. |
| `apikey`      | No       | Credential sent with the hook request for authentication. |
| `authorization` | No     | How the API key is sent: `"bearer"` (default), `"x-api-key"`, or `"x-goog-api-key"`. |
| `fail_policy` | No       | What to do when the hook endpoint is unreachable. `"fail_open"` (default) lets the request proceed; `"fail_closed"` blocks it. |
| `timeout`     | No       | How long Aperture waits for the hook to respond before applying `fail_policy`. Accepts Go duration strings (e.g. `"500ms"`, `"3s"`). |
| `preference`  | No       | Execution order when multiple hooks are stacked on the same request. Higher runs first; default is `0`. Hooks with equal preference run in alphabetical order by key. |
| `disabled`    | No       | Set to `true` to temporarily disable the hook without removing it. |

## Grant wiring

Hooks do nothing until they are referenced in a grant's `send_hooks` list.

```json
"grants": [
  {
    "src": ["*"],
    "app": {
      "tailscale.com/cap/aperture": [
        { "models": "**" },
        {
          "send_hooks": [
            {
              "name": "ssn-scrubber",
              "events": ["pre_request"],
              "send": ["request_body", "user_message"]
            }
          ]
        }
      ]
    }
  }
]
```

### `send_hooks` fields

| Field    | Description |
|----------|-------------|
| `name`   | Key that matches an entry in the top-level `hooks` map. |
| `events` | List of event types that trigger this hook. Use `"pre_request"` for guardrails. Other options: `"tool_call_entire_request"`, `"entire_request"` (audit/logging). |
| `send`   | Data included in the hook POST body. Common values: `"request_body"` (full request sent to LLM), `"user_message"` (extracted last user prompt), `"tools"`, `"raw_responses"`, `"response_body"`, `"estimated_cost"`, `"grants"`, `"quotas"`. |

> **Note:** `"request_body"` is required when the hook may return a `"modify"` action,
> because the modified body replaces the original request wholesale.

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. Config-file grants do not use `dst`; omit it there. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Hook response format

Your hook endpoint must return JSON with an `"action"` field:

### Allow (pass through unchanged)

```json
{ "action": "allow" }
```

### Block (reject the request)

```json
{
  "action": "block",
  "message": "Request blocked: SSN detected in prompt."
}
```

Aperture returns an error to the client; the message is included in the response.

### Modify (rewrite the request before forwarding)

```json
{
  "action": "modify",
  "request_body": { ...redacted request object... }
}
```

Whatever you return as `request_body` **replaces** what Aperture would have sent
to the LLM. Requires `"request_body"` in the grant's `send` list.

> [!NOTE]
> **Cache impact**: If your implementation modifies only the current user message (content the LLM provider has not yet received), there is no prompt cache impact. If it modifies historical context (earlier messages already cached by the provider), it invalidates the cache and can increase estimated costs. Refer to the [protocol quick reference](../../../../docs/protocol-reference.md#cache-impact-of-request-modification) for details.

## Execution order (stacking multiple hooks)

When multiple hooks target the same request:

1. Hooks run in **descending `preference` order** (highest first).
1. Equal-preference hooks run in **alphabetical key order**.
1. Set `preference` on the hook definition to override alphabetical order.

## Verify the integration

These tests verify your deployed implementation, not code supplied by this repository. Replace the placeholder values, then run both requests through Aperture:

```bash
APERTURE_URL="http://<aperture-host>"
MODEL="<configured-model>"
```

1. Send a control request that contains no SSN-shaped text:

   ```bash
   curl -sS -i "${APERTURE_URL}/v1/chat/completions" \
     -H "Content-Type: application/json" \
     -d "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Summarize this sentence.\"}]}"
   ```

   **Pass:** Aperture returns the provider's normal successful response, and the hook logs show an `allow` decision. **Fail:** the request is blocked, modified, or never reaches the hook.

1. Send a trigger request using `000-12-3456`. This value is clearly fictitious and is not a valid SSN, but it has the shape the test rule should detect:

   ```bash
   curl -sS -i "${APERTURE_URL}/v1/chat/completions" \
     -H "Content-Type: application/json" \
     -d "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Test value: 000-12-3456\"}]}"
   ```

   **Redaction mode pass:** the hook returns `modify`; the provider-bound request contains `[REDACTED]` and does not contain `000-12-3456`; Aperture returns the provider's normal response. **Blocking mode pass:** Aperture returns the status and message from the hook's `block` response, and provider logs show that no request was forwarded. **Fail:** the provider-bound request contains `000-12-3456`, or the result does not match the configured mode.

Inspect hook logs and provider request logs, or use a test provider that records its input, rather than relying on generated model text to prove redaction.

## Troubleshooting

| Symptom | Check |
|---|---|
| No hook request arrives | Confirm Aperture can resolve and reach the hook URL, the port is listening, and the endpoint path and API-key handling match the hook definition. |
| Only some users or models trigger the hook | Confirm the request matches the grant's `src` and `models`, the `send_hooks` name matches the `hooks` key, and `events` includes `pre_request`. Tailnet grants also require a matching `dst`; config-file grants omit it. |
| Aperture returns `503` when the hook is unavailable | `fail_closed` intentionally blocks on delivery failure or timeout. Restore the endpoint or use `fail_open` only if bypassing the scrubber is acceptable. |
| A redacted request is rejected or loses fields | A `modify` response replaces the entire request body. Return a complete, provider-valid `request_body`, preserving every required field and changing only the intended content. Also include `request_body` in `send`. |

## Maintenance and support

- **Maintainer**: Tailscale Aperture team
- **Contact**: [Tailscale support](https://tailscale.com/contact/support)
- **Issue reporting**: File issues in this repository

## Reference

- Configuration reference: <https://tailscale.com/docs/aperture/configuration#hooks>
- Hook response format: <https://tailscale.com/docs/aperture/configuration#hook-response-format>
- How-to guide: <https://tailscale.com/docs/aperture/how-to/build-custom-webhook>
