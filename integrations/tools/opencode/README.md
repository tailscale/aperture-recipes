---
name: OpenCode
provider: OpenCode
provider_url: 'https://opencode.ai'
integration_type: tool
additional_types: []
status: community
date_submitted: '2026-08-14'
tags:
  - coding-agent
  - developer-tool
  - llm-client
---

# OpenCode

This recipe connects the OpenCode coding agent to Aperture.

## Summary

Route OpenCode LLM requests through Aperture to apply model access grants and
record the requests in Aperture Logs.

## Prerequisites

Before you configure OpenCode, make sure you have the following:

- An Aperture instance that your device can reach.
- At least one LLM provider and model configured in Aperture.
- OpenCode installed on your device.
- Permission to edit the Aperture config file and restart Aperture.

## Setup and configuration

Configure the Aperture grant first. Then configure OpenCode's provider endpoint,
model, and placeholder authentication as described in the following sections.

## Tool configuration

OpenCode merges configuration from several locations. Use
`~/.config/opencode/opencode.json` for a user-wide configuration, or use
`opencode.json` in a project root for that project. A project configuration
overrides conflicting user-wide settings.

Add the provider, Aperture endpoint, and model to the selected `opencode.json`
file. This example uses Anthropic; replace both model values with a provider and
model configured in your Aperture instance.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "http://<aperture-hostname>/v1"
      }
    }
  },
  "model": "anthropic/claude-sonnet-4-5"
}
```

The `provider.<name>.options.baseURL` value must include Aperture's `/v1` path.
The `model` value uses OpenCode's `provider/model` format. Use `http://` for the
Aperture host URL unless your deployment explicitly provides HTTPS.

OpenCode also requires an authentication entry for the provider. Add the
following entry to `~/.local/share/opencode/auth.json`:

```json
{
  "anthropic": {
    "type": "api",
    "key": "-"
  }
}
```

The required `-` value satisfies OpenCode's provider authentication check. It
is a placeholder, not a provider secret. Aperture authenticates the user through
their Tailscale identity and supplies the configured provider credential. Do not
put a real provider API key in this file for the Aperture connection.

You can instead run `opencode auth login --provider anthropic`, select the
manual API key method, and enter `-` when prompted.

## Grant access to the tool's models

Add this grant to the `grants` array in the Aperture config file. The `models`
capability is a string pattern and must match the provider in OpenCode's model
value.

```json
"grants": [
  {
    "src": ["group:developers"],
    "app": {
      "tailscale.com/cap/aperture": [
        {
          "role": "user",
          "models": "anthropic/**"
        }
      ]
    }
  }
]
```

Restart or reload Aperture after you update its config file.

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/kb/1337/acl-syntax#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`). Omitting `dst` causes the grant to silently apply to nothing. Config-file grants do not use `dst`; omit it there. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Verify the integration

These checks send a new request through the configured OpenCode client. They do
not represent a claim that this community recipe was live-tested.

1. Confirm that OpenCode lists the configured provider and model:

   ```shell
   opencode models anthropic
   ```

   **Pass:** The output includes `anthropic/claude-sonnet-4-5`. **Fail:** The
   model is absent, or OpenCode reports a provider or authentication error.

1. Send a non-interactive request through Aperture:

   ```shell
   opencode run --model anthropic/claude-sonnet-4-5 \
     "Reply with the text APERTURE_OK."
   ```

   **Pass:** The CLI prints `APERTURE_OK` in the model response. **Fail:** The
   command exits with a connection, authentication, or model-access error, or
   the response does not contain `APERTURE_OK`.

1. Open Aperture Logs and inspect the request from the preceding command.

   **Pass:** Aperture Logs contains a completed request for the expected user,
   provider, and model. **Fail:** No matching request appears, or the entry
   records an access or upstream provider failure.

## Troubleshooting

Use these checks for common configuration failures:

| Symptom | Check |
| --- | --- |
| OpenCode reports missing authentication | Confirm `~/.local/share/opencode/auth.json` contains the `-` key for the same provider ID used in `opencode.json`. |
| OpenCode cannot connect | Confirm `provider.<name>.options.baseURL` uses the reachable Aperture host and ends in `/v1`. |
| Aperture denies the model | Confirm the grant's string `models` pattern matches OpenCode's `provider/model` value. |
| No request appears in Aperture Logs | Check for a higher-precedence OpenCode config that overrides `baseURL`, then confirm the device can reach Aperture. |

## Security considerations

The `-` authentication value is intentionally non-secret. Keep real provider
credentials in Aperture, and restrict the OpenCode configuration and auth files
to the users who need them.

## Maintenance and support

Use these community support channels for this recipe:

- **Maintainer**: Aperture recipes maintainers.
- **Contact**: File an issue in the [Aperture recipes issue tracker](https://github.com/tailscale/aperture-recipes/issues).
- **Issue reporting**: Include the OpenCode version and the relevant config paths, but remove credentials and request content.

OpenCode can change configuration paths, precedence, or provider settings between
versions. Recheck this recipe against the current OpenCode documentation when you
upgrade OpenCode.

## Reference

Refer to these sources for the Aperture workflow and current OpenCode behavior:

- [Use OpenCode with Aperture](https://tailscale.com/docs/aperture/how-to/use-opencode)
- [OpenCode CLI documentation](https://opencode.ai/docs/cli/)
- [OpenCode configuration documentation](https://opencode.ai/docs/config/)
- [OpenCode provider and authentication documentation](https://opencode.ai/docs/providers/)
