# Release process

This document describes a reproducible release candidate. Publishing and remote mutation require explicit authorization, but every release commit must be represented by an annotated Git tag.

## Preconditions

- The intended version and release scope are explicit.
- The working tree contains no unexplained generated artifacts.
- Public behavior and configuration changes are documented.
- `CHANGELOG.md` has an entry for the exact version and release date.
- Canonical catalog changes pass validation.
- Node.js 20.12 or newer and the workspace pnpm version are available.

## Verification gate

Run from the workspace root:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The gate must include core, adapters, CLI, standalone-package isolation, catalog validation, examples, and fixtures. A package with zero tests must be reported explicitly rather than hidden by aggregate success.

## Build artifact

The CLI build performs three tasks:

1. TypeScript compilation for development and declarations.
2. esbuild bundling of the executable and all runtime dependencies.
3. Copying the canonical catalog to `dist/content`.

The npm package intentionally contains only:

```text
dist/bin.js
dist/content/**
LICENSE
README.md
package.json
```

It has no runtime dependencies and does not expose the CLI source package as a JavaScript library.

## Pack locally

```bash
mkdir -p artifacts
cd packages/cli
pnpm pack --pack-destination ../../artifacts
cd ../..
```

`prepack` rebuilds automatically. Inspect the tarball listing and packaged `package.json`. Confirm that no workspace protocol remains in runtime dependencies and no source checkout path is embedded as the selected catalog.

## Isolated global smoke test

Use a temporary npm prefix so the test does not replace a developer's global command:

```bash
TEMP_PREFIX="$(mktemp -d)"
TEMP_PROJECT="$(mktemp -d)"
npm install --global --prefix "$TEMP_PREFIX" ./artifacts/pompeitech-ordo-1.0.0.tgz
cd "$TEMP_PROJECT"
npm init -y
"$TEMP_PREFIX/bin/ordo" --version
"$TEMP_PREFIX/bin/ordo" init --yes --adapter codex --json
"$TEMP_PREFIX/bin/ordo" install --dry-run --json
```

The generated configuration must point to `dist/content` inside the temporary global installation, not to the Ordo workspace.

For a full release candidate, apply installation in the temporary project and require a healthy Doctor report:

```bash
"$TEMP_PREFIX/bin/ordo" install --json
"$TEMP_PREFIX/bin/ordo" doctor --json
```

## Version consistency

Before publication, align:

- CLI package version;
- `CLI_VERSION` output;
- tarball name used by documentation;
- changelog or release notes;
- any schema compatibility statement.

The npm version, changelog heading, Git tag, and GitHub release name must agree:

```text
package version: 1.0.0
changelog:       ## [1.0.0] - YYYY-MM-DD
Git tag:         v1.0.0
GitHub release:  v1.0.0
```

Schema versions change only for contract incompatibility and are independent of package semantic versions.

## Commit, tag, and publish

Complete the verification gate first, then create one release commit. Do not tag a dirty tree or tag a commit that is not already on the release branch:

```bash
VERSION=1.0.0
git diff --check
git status --short
git add CHANGELOG.md package.json packages/cli/package.json README.md docs
git commit -m "release: v$VERSION"
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin main
git push origin "v$VERSION"
```

After the tag is pushed, create the GitHub release from that tag and copy the matching changelog section into its notes. Only then publish the npm artifact:

```bash
cd packages/cli
npm publish --access public
```

Never move or reuse a published tag. A correction requires a new patch version, a new changelog entry, a new annotated tag, and a new npm publication.

## Automated npm publication

The repository contains [`.github/workflows/release.yml`](../.github/workflows/release.yml). It runs only for annotated semver tags matching `vX.Y.Z` and performs the following checks before publishing:

1. installs the frozen workspace lockfile;
2. verifies that the tag matches `packages/cli/package.json`;
3. runs lint, typecheck, CLI tests, and the workspace build;
4. publishes `@pompeitech/ordo` from `packages/cli` with npm provenance.

Configure the repository before the first automated release:

- create an npm access token with permission to publish `@pompeitech/ordo`;
- add it as the repository or `npm` environment secret named `NPM_TOKEN`;
- protect the `npm` environment with an approval rule if releases require manual approval;
- enable npm provenance/trusted publishing for the repository when available.

The workflow never runs for ordinary branch pushes. A release is published by pushing a new annotated tag after the release commit:

```bash
git push origin main
git push origin v1.0.0
```

The tag must not already exist on npm. If the verification job fails, no npm publication is attempted.

## Publication boundary

Publishing is an external, irreversible action. Stop after producing and verifying the tarball unless the user explicitly authorizes registry authentication and publication.

When authorized, scoped public publication uses the package's `publishConfig.access` setting. Verify registry identity and package ownership before running any publish command.

## Rollback

Never overwrite an already published semantic version. If a release is defective, prepare a new patch version, document the regression, verify the replacement artifact, and deprecate the defective version only with explicit registry authorization.
