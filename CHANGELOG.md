# Changelog

All notable changes to `@pomepitech/ordo` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use [Semantic Versioning](https://semver.org/).

## [Unreleased]

Changes that will be included in the next release go here.

## [1.0.0] - 2026-09-22

### Added

- Deterministic repository detection for Git, package managers, stacks, and Claude Code/Codex markers.
- Interactive and non-interactive `ordo init` configuration flow.
- Ownership-aware, atomic installation with dry runs, conflict strategies, pruning, checksums, and rollback.
- Claude Code and Codex adapters with canonical agents, rules, skills, and workflows.
- Catalog inspection commands for agents, rules, skills, and workflows.
- `ordo doctor` diagnostics and JSON output for automation.
- Published npm CLI package metadata for `@pomepitech/ordo`.

### Changed

- The 1.0 product boundary is limited to Claude Code and Codex integrations.
- Local/open model runtimes, model downloads, Docker model orchestration, and the removed experimental agent command are not part of this release.

### Release metadata

- Git tag: `v1.0.0`
- Author: Davide D'Antonio <davide.dantonio1984@gmail.com>

[Unreleased]: https://github.com/pompeitech/ordo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/pompeitech/ordo/releases/tag/v1.0.0
