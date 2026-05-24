## Description

<!-- Brief description of the integration you are submitting or updating. -->

## Contributor checklist

- [ ] Copied the integration template from `templates/integration.md`
- [ ] Placed submission in the correct directory under `integrations/`
- [ ] Filled in all required frontmatter fields
- [ ] Included working code examples
- [ ] Supplemental files (if any) are referenced from the README
- [ ] Tested the integration against a current Aperture instance

## Reviewer checklist

- [ ] Template compliance: all required sections present
- [ ] Technical accuracy: hook definition, grant wiring, and response format snippets are valid and sufficient for adaptation
- [ ] Hook type categorization is correct (`integration_type` and `additional_types` if applicable)
- [ ] The `dst` key requirement for tailnet grants is called out
- [ ] If hook uses `modify` action on requests: cache impact implications are noted
- [ ] Security review: no credentials, tokens, or sensitive data in examples
- [ ] External links are valid and point to maintained resources
- [ ] CLA signed and commits are DCO signed-off
