---
name: "tsheadroom"
provider: "Tailscale"
provider_url: "https://tailscale.com"
integration_type: pre_request_hook
status: official
date_submitted: 2026-06-09
tags: [compression, cost-optimization, context, tsnet, open-source]
---

# tsheadroom

If you run Aperture in front of coding agents or RAG pipelines, you pay for the same bulky payloads on every turn: multi-thousand-line tool outputs, search dumps, build logs, and file listings sent to the model again and again. tsheadroom is a pre-request hook that compresses that bulk before it reaches the provider, for every team in your org at once, with no client, SDK, or app changes.

## Summary

tsheadroom is a `pre_request` hook that transparently compresses bulky, low-value content out of LLM requests before they reach the provider, for every team in your org at once, with no client, SDK, or app changes. Coding agents and RAG pipelines repeatedly send the model the same large payloads: multi-thousand-line tool outputs, search dumps, build logs, file listings. You pay for those tokens on every turn, and they crowd out the context window. tsheadroom runs [Headroom](https://github.com/chopratejas/headroom)'s `compress()` function over the request's `messages` array, compressing that bulk while leaving prompts, instructions, and recent turns intact.

It is **fail-safe by design**: if there is nothing worth compressing, or anything goes wrong (the hook is slow, crashed, or unreachable), the request passes through unchanged. tsheadroom only ever returns `allow` or `modify`; it is structurally incapable of blocking a request.

Because you already run a tailnet if you run Aperture, tsheadroom joins that tailnet as a device using [`tsnet`](https://tailscale.com/docs/features/tsnet) and Aperture calls out to it. There is no public endpoint and no API key: access is gated by your tailnet's [grants](https://tailscale.com/docs/features/access-control/grants).

Before you adopt it, weigh the costs: text compression holds an ML model resident in each worker (~600 MB per worker; ~4.8 GB at the default pool size of 8), warm requests add single-digit milliseconds (the first request after startup can block ~60s while the model loads), and compressing historical context can cause a prompt-cache miss on the next turn. See [What it costs you](https://github.com/tailscale/tsheadroom#what-it-costs-you) in the repository.

tsheadroom is open source. This page is a quick-start summary; the full documentation, install steps, tuning reference, and troubleshooting live in the repository: **[github.com/tailscale/tsheadroom](https://github.com/tailscale/tsheadroom)**.

## Prerequisites

- A running [Aperture](https://tailscale.com/docs/aperture) instance with at least one LLM provider configured, and access to edit its configuration (`config.hujson`) and/or your tailnet policy file.
- A Tailscale tailnet (you have one if you run Aperture) and a Tailscale [auth key](https://tailscale.com/docs/features/access-control/auth-keys) so the device can join unattended.
- A Linux host (the binary also builds on macOS for local development) with Go 1.26.4+ to build, and Python 3.10–3.13 with `headroom-ai` installed. See the repository's [Requirements](https://github.com/tailscale/tsheadroom#requirements) for version details and the tool-output-only vs. text-compression install choice.

## Setup and configuration

tsheadroom is a service you run, not a hosted endpoint. Build the Go binary, install the Python `headroom-ai` package, and run the long-lived process as a tailnet device (ideally under `systemd`). The repository covers each step:

1. **Clone and build** the binary: `git clone https://github.com/tailscale/tsheadroom.git && cd tsheadroom && make` (or cross-compile with `GOOS=linux`). The clone also provides `worker.py`, the Python worker script the service runs. See [Install](https://github.com/tailscale/tsheadroom#install).
1. **Install Python deps**: `pip install 'headroom-ai[ml]'` (text + tool-output compression) or `'headroom-ai'` (tool-output only) into a supported interpreter, then copy `worker.py` from the clone next to where the service runs.
1. **Run** it, passing `TS_AUTHKEY` on first start so the device joins your tailnet, and pointing `-python` at your interpreter, `-worker` at `worker.py`, and `-state-dir` at a persistent path (it holds the device's private key). See [Run](https://github.com/tailscale/tsheadroom#run) and the sample [systemd unit](https://github.com/tailscale/tsheadroom#run-it-as-a-service).

Once running, the device is reachable at `http://tsheadroom.<your-tailnet>.ts.net/`. The two sections below wire that device into Aperture. Compression behavior is tunable at runtime through the device's `/config` endpoint (and the `-config` file); see [Tune compression](https://github.com/tailscale/tsheadroom#tune-compression-runtime-config).

## Hook definition

Add tsheadroom to the top-level `hooks` map in your Aperture config (`config.hujson`), pointing at your tsheadroom device:

```json
"hooks": {
  "headroom": {
    "url": "http://tsheadroom.<your-tailnet>.ts.net/",
    "fail_policy": "fail_open",
    "timeout": "30s"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `url` | Yes | Your tsheadroom device's tailnet URL, path `/`. |
| `fail_policy` | No (default `fail_open`) | Leave at the default `fail_open`; call it out so no one flips it to `fail_closed`. tsheadroom never blocks, and `fail_open` lets requests proceed uncompressed if the device is unreachable or a compression runs past `timeout`. |
| `timeout` | No (default `5s`) | Raise to `30s`. This is the entire client-facing latency budget; the `5s` default cuts off cold or large compressions. |
| `preference` | No (default `0`) | Set only if you stack tsheadroom with other hooks. Higher runs first; ties break alphabetically. |

tsheadroom needs no `apikey` or `authorization`: it is reached only over your tailnet and gated by grants. Refer to the [hook configuration reference](../../../../docs/protocol-reference.md#hook-configuration) for the full field list.

## Grant wiring

A hook does nothing until a grant references it through `send_hooks`:

```json
"grants": [
  {
    "src": ["*"],
    "app": {
      "tailscale.com/cap/aperture": [
        { "models": "**" },
        {
          "send_hooks": [
            {
              "name": "headroom",
              "events": ["pre_request"],
              "send": ["request_body"]
            }
          ]
        }
      ]
    }
  }
]
```

- `send: ["request_body"]` is **required** and is the only input tsheadroom uses. A `modify` hook replaces the entire request body, so Aperture must send it. tsheadroom reads the model name from inside the body and operates on the whole `messages` array; it does not need `user_message`.
- Scope `models` (an FQN glob such as `"anthropic/**"`, or `"**"` for everything) if you do not want to compress all providers.

> **Note:** `"request_body"` is required when a hook may return a `"modify"` action, because the modified body replaces the original request wholesale.

> [!WARNING]
> If you place grants in your [tailnet policy file](https://tailscale.com/docs/reference/syntax/policy-file#grants) rather than the Aperture config file, they require an explicit `dst` key (for example, `"dst": ["tag:aperture"]`, where `tag:aperture` is a tag applied to your Aperture device). Omitting `dst` causes the grant to silently apply to nothing and the hook never fires. Config-file grants do not use `dst`; omit it there. Refer to the [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration) for grant syntax details.

## Hook response format

tsheadroom returns one of two [`GuardrailResponse`](../../../../docs/protocol-reference.md#guardrailresponse---what-your-pre-request-hook-returns) actions, always with HTTP `200`. It never returns `"block"`.

### Allow (pass through unchanged)

```json
{ "action": "allow" }
```

Nothing changed; the original request proceeds. Returned for short or chat-only requests, bodies with no `messages` array, errors, or timeouts.

### Modify (rewrite the request before forwarding)

```json
{
  "action": "modify",
  "request_body": { "model": "…", "messages": [ "…" ] }
}
```

The `messages` array was compressed; every other field of the body is preserved. The modified body **replaces** what Aperture would have sent. Requires `"request_body"` in the grant's `send` list.

> [!NOTE]
> **Cache impact**: tsheadroom compresses *older* context and protects the most recent turns, so a `modify` changes the cached prefix and can trigger a prompt-cache miss on the next turn (up to a 10x cost increase on that turn). For tool/log-heavy traffic the token savings typically dominate; for cache-heavy chat workloads, weigh this and scope `models` accordingly. Refer to the [protocol quick reference](../../../../docs/protocol-reference.md#cache-impact-of-request-modification) for details.

## Verify the integration

Verify locally first, then end-to-end through Aperture. Full commands and the annotated log output are in the repository's [Verify it's working](https://github.com/tailscale/tsheadroom#verify-its-working) section.

1. **Locally**: run with `-local-addr 127.0.0.1:8080 -v` (plain HTTP, per-request logging, no tailnet) and POST a request carrying a large `tool_result`. tsheadroom replies `{"action":"modify",…}` with `out_bytes < in_bytes` in the log line. The first request may take ~60s while the ML model loads; subsequent requests return in milliseconds.
1. **Inverse check**: POST a short chat message; tsheadroom replies `{"action":"allow"}` (nothing worth compressing).
1. **End-to-end**: with the hook and grant live, make a real Aperture call that includes a substantial tool result (or run a coding-agent session). On the device, watch `-v` output or `journalctl -u tsheadroom -f`. A request that compresses logs `-> modify` with `out_bytes < in_bytes`.

## Troubleshooting

All `allow`, no `modify`? Work down this list. The repository's [Nothing compressing? Checklist](https://github.com/tailscale/tsheadroom#nothing-compressing-checklist) has the full version.

| Symptom | Likely cause | Resolution |
|---|---|---|
| No requests reach the device | Hook not firing, or grant misconfigured | In a policy-file grant, confirm `dst` is set. Confirm `src` matches your users and `models` matches your traffic. |
| Requests arrive but always `allow(passthrough)` | Body has no `messages` array (for example, Gemini `contents` or embeddings) | Expected; those request shapes pass through by design. |
| Requests arrive but always `allow(noop)` | Nothing worth compressing (short chat, prose-only, no substantial tool result) | Correct behavior. See [What gets compressed](https://github.com/tailscale/tsheadroom#what-gets-compressed). |
| Text/prose not shrinking | `[ml]` extra not installed, or `compress_user_messages` off | Install `headroom-ai[ml]` and check `GET /config`. |
| Occasional `allow(error)` under load or on first request | Compression exceeded Aperture's hook `timeout` and failed open | Raise `timeout`, or pre-warm the model to avoid the cold-start load. |
| `pip install` fails building `headroom-ai` | Python version too new for a published wheel | Recreate the venv on a supported version (3.10–3.13). See [Install fails building headroom-ai](https://github.com/tailscale/tsheadroom#install-fails-building-headroom-ai). |

## Security considerations

- **What tsheadroom sees**: the full plaintext request body of every matched LLM call, including prompts and tool results. It processes content in memory and does not persist request content to disk.
- **Reachability**: tsheadroom has no auth of its own. Anyone who can reach the device over your tailnet can call the hook and read or change its `/config` endpoint. Restrict access with [grants](https://tailscale.com/docs/features/access-control/grants) and give the device a [tag](https://tailscale.com/docs/features/tags) (for example, `tag:tsheadroom`) so you can target it.
- **`send` scope**: tsheadroom requires only `request_body`. That is the entire data surface that leaves Aperture for this hook.
- **Egress**: the only outbound call is the one-time HuggingFace model download, which you can eliminate by pre-seeding the cache and running offline. Compression itself makes no network calls.
- **Secrets**: `-state-dir` holds the device's private key; keep it on durable, protected storage.

## Maintenance and support

- **Maintainer**: Tailscale
- **Contact**: [Tailscale support](https://tailscale.com/contact/support)
- **Issue reporting**: File tsheadroom bugs (Aperture integration, request/response parsing, program behavior) in the [tsheadroom issue tracker](https://github.com/tailscale/tsheadroom/issues). Bugs in the `compress()` function itself belong to [Headroom](https://github.com/chopratejas/headroom), with which tsheadroom is not affiliated.

## Reference

- [tsheadroom repository (full documentation)](https://github.com/tailscale/tsheadroom)
- [Headroom (the compression engine)](https://github.com/chopratejas/headroom)
- [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration)
- [Protocol quick reference](../../../../docs/protocol-reference.md)
- [tsnet](https://tailscale.com/docs/features/tsnet)
