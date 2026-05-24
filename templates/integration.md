<!-- NOTE: Links use relative paths assuming this file will be copied to
     integrations/hooks/{type}/{name}/README.md (4 levels deep).
     Adjust link depth if placing elsewhere. -->
---

name: ""                        # Integration name
provider: ""                    # Company or individual name
provider_url: ""                # Provider's website
integration_type: ""            # Primary type. One of: pre_request_hook | post_response_hook | provider | tool
additional_types: []            # Optional. Other types this integration also supports (for example, [post_response_hook])
status: community               # community | official | deprecated
date_submitted: ""              # YYYY-MM-DD
tags: []
---

# {Integration Name}

## Summary

<!-- What this integration does and why an Aperture user would want it. Write as a standalone paragraph — this becomes the introduction on the docs page. Include what problem it solves and what gap it fills. -->

## Prerequisites

<!-- What the user needs before setting this up. Include requirements from both sides:
     - Aperture side: a running instance, specific version, etc.
     - External service side: an account, API key, endpoint, etc.
     Use verifiable conditions: "You have X", "You are running Y version Z or later". -->

-

## Setup and configuration

<!-- Step-by-step instructions to configure the external service for this integration.
     Number each step. Start each step with an imperative verb.
     Include working examples inline — sample requests, expected responses, config snippets.
     Use fenced code blocks with language identifiers. -->

1.

## Hook definition

<!-- FOR HOOK INTEGRATIONS ONLY. For provider/tool integrations, replace "Hook definition"
     and "Grant wiring" with a single "Aperture configuration" section showing grant config.

     Show the hook entry for the `hooks` map in the Aperture config file.
     Describe integration-specific field values (for example, the endpoint URL, recommended timeout).
     You do not need to document every hook field — see the
     [hook configuration reference](../../../../docs/protocol-reference.md#hook-configuration) for the
     full field list. -->

Add the hook to the `hooks` map in your Aperture config:

```json
"hooks": {
  "your-hook": {
    "url": "https://example.com/hook",
    "apikey": "<API_KEY>",
    "fail_policy": "fail_open"
  }
}
```

## Grant wiring

<!-- Hooks do nothing until they are referenced in a grant's `send_hooks` list.
     Show the send_hooks entry for this integration. Include only the events and
     send values this integration needs — do not list all possible values.
     See the [send field reference](../../../../docs/protocol-reference.md#optional-fields-controlled-by-send-list)
     for all available `send` values. -->

```json
"send_hooks": [
  {
    "name": "your-hook",
    "events": ["pre_request"],
    "send": ["request_body", "user_message"]
  }
]
```

> **Note:** `"request_body"` is required when the hook may return a `"modify"` action,
> because the modified body replaces the original request wholesale.

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. See the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

<!-- FOR PROVIDER AND TOOL INTEGRATIONS: Replace the "Hook definition" and
     "Grant wiring" sections above with this single section. -->

## Aperture configuration

<!-- Show the grant configuration for this integration. -->

```json
"grants": [
  {
    "src": ["group:developers"],
    "dst": ["tag:aperture"],
    "app": {
      "tailscale.com/cap/aperture": [{
        "model": "your-provider/*",
        "send_hooks": [
          {
            "name": "your-hook",
            "events": ["entire_request"],
            "send": ["estimated_cost"]
          }
        ]
      }]
    }
  }
]
```

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. Config-file grants do not use `dst` — omit it there. See the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Hook response format

<!-- FOR PRE-REQUEST HOOKS ONLY. Post-response hooks should delete this section
     since Aperture ignores the response.

     Describe what actions your hook returns and show example responses.
     Delete any actions your hook does not use.
     See the [GuardrailResponse reference](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns)
     for the full response schema. -->

Your hook endpoint returns a [`GuardrailResponse`](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns) with an `"action"` field:

### Allow (pass through unchanged)

```json
{ "action": "allow" }
```

### Block (reject the request)

```json
{
  "action": "block",
  "message": "Request blocked: reason."
}
```

Aperture returns an error to the client; the message is included in the response.

### Modify (rewrite the request before forwarding)

```json
{
  "action": "modify",
  "request_body": { ...modified request object... }
}
```

Whatever you return as `request_body` **replaces** what Aperture would have sent to the LLM. Requires `"request_body"` in the grant's `send` list.

> [!CAUTION]
> **Cache impact**: any modification to request content invalidates the LLM provider's prompt cache. The next request for the same content incurs a cache miss (up to 10x cost increase). See the [protocol quick reference](../../../../docs/protocol-reference.md#cache-impact-of-request-modification) for details. If your hook only uses `allow` and `block`, delete this callout.

## Verify the integration

<!-- How to verify the integration is working correctly.
     Include specific test steps, expected outcomes, and example commands. -->

1.

## Troubleshooting

<!-- OPTIONAL: Delete this section if not applicable. Encouraged for hook integrations. -->

| Symptom | Likely cause | Resolution |
|---|---|---|
| | | |

## Security considerations

<!-- OPTIONAL: Delete this section if not applicable. -->

<!-- Security implications of using this integration. Consider:
     - What data leaves the Aperture perimeter? The `send` list controls this.
     - What credentials are required and how should they be stored?
     - Does the hook see plaintext request/response content? -->

## Maintenance and support

- **Maintainer**: <!-- Name or team -->
- **Contact**: <!-- Email, GitHub handle, or support URL -->
- **Issue reporting**: <!-- Where to report bugs. Link to your issue tracker or this repo's issues. -->

## Reference

<!-- OPTIONAL: Delete this section if not applicable.
     Links to external documentation, guides, or API references. -->

-
