---
name: Broken Provider
provider: ExampleAI
provider_url: https://provider.test
integration_type: provider
additional_types: []
status: community
date_submitted: 2026-08-12
---
# Broken Provider
## Summary
This reproduces the generic provider template configuration defect.
## Prerequisites
- Aperture is running for fixture validation.
## Setup and configuration
1. Retain the incorrect generic grant example.
## Aperture configuration
```json
{
  "grants": [{ "src": ["group:dev"], "dst": ["tag:aperture"], "app": {
    "tailscale.com/cap/aperture": [{ "model": "exampleai/*", "send_hooks": [{ "name": "audit", "events": ["entire_request"], "send": ["estimated_cost"] }] }]
  }}]
}
```
## Verify the integration
1. Run the fixture validator:
```sh
npm test
```
Expect errors for the missing providers map and retained send hooks.
## Maintenance and support
This fixture is maintained by the validator test suite.
