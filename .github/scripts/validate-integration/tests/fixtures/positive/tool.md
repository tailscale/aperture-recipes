---
name: Editor Agent
provider: Acme
provider_url: https://tool.test
integration_type: tool
additional_types: []
status: community
date_submitted: 2026-08-12
tags: [tool]
---
# Editor Agent
## Summary
Editor Agent sends its model traffic through Aperture.
## Prerequisites
- You have Editor Agent installed and can reach Aperture.
## Setup and configuration
1. Open the Editor Agent settings file.
## Tool configuration
```json
{
  "client": { "base_url": "https://aperture.test/v1", "api_key": "${APERTURE_API_KEY}" }
}
```
## Grant access to the tool's models
This Aperture config-file grant omits `dst` and grants access to the selected models.
```json
"grants": [{
  "src": ["group:developers"],
  "app": { "tailscale.com/cap/aperture": [{ "models": "exampleai/**" }] }
}]
```
Tailnet policy grants require an explicit `dst` key.
## Verify the integration
1. Run a prompt from Editor Agent:
```sh
editor-agent ask "Reply with connected"
```
Confirm that the response is `connected` and the request appears in the Aperture dashboard.
## Maintenance and support
Report client configuration problems at https://tool.test/issues.
