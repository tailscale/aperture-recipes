---
name: Highflame
provider: Highflame
provider_url: 'https://highflame.ai'
integration_type: pre_request_hook
additional_types:
  - post_response_hook
status: community
date_submitted: '2026-05-24'
tags:
  - security
  - observability
  - policy-enforcement
  - tool-call-monitoring
---

# Highflame

## Summary

Highflame is a security and observability platform that integrates with Aperture hooks to enforce Shield policies on LLM traffic. It supports two modes through the same endpoint: synchronous `pre_request` enforcement that allows or blocks requests before they reach the provider, and asynchronous post-response observability (`tool_call_entire_request` or `entire_request`) that records completed requests for audit and telemetry. This gives Aperture operators centralized policy enforcement and visibility over LLM usage without modifying client applications. Organizations using Aperture to proxy LLM traffic need a way to apply security policies (prompt injection detection, secrets scanning, content filtering) and to get visibility into tool-call behavior across their fleet. Highflame provides a managed policy engine (Shield) that plugs directly into Aperture's hook system, letting teams start with observation-only policies and graduate to active blocking as confidence grows.

Refer to the [Highflame documentation](https://docs.highflame.ai/integrations/tailscale/setup-guide) for more details on the integration and its capabilities. The rest of this README provides step-by-step setup instructions, configuration guidance, troubleshooting tips, and security considerations for using Highflame with Aperture hooks.

## Prerequisites

- A Tailscale tailnet with [Aperture](https://tailscale.com/docs/aperture) deployed and configured with at least one LLM provider
- A [Highflame](https://console.highflame.ai/) account with an active project
- A Highflame agent or service API key
- A Shield policy configured for the project
- Access to the Aperture settings UI at `http://<aperture-host>/ui/`

## Setup and configuration

1. **Generate a Highflame API key.**

   Log in to the [Highflame Platform](https://console.highflame.ai/). Navigate to **Code Agents > Getting Started** and click the **Tailscale Aperture** card to generate an API key.

   Keep the key secure. You will paste it into the Aperture hook configuration in the next step.

1. **Configure Shield policy behavior.**

   Highflame does not force a mode from the Aperture hook side. Your Shield policy configuration decides whether a request is monitored or enforced:

   - **Monitor mode** logs would-block events while still returning `{"action":"allow"}` to Aperture for synchronous hooks.
   - **Enforce mode** returns `{"action":"block"}` to Aperture and stops synchronous `pre_request` traffic before it reaches the provider.
   - **Asynchronous hooks** always run after the provider response, so they are for visibility and audit rather than inline blocking.

   This lets you start with observation-only policies and move selected policies to blocking mode without changing the Aperture hook configuration.

### Example: Basic request through Aperture

Use your Aperture base URL as the OpenAI-compatible endpoint. For clients running inside your tailnet, Aperture URLs commonly use `http://` because Tailscale already encrypts the connection.

```bash
curl -i http://<aperture-host>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "Summarize why pre-request hooks are useful."
      }
    ]
  }'
```

A successful request means Aperture forwarded the request to the provider (and Highflame allowed it, if sync mode is active). To verify the Highflame evaluation, check the Highflame dashboard for a `process_prompt` event from source `aperture`.

### Example: Tool-call request

Use a tool definition to verify asynchronous tool-call observability:

```bash
curl -i http://<aperture-host>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": "What is the weather in Delhi?"
      }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get weather for a city",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```

With `pre_request`, Highflame evaluates the prompt before the provider generates a tool call. With `tool_call_entire_request`, Highflame receives the completed request and extracted tool calls after the provider response.

## Hook definition

Add the hook to the `hooks` map in your Aperture config:

```json
"hooks": {
  "highflame": {
    "url": "https://cerberus.api.highflame.ai/v1/agent/events",
    "apikey": "<HIGHFLAME_API_KEY>",
    "timeout": "30s",
    "fail_policy": "fail_open"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `url` | Yes | Highflame endpoint for Aperture hook events. |
| `apikey` | Yes | Your Highflame agent or service API key. Aperture sends it with the hook request so Highflame can resolve the tenant and project. |
| `timeout` | No | How long Aperture waits before timing out the hook request. |
| `fail_policy` | No | `fail_open` means a temporary Highflame-side issue does not block your users' LLM requests. |

## Grant wiring

Wire the hook to a grant using `send_hooks`. Choose your hook mode based on whether you need inline enforcement, post-response observability, or both.

**Sync mode (pre-request enforcement):**

Use `pre_request` when Highflame should make an allow/block decision before Aperture forwards the request to the provider:

```json
"send_hooks": [
  {
    "name": "highflame",
    "events": ["pre_request"],
    "send": ["user_message", "request_body"]
  }
]
```

**Async mode (post-response observability):**

Use `tool_call_entire_request` when Highflame should observe completed requests that produced tool calls:

```json
"send_hooks": [
  {
    "name": "highflame",
    "events": ["tool_call_entire_request"],
    "send": [
      "user_message",
      "tools",
      "request_body",
      "response_body",
      "raw_responses",
      "estimated_cost"
    ]
  }
]
```

To get an audit event for every completed request (even when no tools are called), use `entire_request` instead of `tool_call_entire_request`.

**Combined mode:** You can wire both modes in the same `send_hooks` array to get inline enforcement and post-response observability from a single hook endpoint.

To limit which users or models trigger Highflame evaluation, narrow the `src` or `models` fields in the surrounding grant rather than using wildcards.

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

> [!NOTE]
> The `send` array in your grant wiring controls exactly what data your hook receives. Review the [send field reference](../../../../docs/protocol-reference.md#optional-fields-controlled-by-send-list) to understand what each value exposes.

## Hook response format

Highflame returns a [`GuardrailResponse`](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns) with `allow` or `block` only. It does not use the `modify` action, so it does not alter request bodies and does not affect LLM provider cache behavior.

### Allow (pass through unchanged)

```json
{"action": "allow"}
```

### Block (reject the request)

```json
{"action": "block", "status_code": 403, "message": "<policy explanation>"}
```

Aperture returns an error to the client; the message is included in the response. For asynchronous hooks, Aperture ignores the response body.

## Verify the integration

1. Configure the Highflame hook endpoint and grant wiring as described in [Hook definition](#hook-definition).

1. Send a benign request through Aperture and confirm it succeeds:

   ```bash
   curl -i http://<aperture-host>/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4o",
       "messages": [
         {"role": "user", "content": "Hello, what can you help me with?"}
       ]
     }'
   ```

1. Check the Highflame dashboard for a `process_prompt` event from source `aperture`.

1. If using sync mode with an enforce-mode Shield policy, send a request that should trigger a block and confirm Aperture returns a 403 with the policy explanation in the response body.

1. If using async mode with tool-call observability, send the tool-call example from [Setup and configuration](#setup-and-configuration) and confirm the tool call appears in the Highflame Code Agents session view.

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| No events appear in Highflame | The hook grant is not firing. | Confirm the grant uses `send_hooks`, confirm the event name matches your intended mode, and confirm your client traffic is routed through Aperture. |
| No events appear in Highflame | The hook URL is wrong. | Use `https://cerberus.api.highflame.ai/v1/agent/events`. |
| Highflame returns auth or tenant resolution errors | The hook API key is missing, malformed, or not associated with the expected agent/project. | Regenerate the key in Highflame and update the Aperture `apikey` field. |
| Benign prompts are blocked | No baseline permit policy matches the request, so Cedar defaults to deny. | Enable or restore the baseline permit policy for the tenant/project, then retry. |
| Policy appears to deny, but Aperture still allows the request | The matching Shield policy is in monitor mode. | This is expected. Monitor mode records `actual_decision=deny` telemetry while returning `{"action":"allow"}` to Aperture. |
| Policy denies appear in Highflame but the client request was not blocked | The hook event is asynchronous (`tool_call_entire_request` or `entire_request`). | This is expected. Async hooks run after the provider response and cannot block the request. |
| Aperture hook times out | Highflame is unreachable or Shield/AuthN latency exceeds the hook timeout. | Verify DNS, TLS, and firewall access from the Aperture host to Highflame. Keep `fail_policy` set to `fail_open` and increase the hook `timeout` if needed. |
| Tool-call-specific events are missing | The hook is configured only for `pre_request`. | Add a `tool_call_entire_request` entry to `send_hooks` and include `tools`, `response_body`, and `raw_responses` in the `send` array. |
| The same prompt appears more than once in async sessions | Some clients send the full conversation on every tool-producing request. | Highflame deduplicates repeated observations where possible, but async mode can still record distinct completed requests in the same session. Use the session view to inspect the timeline. |

### Verification checklist

If you do not see expected results:

- Confirm Aperture hook delivery is working (check Aperture logs).
- Confirm the hook event is `pre_request`, `tool_call_entire_request`, or `entire_request`.
- Confirm the Highflame API key resolves to the expected tenant and project.
- Confirm the relevant Shield policy is enabled and set to the intended mode.
- Confirm the baseline permit policy is enabled for benign traffic.
- For tool-call visibility, confirm `tools`, `response_body`, and `raw_responses` are included in the async `send` array.

## Security considerations

- **Highflame receives plaintext content.** Depending on your `send` configuration, Highflame may receive the full request body (including tool definitions), response body, user messages, and response-extracted tool calls. Evaluate whether this is acceptable under your data handling policies.
- **API key handling.** The Highflame API key is stored in the Aperture config file and sent with every hook request. Treat the config file as sensitive. Rotate the key in Highflame and update the Aperture config if you suspect compromise.
- **Network path.** Hook traffic from Aperture to Highflame traverses the public internet (unless you have a private connectivity arrangement). The endpoint uses HTTPS, so the payload is encrypted in transit.
- **Data scope control.** Use the `send` array to limit what data Highflame receives. For pre-request enforcement, `user_message` and `request_body` are typically sufficient. Add `tools`, `response_body`, and `raw_responses` only for async observability where you need tool-call or full audit context.

## Maintenance and support

- **Maintainer**: Highflame support team
- **Contact**: [https://highflame.ai](https://highflame.ai)
- **Issue reporting**: File issues in this repository for problems with the integration documentation. For Highflame platform issues, contact the Highflame support team.

## Reference

- [Highflame setup guide for Tailscale Aperture](https://docs.highflame.ai/integrations/tailscale/setup-guide)
- [Aperture hook configuration reference](https://tailscale.com/docs/aperture/configuration#hooks)
