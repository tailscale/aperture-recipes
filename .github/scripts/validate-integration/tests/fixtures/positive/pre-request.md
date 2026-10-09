---
name: Policy Hook
provider: Acme
provider_url: https://acme.test
integration_type: pre_request_hook
additional_types: [post_response_hook]
status: community
date_submitted: 2026-08-12
tags: [policy]
---
# Policy Hook
## Summary
Policy Hook blocks prohibited prompts and records completed requests.
## Prerequisites
- You have an Acme API key and a running Aperture instance.
## Setup and configuration
1. Deploy the endpoint and store its API key securely.
## Hook definition
```json
"hooks": {
  "policy": { "url": "https://hooks.acme.test/policy", "timeout": "3s", "fail_policy": "fail_closed" }
}
```
## Grant wiring
```json
"send_hooks": [
  { "name": "policy", "events": ["pre_request"], "send": ["request_body", "user_message"] },
  { "name": "policy", "events": ["entire_request"], "send": ["response_body", "estimated_cost"] }
]
```
Tailnet grants require an explicit `dst` key; omitting it causes the grant to silently apply to nothing.
## Hook response format
The endpoint returns `{ "action": "block" }` when a prompt violates policy.
## Verify the integration
1. Send a blocked prompt through Aperture:
```sh
curl https://aperture.test/v1/messages -d '{"prompt":"blocked phrase"}'
```
Expect an HTTP 403 response containing the policy message.
## Maintenance and support
Contact Acme support at support@acme.test for integration issues.
