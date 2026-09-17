---
name: Cribl
provider: Cribl
provider_url: 'https://cribl.io/'
integration_type: post_response_hook
additional_types: []
status: community
date_submitted: '2026-08-14'
tags:
  - cost-tracking
  - logging
  - observability
---

# Cribl

## Summary

This integration sends completed Aperture request events to a Cribl webhook
source. Cribl can process and route those events through pipelines that you
configure.

This repository provides configuration instructions only. It does not ship or
host a webhook endpoint. You or your Cribl operator must create, secure,
operate, and monitor the Cribl endpoint and its downstream pipeline.

## Prerequisites

Before you configure the integration, confirm that you have the required
services and access:

- A running [Aperture instance](https://tailscale.com/docs/aperture/get-started)
  with a configured LLM provider and an existing grant that allows the test
  user to access a model.
- A Cribl Stream or Cribl Cloud deployment that you can configure.
- A [Cribl webhook source](https://docs.cribl.io/stream/sources-webhook/) and its
  HTTPS endpoint URL.
- An authentication token if the Cribl source requires one.

## Setup and configuration

The Aperture hook configuration below assumes that the Cribl webhook source
accepts a bearer token. Source authentication is an operator-controlled Cribl
setting, so configure it before adding the hook.

1. Create or select a webhook source in Cribl.
1. Configure the source to accept JSON events over HTTPS.
1. Configure bearer-token authentication for the source.
1. Copy the source URL and token for the Aperture hook definition.
1. Configure the Cribl pipeline and destination that will receive these events.

If your Cribl source uses a different authentication scheme, do not copy the
bearer configuration unchanged. Align the source with an
[authentication mode that Aperture supports](../../../../docs/protocol-reference.md#hook-configuration),
or place an operator-managed authenticated receiver in front of Cribl.

## Hook definition

Add this entry to the top-level `hooks` map in the Aperture config file. Replace
both placeholders with values from your Cribl webhook source.

```json
"hooks": {
  "cribl": {
    "url": "https://<cribl-webhook-host>/<cribl-webhook-path>",
    "apikey": "<cribl-auth-token>",
    "authorization": "bearer"
  }
}
```

Aperture sends a JSON `HookCallData` payload to this URL after each matching
request completes. Post-response hooks are fire-and-forget, and Aperture does
not parse the endpoint's response.

## Grant wiring

Add this grant to the top-level `grants` array in the Aperture config file. The
example sends the smallest payload needed for basic usage-cost observability:
automatic request metadata plus `estimated_cost`.

```json
"grants": [
  {
    "src": ["group:developers"],
    "app": {
       "tailscale.com/cap/aperture": [
         {
           "send_hooks": [
            {
              "name": "cribl",
              "events": ["entire_request"],
              "send": ["estimated_cost"]
            }
          ]
        }
      ]
    }
  }
]
```

The `metadata` object is always present, so it does not appear in `send`.
Adding `estimated_cost` includes an estimated dollar cost and token-usage
breakdown in `metadata`; it is not a billing statement or exact charge. This
minimal payload follows the current protocol definition, but this recipe does
not claim that webhook delivery or every Cribl pipeline mapping has been
runtime-tested. Validate the fields against your source and pipeline before
relying on them.

> [!WARNING]
> The example is a config-file grant, so it omits `dst`. Tailnet policy grants
> require an explicit `dst` key, such as `"dst": ["tag:aperture"]`. Omitting
> `dst` causes a tailnet policy grant to silently apply to nothing. Refer to the
> [tailnet grant syntax](https://tailscale.com/kb/1337/acl-syntax#grants) and the
> [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration)
> for grant syntax details.

## Verify the integration

Run this check from a device that can reach Aperture. Use a model allowed by an
existing model-access grant and a user included in this hook grant's `src`.

1. Set the Aperture URL and configured model name.

   ```bash
   APERTURE_URL="https://<aperture-host>"
   MODEL="<provider>/<model-id>"
   ```

1. Send an OpenAI-compatible chat completion through Aperture.

   ```bash
   curl --fail-with-body -i "${APERTURE_URL}/v1/chat/completions" \
     -H "Content-Type: application/json" \
     -d "{\"model\":\"${MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the word verified.\"}]}"
   ```

1. Confirm that Aperture returns its normal successful LLM response with an
   HTTP 2xx status. The response should contain the provider's generated model
   output, such as `verified`, rather than a hook-delivery error.
1. Open the Cribl source's event inspection or preview and locate the event for
   the request.
1. Confirm that the event contains `metadata.request_id`, `metadata.model`,
   `metadata.provider`, and `metadata.estimated_cost`.
1. Confirm that the configured Cribl pipeline routes the event to its intended
   destination.
1. If you can test with an identity outside `group:developers`, send the same
   request as that identity and confirm that no corresponding Cribl event
   appears. This control verifies that the hook grant's `src` scope is applied.

The verification passes when the LLM request succeeds and the matching
Cribl event reaches its intended destination with the expected metadata. It
fails if no matching event appears, required fields are absent, or routing
rejects or drops the event. A normal LLM response alone does not prove delivery:
post-response hooks always fail open and cannot disrupt the user's request.

## Troubleshooting

Use the observed failure point to narrow the configuration check.

| Symptom | Check |
| --- | --- |
| No event reaches the Cribl source. | Confirm that Aperture can reach the webhook URL and that the source accepts the configured bearer token. |
| Some users do not produce events. | Confirm that the config-file grant's `src` includes those users. For tailnet policy grants, also confirm that `dst` matches the Aperture node. |
| The event has metadata but no cost estimate. | Confirm that the hook's `send` array contains `estimated_cost` and that the model has supported pricing data. |
| Cribl receives the event but no destination does. | Check the Cribl pipeline route, filters, schema mapping, and destination health. |

## Security considerations

The minimal configuration sends user identity, request identifiers, model and
provider identifiers, and estimated usage cost. It does not request prompt or
response bodies. Add other `send` values when the pipeline needs them,
because content fields can contain sensitive data.

Store the Cribl authentication token as a secret and rotate it according to
your operating policy. Cribl and each downstream destination process forwarded
data under your agreements with those providers.

## Maintenance and support

The operators who deploy the integration own its maintenance. Use the following
channels for product-specific help and recipe corrections:

- **Maintainer**: Aperture recipes maintainers for this document; the Cribl and
  Aperture operators who deploy it own the running integration.
- **Contact**: Use your organization's Cribl support channel or
  [Cribl Support](https://cribl.io/support/).
- **Issue reporting**: Report Cribl source or pipeline problems through Cribl
  Support. Report errors in this recipe through this repository's issue
  tracker.

## Reference

Use these sources for current product and protocol details:

- [Integrate Cribl with Aperture](https://tailscale.com/docs/aperture/integrate/cribl).
- [Aperture protocol quick reference](../../../../docs/protocol-reference.md).
- [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration#hooks).
- [Cribl webhook source documentation](https://docs.cribl.io/stream/sources-webhook/).
