---
name: ExampleAI
provider: ExampleAI
provider_url: https://provider.test
integration_type: provider
additional_types: []
status: community
date_submitted: 2026-08-12
tags: [provider]
---
# ExampleAI
## Summary
This integration routes ExampleAI API requests through Aperture.
## Prerequisites
- You have an ExampleAI API key and an Aperture instance.
## Setup and configuration
1. Store the API key in the Aperture environment.
## Aperture provider configuration
```json
{
  "providers": {
    "exampleai": {
      "baseurl": "https://api.provider.test",
      "apikey": "<EXAMPLEAI_API_KEY>",
      "models": ["example-model"]
    }
  }
}
```
## Grant access to provider models
This Aperture config-file grant omits `dst` and grants access to ExampleAI models.
```json
"grants": [{
  "src": ["group:developers"],
  "app": { "tailscale.com/cap/aperture": [{ "models": "exampleai/**" }] }
}]
```
Tailnet policy grants require an explicit `dst` key.
## Verify the integration
1. Request a model through the configured provider:
```sh
curl https://aperture.test/v1/models
```
Expect the output to list the ExampleAI model identifier.
## Maintenance and support
Open a ticket at https://provider.test/support for provider failures.
