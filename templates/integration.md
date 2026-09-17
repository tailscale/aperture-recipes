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

<!-- What this integration does and why an Aperture user would want it. Write as a standalone paragraph; this becomes the introduction on the docs page. Include what problem it solves and what gap it fills. -->

## Prerequisites

<!-- What the user needs before setting this up. Include requirements from both sides:
     - Aperture side: a running instance, specific version, etc.
     - External service side: an account, API key, endpoint, etc.
     Use verifiable conditions: "You have X", "You are running Y version Z or later". -->

-

## Setup and configuration

<!-- Step-by-step instructions to configure the external service for this integration.
     Number each step. Start each step with an imperative verb.
     Include working examples inline: sample requests, expected responses, configuration snippets.
     Use fenced code blocks with language identifiers. -->

1.

## Hook definition

<!-- FOR HOOK INTEGRATIONS ONLY. Provider and tool integrations should delete this
     section and "Grant wiring", then keep the matching type-specific branch below.

     Show the hook entry for the `hooks` map in the Aperture config file.
     Describe integration-specific field values (for example, the endpoint URL, recommended timeout).
     You do not need to document every hook field. Refer to the
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
     send values this integration needs. Do not list all possible values.
     Refer to the [send field reference](../../../../docs/protocol-reference.md#optional-fields-controlled-by-send-list)
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
> Config-file grants omit `dst`. Grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`); omitting it causes the grant to silently apply to nothing. Clearly label the location of the complete grant example in your integration. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

<!-- FOR PROVIDER INTEGRATIONS ONLY. Delete the hook sections and the tool branch. -->

## Aperture provider configuration

<!-- Show the provider entry in Aperture's top-level `providers` map. Use the
     provider's verified field values: its upstream `baseurl`, credential or
     authentication fields where applicable, and an array-valued `models` field.
     The example below illustrates an API-key provider; replace its fields with
     the fields verified for this provider. -->

```json
"providers": {
  "your-provider": {
    "baseurl": "https://api.provider.example",
    "apikey": "<PROVIDER_API_KEY>",
    "models": ["provider-model-id"]
  }
}
```

## Grant access to provider models

<!-- This example is a grant in the Aperture config file, so it omits `dst`.
     The grant controls access; it does not define the provider. Use the
     `models` capability field (a string glob), not the provider's array-valued
     `models` field. Add `send_hooks` only if this integration genuinely also
     includes a hook. -->

```json
"grants": [
  {
    "src": ["group:developers"],
    "app": {
      "tailscale.com/cap/aperture": [
        { "models": "your-provider/**" }
      ]
    }
  }
]
```

> [!WARNING]
> The example above is for the Aperture config file and therefore omits `dst`. If you put the grant in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants), add an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` from a tailnet policy grant causes it to silently apply to nothing. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

<!-- FOR TOOL INTEGRATIONS ONLY. Delete the hook sections and the provider branch. -->

## Tool configuration

<!-- Show the external tool's own settings, using the exact setting names verified
     for that tool. Point its API base URL to Aperture, select the appropriate
     model, and include a placeholder API key only when the tool requires one.
     Do not present the conceptual labels below as literal setting names. -->

Conceptual settings (replace these labels with the tool's verified setting names):

```text
API base URL: https://aperture.example.ts.net
Model: your-provider/provider-model-id
Placeholder API key, if required by the tool: <PLACEHOLDER_KEY>
```

## Grant access to the tool's models

<!-- This example is a grant in the Aperture config file, so it omits `dst`.
     The grant controls model access; it does not configure the external tool.
     Add `send_hooks` only if this integration genuinely also includes a hook. -->

```json
"grants": [
  {
    "src": ["group:developers"],
    "app": {
      "tailscale.com/cap/aperture": [
        { "models": "your-provider/**" }
      ]
    }
  }
]
```

> [!WARNING]
> The example above is for the Aperture config file and therefore omits `dst`. If you put the grant in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants), add an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` from a tailnet policy grant causes it to silently apply to nothing. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Hook response format

<!-- FOR PRE-REQUEST HOOKS ONLY. Post-response hooks should delete this section
     since Aperture ignores the response.

     Describe what actions your hook returns and show example responses.
     Delete any actions your hook does not use.
     Refer to the [GuardrailResponse reference](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns)
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

> [!NOTE]
> **Cache impact**: Modifying the current turn's content (the new user message) has no cache impact because the provider has not received it yet. However, modifying historical context (earlier messages already cached by the provider) invalidates the prompt cache and can increase estimated costs. Refer to the [protocol quick reference](../../../../docs/protocol-reference.md#cache-impact-of-request-modification) for details. If your hook only uses `allow` and `block`, delete this callout.

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
