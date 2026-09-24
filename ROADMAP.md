# Ordo roadmap

Ordo is becoming a governed AI engineering workspace: repository-local knowledge, inspectable context, provider-neutral sessions, structured decision work, staged execution, and team-visible operations. See [Product vision](docs/product-vision.md) for the target operating model and invariants.

## 1.0.x — Stabilization

- Keep the published installer and Claude Code/Codex adapters stable.
- Keep clean-runner release, tarball, lint, typecheck, and test gates green.
- Resolve packaging, diagnostics, and documentation regressions without changing the 1.0 configuration contract.

## 1.1.0 — Project memory and Context

- Repository-local `.ordo/brain.md` project memory.
- Versioned context index with safe tracked-file references.
- `ordo context init/add/hide/show/remove`.
- Exact context preview with source attribution and token estimates.
- Context snapshots with content hashes and reproducible payload assembly.
- Context policies for rules, skills, attachments, and session state.
- Documented `minimal`, `standard`, and `full` catalog profiles.

The first CLI vertical slice is implemented; snapshots, policy composition, and harness consumption remain.

## 1.2.0 — Sessions and provider runtime

- Provider-neutral request, response, streaming, usage, and error contracts.
- OpenAI, Anthropic, OpenRouter, GitHub, and local OpenAI-compatible providers.
- Persistent append-only session event logs and resumable conversations.
- Repository tools, diffs, scoped approvals, and MCP bridge.
- Context compaction with visible summaries and preserved provenance.
- Headless `ordo session` commands and stable APIs for interactive clients.

## 1.3.0 — Explore and specifications

- Read-only intent, divergence, simulation, convergence, and crystallization phases.
- Alternative branches with explicit trade-offs and user selection.
- Approved specifications stored under `.ordo/specs/`.
- Direct handoff from an approved spec into Architect.

## 1.4.0 — Architect

- Persistent plans containing phases and explicit steps.
- Step states: pending, running, paused, completed, cancelled, skipped, and error.
- One linked execution session and diff summary per step.
- Review gates, reorder, reset, retry, pause, and resume.
- `ordo plan` and `ordo run` automation with machine-readable events.

## 2.0.0 — Team workspace

- Desktop or VS Code-compatible UI with Sessions, Context, Explore, Architect, and Control Center.
- Provider/model configuration backed by secure credential storage.
- Skills, MCP server lifecycle, tool explorer, policies, monitoring, usage, and audit views.
- Team policy packs and portable repository configuration.
- Migration tooling for any incompatible schema or ownership changes.

## Release policy

- Patch releases fix regressions without changing the public contract.
- Minor releases add backward-compatible capabilities.
- Major releases are reserved for incompatible schema, runtime, adapter, or installation changes.
- Every release updates [`CHANGELOG.md`](CHANGELOG.md), passes the [release verification gate](docs/release-process.md), and receives an annotated `vX.Y.Z` Git tag.
