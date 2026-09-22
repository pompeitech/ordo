# Ordo roadmap

This roadmap records the intended product direction. It is guidance, not a promise of delivery dates. Every item remains subject to scope, tests, security review, and compatibility work.

## 1.0.x — Stabilization

Patch releases must preserve the 1.0 public behavior and configuration schema.

### 1.0.2

- Fix the `ambiguous-lockfiles` repository fixture and keep the full workspace test suite green.
- Harden release workflows on clean GitHub runners.
- Improve CLI error messages and invalid-option handling.
- Verify the globally installed tarball in an isolated npm prefix.
- Close documentation and packaging inconsistencies found after the first publication.

## 1.1.0 — Profiles and efficient configuration

The first feature release focused on making Ordo easier to adopt and cheaper in context usage.

- Add documented `minimal`, `standard`, and `full` content presets.
- Provide a low-token profile with only routing, coding standards, testing, verification, and review guidance.
- Add `ordo config validate` for explicit configuration diagnostics.
- Make `ordo init` selection and configuration editing easier to understand.
- Select optional rules and skills from detected repository stack evidence without silently changing user files.
- Improve Claude Code and Codex target validation and human-readable output.

## 1.2.0 — Catalog distribution and repository scale

- Improve distribution and versioning of custom catalogs.
- Add preview and diff support when updating an installed catalog.
- Support versioned remote catalogs only with explicit, auditable configuration.
- Improve monorepo detection and installation boundaries.
- Add adapter capabilities only when the target harness contract and safety behavior are well tested.

## 2.0.0 — Optional architectural extensions

Reserve a major release for deliberate compatibility changes, such as:

- a new configuration schema or migration mechanism;
- a public plugin and adapter API;
- a fully implemented optional JEV decision provider;
- native workflow execution from Ordo;
- a redesigned ownership or installation model.

Local/open model runtimes and model downloads are not part of the current product direction. Ordo remains focused on deterministic catalog management, safe installation, and Claude Code/Codex integration.

## Release policy

- Patch releases fix regressions without changing the public contract.
- Minor releases add backward-compatible capabilities.
- Major releases are required for incompatible schema, adapter, or installation changes.
- Every release updates [`CHANGELOG.md`](CHANGELOG.md), passes the [release verification gate](docs/release-process.md), and receives an annotated `vX.Y.Z` Git tag.
