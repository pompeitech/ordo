# Architecture

Ordo separates deterministic domain logic from harness-specific mapping, terminal interaction, and AI-assisted decision support delegated to the selected coding harness. The current package graph implements the catalog and installation foundation; the target runtime and workspace boundaries are documented in [Product vision](product-vision.md).

## Package graph

```text
@pompeitech/ordo (CLI)
├── @pompeitech/ordo-adapter-claude ──┐
├── @pompeitech/ordo-adapter-codex ───┼──> @pompeitech/ordo-core
└─────────────────────────────────────┘

@pompeitech/ordo-runtime ─────────────────> @pompeitech/ordo-core
@pompeitech/ordo-agent-claude ─────────────> @pompeitech/ordo-runtime
@pompeitech/ordo-agent-codex ──────────────> @pompeitech/ordo-runtime
@pompeitech/ordo-tools ────────────────────> @pompeitech/ordo-runtime
ordo (VS Code) ────────────────────────────> @pompeitech/ordo-core
```

Source packages use workspace dependencies. The published CLI artifact bundles the core, both adapters, terminal prompts, and canonical catalog into one dependency-free executable. Decision assistance is a workflow responsibility and must use the user's selected Claude Code or Codex harness; Ordo does not integrate a separate inference service.

The 2.0 target runtime is harness-neutral, but its supported executors are deliberately limited to Claude Code and Codex. It owns Ordo workflow gates, run/session records, context manifests, policy decisions, normalized events, and audit. The two execution adapters delegate model inference, credentials, and native coding tools to the installed/authenticated Claude Code or Codex harness. Ordo must not call Anthropic/OpenAI model APIs directly or grow adapters for arbitrary providers/local model endpoints. The existing `ordo-provider-*` packages implement an earlier direct-provider prototype and are transitional, not the target architecture.

## Core responsibilities

`packages/core` owns:

- repository and manifest inspection;
- package-manager, stack, and harness detection;
- configuration parsing and defaults;
- catalog loading, filtering, and validation;
- adapter contracts and registry;
- path ownership, checksums, planning, transactional installation, and state;
- diagnostics;
- workflow parsing, state transitions, and programmatic execution;
- repository-local project memory, context visibility, payload preview, and token estimation;
- repository-shared agent/skill/rule/workflow profiles, catalog pinning, and session selection validation;
- shared specifications, explorations, architecture proposals, plans, sessions, and their states;
- decision-provider, confidence, fallback, escalation, and audit contracts.

Core must not import the CLI, a concrete adapter, terminal libraries, or a vendor decision client.

## Adapter responsibilities

An adapter declares identity and native layout, resolves a target, validates target constraints, detects harness markers, and maps canonical entries to immutable output files.

Adapters may transform format-specific metadata. They must not:

- modify canonical catalog files;
- write destination files directly;
- bypass repository path validation;
- decide conflict or pruning policy;
- call an AI provider.

All filesystem mutation remains in the core installer.

## CLI responsibilities

`packages/cli` owns argument parsing, the interactive initializer, command orchestration, human/JSON formatting, and stable exit codes.

The CLI calls core and adapter APIs but does not reimplement installation rules. `runCli()` accepts injected input/output dependencies so tests can exercise command behavior without mutating global streams.

The `profile` commands initialize, inspect, validate, and update `.ordo/profile.json` references against a canonical content catalog. Session creation validates the repository profile and persists its hash and effective content selections. The current direct-provider session prototype revalidates these pins and applies selected agent, skills, and active rules to its system prompt; the target Claude Code/Codex adapters must translate these exact pinned inputs into native harness instructions/skills and record the effective versions.

The build emits a bundled `dist/bin.js` and copies canonical content to `dist/content`. `prepack` always rebuilds this artifact.

## Team workspace extension

`packages/vscode-ordo` is the VS Code surface for teams working from shared project requirements and business context. It reads and writes repository-local artifacts through the same core contracts used by the CLI. Specifications, decisions, architecture proposals, plans, sessions, and context can be reviewed through ordinary source control, so the team has a shared change history and review process.

```text
shared .ordo artifacts in the project repository
  -> @pompeitech/ordo-core validation and state transitions
  -> VS Code extension host
  -> typed messages over a nonce-protected webview
  -> project workspace view and source navigation
```

Ordo ships as this VS Code extension (`pompeitech.ordo`) together with the CLI; the Code OSS desktop distribution is frozen (ADR-0002). Team decisions remain in versioned files, Claude Code/Codex credentials remain in their secure local configurations, and the same artifacts are available through CLI automation. Ordo must not depend on Microsoft services beyond the marketplaces it is published to; the frozen Code OSS spike is an internal document, not versioned.

## Detection flow

```text
directory
  -> repository root + package manifest
  -> package manager detection
  -> stack detection
  -> harness detection
  -> immutable DetectReport
  -> human or JSON output
```

Detection uses structured evidence only. Repository routing does not require a probabilistic model.

## Installation flow

```text
repository
  -> configuration
  -> catalog validation + selection
  -> adapter target resolution + mapping
  -> previous ownership state
  -> filesystem/checksum comparison
  -> deterministic installation plan
  -> dry-run report OR atomic apply
  -> next ownership state
```

No destination is written while catalog, adapter, state, or plan validation is incomplete.

## Workflow engine

The workflow loader turns canonical Markdown sections into `WorkflowDefinition`. The state machine enforces pending, running, succeeded, failed, and cancelled transitions. `runWorkflow()` accepts an injected step executor and never assumes a specific LLM or tool runtime.

Current CLI behavior installs workflows as harness skills. Native `ordo run` orchestration is planned work, not current functionality.

## Context flow

```text
.ordo/brain.md + visible tracked files
  -> safe repository path resolution
  -> deterministic ordered context blocks
  -> approximate token estimate
  -> exact payload preview
  -> immutable context snapshot
  -> Claude Code or Codex adapter input
```

The adapter must consume the immutable snapshot so Ordo's displayed payload cannot diverge from the Ordo-owned content handed to the harness. Claude Code/Codex may add their own system instructions or runtime context; Ordo must disclose if it cannot inspect that final model payload.

## Session runtime flow

```text
immutable context snapshot + persisted session events + user prompt
  -> Claude Code or Codex harness session
  -> streamed text / tool calls / usage
  -> approval policy for mutating tools
  -> tool result returned through the harness
  -> append-only session audit events
  -> completed turn observed by CLI or UI
```

The runtime defaults to denying Ordo-controlled mutating operations when no approval policy is supplied. The adapter must also preserve native harness approvals/sandbox restrictions; Ordo must not silently weaken them. Direct provider message/tool loop code is transitional and not the supported long-term execution flow.

## Deterministic decisions

The core decision contract exposes `choose`, `score`, and `assert`. Rule-based decisions are deterministic and return confidence `1`. `resolveDecision()` accepts a threshold and either accepts, applies an explicit fallback, or escalates.

Audited deterministic decisions record request ID, decision kind, value, confidence, and fallback status. If Ordo later needs probabilistic decision support, it must use the already selected Claude Code/Codex harness through its adapter; introducing a third inference/provider path is outside the current product scope.

Probabilistic decisions are appropriate only for unstructured inputs such as intent classification, safety triage, or error classification. Structured repository and installation decisions remain rule-based.

## Extension rules

Add a core feature when behavior is harness-independent and deterministic. Add an adapter feature when canonical content must be translated into a harness-native representation. Add a CLI or editor feature only for input, presentation, or orchestration.

Every public behavior change requires focused tests and the complete verification sequence described in the [release process](release-process.md).
