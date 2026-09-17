---
name: Broken Audit
provider: Acme
provider_url: https://acme.test
integration_type: post_response_hook
additional_types: []
status: community
date_submitted: 2026-08-12
---
# Broken Audit
## Summary
This audit fixture contains an invalid event value.
## Prerequisites
- Aperture is available for fixture validation.
## Setup and configuration
1. Configure the fixture endpoint for validation.
## Hook definition
```json
"hooks": { "audit": { "url": "https://hooks.acme.test/audit" } }
```
## Grant wiring
```json
"send_hooks": [{ "name": "audit", "events": ["after_response"], "send": ["tools"] }]
```
Tailnet grants require an explicit `dst` key.
## Verify the integration
1. Run the fixture validator:
```sh
npm test
```
Expect an invalid hook event diagnostic.
## Maintenance and support
This fixture is maintained by the validator test suite.
