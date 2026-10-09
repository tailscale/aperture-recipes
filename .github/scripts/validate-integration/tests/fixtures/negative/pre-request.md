---
name: Broken Policy
provider: Acme
provider_url: https://acme.test
integration_type: pre_request_hook
additional_types: []
status: community
date_submitted: 2026-08-12
---
# Broken Policy
## Summary
This hook has deliberately invalid semantic configuration for tests.
## Prerequisites
- Aperture is running for this deliberately invalid example.
## Setup and configuration
1. Configure the invalid example endpoint for testing.
## Hook definition
```json
"hooks": { "policy": { "url": "https://hooks.acme.test", "retry_count": 3 } }
```
## Grant wiring
```json
{
  "grants": [{
    "src": ["group:dev"], "dst": ["tag:aperture"], "bogus_grant": true,
    "app": { "tailscale.com/cap/aperture": [{
      "models": "**", "bogus_aperture": true,
      "send_hooks": [
        { "name": "policy", "events": ["entire_request"], "send": ["secrets"], "bogus_hook": true },
        { "name": "policy", "events": ["pre_request"], "send": ["response_body", "tools"] }
      ]
    }] }
  }]
}
```
Tailnet grants require an explicit `dst` key.
## Hook response format
The hook returns an allow response for this test fixture.
## Verify the integration
1. Run the invalid fixture:
```sh
curl https://aperture.test/test
```
Expect validation errors for every invalid field.
## Maintenance and support
This fixture is maintained by the validator test suite.
