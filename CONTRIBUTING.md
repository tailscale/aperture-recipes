# Contributing to aperture-recipes

This document explains how to submit integration documentation to this repository and what to expect during the review process.

## Who can contribute

Anyone building integrations, hooks, or extensions for Aperture can submit to this repo. This includes third-party vendors, partners, and community members. The assumption is that you are technical enough to work with a GitHub pull request workflow, though an issue-based path is available as a fallback.

## What to submit

Submit integration documentation that follows the provided template at `templates/integration.md`. Each submission lives in its own directory under the appropriate category:

```
integrations/
├── hooks/
│   ├── pre-request/your-integration/README.md
│   └── post-response/your-integration/README.md
├── providers/your-integration/README.md
└── tools/your-integration/README.md
```

Submissions should include inline code examples (configuration snippets, sample requests, expected responses) directly in the README. If your integration involves a full code implementation, host that in your own repository and link to it from the submission. This repo is for documentation, not runnable code.

Some integrations support multiple event types (for example, both pre-request enforcement and post-response observability). Use the `additional_types` frontmatter field for these -- refer to the template README for details.

### Supplemental files

Your integration directory can include additional files alongside `README.md`. These are useful for:

- **Variant configurations**: separate Markdown files for different deployment modes, provider combinations, or use cases (for example, `aws-deployment.md`, `self-hosted.md`).
- **Scripts and code samples**: helper scripts, example hook implementations, or configuration generators that complement the documentation (for example, `example-hook.py`, `validate-config.sh`).
- **Images and screenshots**: diagrams, architecture overviews, or UI screenshots referenced from the README (for example, `architecture.png`, `dashboard-setup.png`).

The `README.md` remains the primary entry point. Supplemental files should be referenced from the README so reviewers and readers can discover them. Keep the directory focused. Include files that directly support the integration documentation, not full application codebases.

## What not to submit

This repo is not the right place for:

