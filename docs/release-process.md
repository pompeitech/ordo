# Release process

This document describes a reproducible release candidate. It does not authorize publishing, tagging, or creating a remote release.

## Preconditions

- The intended version and release scope are explicit.
- The working tree contains no unexplained generated artifacts.
- Public behavior and configuration changes are documented.
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
npm install --global --prefix "$TEMP_PREFIX" ./artifacts/pomepitech-ordo-1.0.0.tgz
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

Schema versions change only for contract incompatibility and are independent of package semantic versions.

## Publication boundary

Publishing is an external, irreversible action. Stop after producing and verifying the tarball unless the user explicitly authorizes registry authentication and publication.

When authorized, scoped public publication uses the package's `publishConfig.access` setting. Verify registry identity and package ownership before running any publish command.

## Rollback

Never overwrite an already published semantic version. If a release is defective, prepare a new patch version, document the regression, verify the replacement artifact, and deprecate the defective version only with explicit registry authorization.
