# Ordo documentation

This directory contains the operational and technical documentation for Ordo. The root [README](../README.md) provides the project overview; the documents below define the behavior contributors and users may rely on.

## User guides

| Document | Purpose |
| --- | --- |
| [Getting started](getting-started.md) | Install Ordo, initialize a repository, apply content, and launch a configured harness |
| [CLI reference](cli-reference.md) | Commands, options, output modes, precedence rules, and exit codes |
| [Configuration](configuration.md) | Complete `ordo.config.json` schema, defaults, selection rules, and examples |
| [Catalog authoring](catalog-authoring.md) | Canonical layout and validation requirements for agents, rules, skills, and workflows |
| [Decision providers](decision-providers.md) | Current JEV status, provider boundaries, and deterministic 1.0 behavior |
| [Installation safety](installation-safety.md) | Ownership, checksums, conflicts, pruning, atomic writes, and recovery behavior |

## Maintainer guides

| Document | Purpose |
| --- | --- |
| [Architecture](architecture.md) | Package boundaries, dependency direction, runtime flows, and extension points |
| [Release process](release-process.md) | Verification, standalone packaging, smoke testing, versioning, and publication boundaries |

The version history is maintained in the repository [changelog](../CHANGELOG.md). Every published version must have a matching annotated Git tag.

Repository collaboration policies are documented in [CONTRIBUTING.md](../CONTRIBUTING.md), [SECURITY.md](../SECURITY.md), and [LICENSE](../LICENSE). GitHub issue forms, pull request templates, and CODEOWNERS live under [`.github/`](../.github/).

## Documentation contract

Documentation must distinguish current behavior from planned work. A command, option, path, or package is documented as available only when its implementation and tests exist in the repository.

All command examples assume execution from the target repository root unless a directory argument is shown. JSON examples use configuration schema version `1`. Paths use POSIX separators for readability; Ordo normalizes supported paths on the host platform.

Local links in this directory and machine-readable examples under [`examples/`](../examples/README.md) are checked by the test suite. Changes to public behavior must update the corresponding document in the same change.

## Current product boundary

Ordo 1.0 provides a deterministic core and CLI for:

- repository, package-manager, stack, and harness detection;
- canonical catalog loading, selection, and validation;
- interactive and non-interactive repository initialization;
- Claude Code and Codex installation planning and application;
- ownership-aware updates, conflict handling, pruning, and dry runs;
- diagnostics and catalog inspection;
- rule-based decision contracts and a programmatic workflow engine.

The standalone CLI includes its runtime and canonical content catalog. Local/open model runtimes, model downloads, Docker orchestration, JEV integration, decision evaluation commands, and native workflow execution from the CLI remain outside the 1.0 boundary.
