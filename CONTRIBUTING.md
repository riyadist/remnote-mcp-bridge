# Contributing

Thank you for contributing to this fork.

## Workflow

1. Fork and clone the repository.
2. Create a feature branch.
3. Run local checks:
   - `npm run check-types`
   - `npm run build`
4. Commit with clear messages.
5. Open a pull request.

## Pull request content

- Include a short summary.
- Include user-visible behavior changes.
- Include test steps you ran.
- If your change is related to the historical fork delta, reference:
  - `docs/COMPARISON_V1.1.0_TO_V1.1.4.md`
  - `CHANGELOG.md`

## Coding notes

- Keep backwards compatibility for existing MCP actions when possible.
- Prefer additive changes over breaking changes.
- Keep docs in English for consistency.
