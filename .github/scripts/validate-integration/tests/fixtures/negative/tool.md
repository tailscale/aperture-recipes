---
name: ""
provider: Acme
provider_url: https://tool.test
integration_type: tool
additional_types: []
status: community
date_submitted: 2026-08-12
---
# {Integration Name}
## Summary
<!-- What this integration does and why an Aperture user would want it. -->
## Prerequisites
-
## Setup and configuration
1.
## Aperture configuration
```json
{ "grants": [{ "src": ["group:dev"], "dst": ["tag:aperture"], "app": { "tailscale.com/cap/aperture": [{ "models": "**", "send_hooks": [] }] } }] }
```
## Verify the integration
1.
## Maintenance and support
<!-- TODO: Fill in this section -->