- **Feature requests or bug reports** for Aperture itself. Use the main [Aperture feedback channels](https://tailscale.com/contact/support) instead.
- **Support questions**: Refer to the [Aperture documentation](https://tailscale.com/docs/aperture) or community channels.
- **Aperture CLI contributions**: The CLI is not accepting external contributions at this time.
- **Full application codebases**: This repo is for integration documentation, not deployable applications. Include helper scripts and code samples as supplemental files, but host full implementations in your own repository and link to them.

## Contributor license agreement and sign-off

Tailscale requires two things from all contributors across its open source repositories.

**Contributor License Agreement (CLA)**: A CLA-bot will comment on your pull request when you open it. If you have not signed the CLA before, the bot will walk you through the process. You only need to sign the CLA once. It covers all Tailscale repositories.

**Developer Certificate of Origin (DCO)**: Every commit must include a sign-off line certifying that you have the right to submit the contribution. Add it by committing with the `--signoff` (or `-s`) flag:

```
git commit --signoff -m "Add integration docs for my-service"
```

This appends a `Signed-off-by: Your Name <your@email.com>` line to the commit message. The DCO GitHub app runs in CI and will block PRs with unsigned commits. Read the full DCO text at [developercertificate.org](https://developercertificate.org/).

If you forget to sign off, you can amend your most recent commit with `git commit --amend --signoff` and force-push.

## How to submit

### Pull request path (primary)

1. Fork this repository.
1. Copy `templates/integration.md` into the correct directory under `integrations/`. For example, a synchronous hook integration goes in `integrations/hooks/pre-request/your-integration/README.md`.
1. Fill out every section of the template. Remove sections marked as optional that do not apply (such as "Troubleshooting", "Security considerations", or "Reference").
1. Fill in all required frontmatter fields: `name`, `provider`, `provider_url`, `integration_type`, and `date_submitted`. The `status` field defaults to `community` if omitted.
1. Add any supplemental files (variant docs, scripts, images) to the same directory. Reference them from the README.
1. Commit with `--signoff` and push to your fork.
1. Open a pull request against the `main` branch. The PR description should briefly summarize what the integration does.

### Issue path (fallback)

If you are not comfortable with pull requests, use the integration submission issue form in this repository's Issues tab. Provide the same information the template asks for, and the review team will help create the PR on your behalf.

## Quality bar

Submissions must meet the following minimum standard:

- Follow the template structure with all required sections filled out.
- Include working inline code examples (configuration snippets, sample API calls, expected responses).
- Provide copy-pasteable configuration snippets for the integration-specific pieces (hook endpoint, `send_hooks` wiring). These do not need to be complete Aperture configurations. Show enough that a developer with an existing Aperture setup can adapt the example.
- Fill in all required frontmatter fields with accurate values.
- Be written clearly enough that another developer can set up the integration by following the documentation alone.
- For hook integrations: include a valid hook definition (`hooks` map entry) and grant wiring (`send_hooks` entry) with valid `send` field values. Refer to the [protocol quick reference](docs/protocol-reference.md) for the specification.
- If the same hook may appear in multiple grants, note that `events` and `send` lists are merged (union) and the hook fires once per request.

Submissions that are missing required sections or include placeholder content will be sent back for revision.

## Review process

All submissions are reviewed by the Aperture team before merge. Submission does not guarantee acceptance or publication as official Aperture documentation.

The review covers four areas:

**Template compliance**: Does the submission follow the template structure? Are all required frontmatter fields filled in? Are optional sections handled correctly?

**Technical accuracy**: Are the hook definition, grant wiring, and response format valid? Is the integration type correctly identified? Do the inline examples work as described?

**Security assessment**: Are there credentials, API keys, or secrets in the examples? Are the security implications of the integration documented? Does the hook handle sensitive data appropriately?

**Known gotcha verification**: The review team checks for two common issues. First, if the integration involves grants, the documentation must warn that tailnet grants require an explicit `dst` key (omitting it silently applies the grant to nothing). A brief callout is sufficient; you do not need to show complete grant examples in both Aperture and tailnet syntax. Second, if the integration modifies request content (via the `modify` action), the documentation must include the cache impact note explaining that current-turn modifications have no cache impact while historical context modifications do (refer to the "Cache impact" callout in `templates/integration.md`).

The docs/ecosystem lead triages incoming PRs. Aperture engineers review the technical and security aspects. Expect the review to involve at least one round of feedback.

## Response times

The review team is small. Set your expectations accordingly:

- **Initial triage**: within one week of submission.
- **Full review**: may take longer depending on complexity and team workload.
- **Revisions**: you will be notified on the PR if changes are needed. PRs with no activity from the contributor for 30 days may be closed.

## Content status

Every submission has a `status` field in its frontmatter. There are three possible values:

**`community`** is the default status on merge. The integration was contributed and is maintained by the submitter. It has passed review but is not part of Aperture's official documentation.

**`official`** means the Aperture team has promoted the content. This happens when an integration meets the official documentation standard and the team has verified it independently. Contributors cannot set this status themselves.

**`deprecated`** means the content is no longer accurate or compatible with current Aperture versions. Deprecated submissions remain in the repo but are clearly marked. Refer to the deprecation policy below.

## Deprecation and staleness policy

Integration documentation can become stale as Aperture evolves. This policy defines how stale content is identified and handled.

### What triggers a staleness review

A submission may be flagged as stale when any of the following occur: an Aperture update affects the integration's functionality, external links in the documentation are broken, or the original contributor is unresponsive to filed issues for 90 days. The 90-day unresponsiveness check is a manual review trigger, not an automated process.

### Responsibility

The original contributor is expected to keep their submission current. The review team may flag stale content by opening an issue and applying a `stale` label, but the team is not responsible for maintaining third-party integration docs.

### Outcomes

When content is flagged as stale, a `stale` label is applied to the tracking issue and a warning banner is added to the submission's README. If the content is not updated within 60 days of being flagged, the `status` frontmatter field is changed to `deprecated` (deprecation escalation). This 60-day window is separate from the 90-day unresponsiveness trigger above. The 90-day period determines when a staleness review is opened, while the 60-day period determines when a flagged submission is escalated to deprecated. Deprecated content stays in the repository but is clearly marked as no longer current.

## Licensing

All contributions are licensed under the [BSD 3-Clause License](LICENSE), matching the rest of this repository. By submitting a pull request, you agree that your contribution will be licensed under these terms.

## Code of conduct

This project follows the [Tailscale community code of conduct](https://tailscale.com/kb/1488/code-of-conduct). Be respectful and constructive in all interactions.
