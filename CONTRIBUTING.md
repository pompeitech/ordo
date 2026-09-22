# Contributing to Ordo

Thanks for contributing to Ordo. Small, focused pull requests are easiest to review and release.

## Before you start

1. Search existing issues and pull requests.
2. For a bug, include a minimal reproduction and the expected behavior.
3. For a feature, open an issue first when the change affects the public CLI, configuration schema, adapters, or safety behavior.

## Development setup

Requirements: Node.js 20.12+ and pnpm 10.

```bash
git clone https://github.com/pompeitech/ordo.git
cd ordo
pnpm install
pnpm build
```

## Verification

Run before opening a pull request:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If a test is already failing on `main`, report it clearly in the pull request instead of hiding or weakening the test.

## Pull requests

- Use a descriptive title in imperative form.
- Keep unrelated refactors out of the change.
- Add or update tests for behavior changes.
- Update the relevant README or document in the same change.
- Update `CHANGELOG.md` under `Unreleased` for user-visible changes.
- Never commit credentials, model keys, generated `dist` output, or local `.ordo/state.json` files.

All changes require review before merge. Releases are made from annotated semantic-version tags; see [the release process](docs/release-process.md).
