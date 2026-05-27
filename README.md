# Aperture recipes

This repository is the submission surface for third-party [Aperture](https://tailscale.com/aperture) integration documentation, examples, and templates. It is maintained by Tailscale's Aperture team.

Aperture is a gateway and proxy layer for LLM traffic. It sits between your users and LLM providers (Anthropic, OpenAI, and others), giving you visibility into AI usage, cost tracking, security guardrails, and policy enforcement. One of Aperture's core extension points is its hooks system: pre-request hooks can inspect, modify, or block requests before they reach the LLM provider, and post-response hooks can process completed requests asynchronously (fire-and-forget) for logging and auditing.

This repo provides a structured way for partners, vendors, and community members to contribute integration documentation that helps other Aperture users adopt their tools and services. Submissions are reviewed by the Aperture team before merge.

## Integration types

Aperture integrations fall into four categories. Each submission specifies its type in frontmatter, and lives in the corresponding directory:

| Type | Directory | Description |
|---|---|---|
| Pre-request hook | `integrations/hooks/pre-request/` | Synchronous hook that fires before the request reaches the LLM provider. Can allow, block, or modify the request. Returns a `GuardrailResponse`. |
| Post-response hook | `integrations/hooks/post-response/` | Fire-and-forget hook that fires after the LLM response is delivered. Receives a `HookCallData` payload for logging or auditing. Response is not parsed. |
| Provider | `integrations/providers/` | Documentation for using Aperture with a specific LLM provider or reseller. |
| Tool | `integrations/tools/` | Documentation for using Aperture alongside a developer tool, platform, or workflow. |

## Getting started

1. If you are building a hook integration, read the [protocol quick reference](docs/protocol-reference.md) first. It covers the payload types, event types, send values, and configuration format you will need.
1. Fork this repository.
1. Copy [`templates/integration.md`](templates/integration.md) into the correct directory for your integration type. Name your directory after your integration (for example, `integrations/hooks/pre-request/your-integration/README.md`).
1. Fill out every section of the template. Remove optional sections that do not apply.
1. Add any supplemental files (variant docs, scripts, images) to the same directory and reference them from the README.
1. Commit with `--signoff` and open a pull request against `main`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full submission process, quality bar, review workflow, and licensing details.

If you are not comfortable with pull requests, you can use the [integration submission issue form](../../issues/new?template=integration-submission.yml) instead. The review team will help create the PR on your behalf.

## Repository layout

```
templates/
└── integration.md              Single unified template for all types

integrations/
├── hooks/
│   ├── pre-request/            Pre-request hook integrations (synchronous)
│   │   └── your-integration/
│   │       ├── README.md       Primary documentation (required)
│   │       ├── example.py      Helper scripts or code samples (optional)
│   │       └── architecture.png Images or diagrams (optional)
│   └── post-response/           Post-response hook integrations (fire-and-forget)
├── providers/                  Provider-specific integrations
└── tools/                      Tool and platform integrations
```

Each integration lives in its own directory. The `README.md` is the required entry point. You can include supplemental files (variant docs, scripts, images) alongside it. See [CONTRIBUTING.md](CONTRIBUTING.md#supplemental-files) for details.

## Example submissions

- [`ssn-scrubber`](integrations/hooks/pre-request/ssn-scrubber/):  A pre-request guardrail that detects and redacts SSNs from prompts before they reach the LLM provider.
- [`highflame`](integrations/hooks/pre-request/highflame/):  A security and observability platform that supports both pre-request enforcement and post-response observability. Dual-type integration using `additional_types`.

## Resources

- [Protocol quick reference](docs/protocol-reference.md):  Contributor-focused summary of the webhook protocol: payload types, event types, send values, configuration, and validation examples. Start here for hook integrations.
- [Integration template](templates/integration.md):  The template all submissions follow.
- [Template guide](templates/README.md):  Explains which sections apply to which integration types.
- [Contributing guide](CONTRIBUTING.md):  Submission process, review criteria, CLA/DCO requirements, and deprecation policy.
- [Aperture documentation](https://tailscale.com/docs/aperture):  Official Aperture docs.
- [Aperture configuration reference](https://tailscale.com/docs/aperture/configuration):  Full specification for providers, grants, hooks, quotas, and connectors.
- [Guardrails](https://tailscale.com/docs/aperture/guardrails):  Conceptual guide to pre-request hooks.

## License

Contributions are licensed under the [BSD 3-Clause License](LICENSE).
