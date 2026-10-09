---
name: OpenRouter
provider: OpenRouter
provider_url: 'https://openrouter.ai'
integration_type: provider
additional_types: []
status: community
date_submitted: '2026-08-14'
tags:
  - llm-provider
  - openai-compatible
  - model-routing
---

# OpenRouter

Use this recipe to add OpenRouter as an Aperture provider and grant users access
to its configured models.

## Summary

This integration routes OpenAI-compatible chat completion requests through
Aperture to OpenRouter. OpenRouter provides one API for models from multiple
LLM providers.

## Prerequisites

Before you configure the integration, confirm that you have the required
access and credentials:

- You have an Aperture instance and permission to edit its configuration.
- You have an [OpenRouter API key](https://openrouter.ai/settings/keys).
- Your device can reach the Aperture instance through its tailnet.

## Setup and configuration

Add the provider and grant shown in the following sections to your Aperture
configuration. You can edit the JSON on the **Administration** >
**Configuration** page in the Aperture dashboard.

1. Replace `<your-openrouter-key>` with your OpenRouter API key.
1. Add the `openrouter` entry to the top-level `providers` map.
1. Add a grant that gives the intended developers the `user` role and model access.
1. Save the configuration.

## Aperture provider configuration

OpenRouter uses Aperture's default bearer authorization and `openai_chat`
compatibility, so the provider needs no authorization or compatibility
overrides. Use the API root as `baseurl`; Aperture appends the incoming `/v1`
request path.

```json
{
  "providers": {
    "openrouter": {
      "baseurl": "https://openrouter.ai/api/",
      "apikey": "<your-openrouter-key>",
      "models": [
        "qwen/qwen3-235b-a22b-2507",
        "google/gemini-2.5-pro-preview",
        "x-ai/grok-code-fast-1"
      ]
    }
  }
}
```

These model IDs match the current official Aperture OpenRouter guide. Model
availability can change, so check the
[OpenRouter model directory](https://openrouter.ai/models) before deploying
this configuration. OpenRouter supports chat completions, but not the OpenAI
Responses API through this Aperture provider configuration.

Clients address a configured Aperture model by its fully qualified name. Add
the Aperture provider key to the OpenRouter model ID: the upstream model
`qwen/qwen3-235b-a22b-2507` becomes
`openrouter/qwen/qwen3-235b-a22b-2507` in a request to Aperture.

## Grant access to provider models

The following grant belongs in the Aperture config file. It gives all users the
required `user` role and access to every model configured under `openrouter`.
The `models` capability is a string-valued glob, not the array used in the
provider configuration.

```json
{
  "grants": [
    {
      "src": ["group:developers"],
      "app": {
        "tailscale.com/cap/aperture": [
          { "role": "user" },
          { "models": "openrouter/**" }
        ]
      }
    }
  ]
}
```

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. Config-file grants do not use `dst`; omit it there. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Verify the integration

Run the request from a device that can reach Aperture. Set `APERTURE_URL` to the
instance URL before sending a chat completion request.

1. Set the Aperture URL and send a request to a configured OpenRouter model:

   ```bash
   APERTURE_URL="http://<aperture-hostname>"

   curl --fail-with-body -sS -i "${APERTURE_URL}/v1/chat/completions" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "openrouter/qwen/qwen3-235b-a22b-2507",
       "messages": [
         {"role": "user", "content": "Reply with the word connected."}
       ]
     }'
   ```

1. Confirm that the HTTP status is `200` and the JSON response contains a
   non-empty `choices` array with an assistant message.
1. Open the Aperture dashboard and confirm that the request appears on the
   **Logs** page under the OpenRouter model.

The integration passes when all three results are observable. These steps
describe how to test your deployment; this community recipe does not claim a
live test against your Aperture instance or OpenRouter account. It fails if
`curl` returns a non-zero exit status, the response lacks a non-empty `choices`
array, or no matching request appears in Aperture Logs.

## Troubleshooting

Use the response status and body to identify the first configuration value to
check:

| Symptom | Check |
| --- | --- |
| OpenRouter returns an authentication error. | Confirm that `apikey` contains an active OpenRouter API key. |
| The upstream request returns HTTP 404 or 405. | Confirm that `baseurl` is `https://openrouter.ai/api/` and does not include `/v1`. |
| Aperture denies access to the model. | Confirm that the caller matches a grant with both `role: user` and `models: openrouter/**`. |
| OpenRouter reports that the model is unavailable. | Select a current model ID from the OpenRouter model directory and update the `models` array and verification request. |

## Security considerations

Store the OpenRouter API key in Aperture's protected configuration. The key
allows requests against your OpenRouter account, so rotate it if it is exposed
and restrict Aperture model grants to users who need access.

## Maintenance and support

Use the authoritative documentation below when model availability or Aperture
configuration behavior changes:

- **Maintainer**: Aperture recipes maintainers.
- **OpenRouter support**: Use the [OpenRouter support center](https://openrouter.ai/support).
- **Recipe issues**: Report documentation problems in the [Aperture recipes issue tracker](https://github.com/tailscale/aperture-recipes/issues).

## Reference

These sources define the current provider settings, grant syntax, and model
catalog:

- [Set up OpenRouter in Aperture](https://tailscale.com/docs/aperture/how-to/use-openrouter).
- [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration).
- [OpenRouter API documentation](https://openrouter.ai/docs/quickstart).
- [OpenRouter model directory](https://openrouter.ai/models).
