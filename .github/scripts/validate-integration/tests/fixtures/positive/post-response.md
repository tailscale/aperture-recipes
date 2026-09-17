---
name: Audit Hook
provider: Acme
provider_url: https://acme.test
integration_type: post_response_hook
additional_types: []
status: community
date_submitted: 2026-08-12
tags: [audit]
---
# Audit Hook
## Summary
Audit Hook records completed model requests for review.
## Prerequisites
- You have an Acme audit endpoint and Aperture access.
## Setup and configuration
1. Create an audit destination and copy its endpoint URL.
## Hook definition
```json
"hooks": { "audit": { "url": "https://hooks.acme.test/audit", "disabled": false } }
```
## Grant wiring
```json
"send_hooks": [{ "name": "audit", "events": ["tool_call_entire_request"], "send": ["tools", "response_body"] }]
```
Tailnet grants require an explicit `dst` key; omitting it causes the grant to silently apply to nothing.
## Verify the integration
1. Make a request that invokes a tool:
```sh
curl https://aperture.test/v1/chat/completions -d @tool-request.json
```
Confirm that the Acme audit log shows the tool name and response body.
## Maintenance and support
Report problems to the Acme audit team at audit@acme.test.
