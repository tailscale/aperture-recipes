## Description

<!-- Brief description of the integration you are submitting or updating. -->

## Contributor checklist

- [ ] Copied the integration template from `templates/integration.md`
- [ ] Placed submission in the correct directory under `integrations/`
- [ ] Filled in all required frontmatter fields
- [ ] Included working examples appropriate to the integration type
- [ ] Supplemental files (if any) are referenced from the README
- [ ] Tested the integration against a current Aperture instance
- [ ] For hooks: documented control and trigger tests with pass criteria for my deployed endpoint

## Reviewer checklist

- [ ] Template compliance: all required sections present
- [ ] Technical accuracy: type-specific configuration and grant snippets are valid and sufficient for adaptation
- [ ] Integration categorization is correct (`integration_type` and `additional_types` if applicable)
- [ ] Grant examples identify their location; tailnet policy grants include `dst`, while config-file grants omit it
- [ ] If hook uses `modify` action on requests: cache impact implications are noted
- [ ] Security review: no credentials, tokens, or sensitive data in examples
- [ ] External links are valid and point to maintained resources
- [ ] CLA signed and commits are DCO signed-off
