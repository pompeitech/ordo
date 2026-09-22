# Architecture

Ordo separates deterministic domain logic from harness-specific mapping, terminal interaction, and optional probabilistic decisions.

## Package graph

```text
@pomepitech/ordo (CLI)
├── @pompeitech/ordo-adapter-claude ──┐
├── @pompeitech/ordo-adapter-codex ───┼──> @pompeitech/ordo-core
└─────────────────────────────────────┘

@pompeitech/ordo-decision-jev ───────────> @pompeitech/ordo-core
```

Source packages use workspace dependencies. The published CLI artifact bundles the core, both adapters, terminal prompts, and canonical catalog into one dependency-free executable. The optional JEV package is not bundled.

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

The build emits a bundled `dist/bin.js` and copies canonical content to `dist/content`. `prepack` always rebuilds this artifact.

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

Detection uses structured evidence only. Repository routing does not require JEV or another probabilistic model.

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

## Decision providers

The core contract exposes `choose`, `score`, and `assert`. Rule-based providers are deterministic and return confidence `1`. `resolveDecision()` accepts a threshold and either accepts, applies an explicit fallback, or escalates.

`AuditedDecisionProvider` records request ID, decision kind, value, confidence, provider, and fallback status. A future JEV provider must implement this contract without becoming a core dependency.

Probabilistic decisions are appropriate only for unstructured inputs such as intent classification, safety triage, or error classification. Structured repository and installation decisions remain rule-based.

## Extension rules

Add a core feature when behavior is harness-independent and deterministic. Add an adapter feature when canonical content must be translated into a harness-native representation. Add a CLI feature only for input, presentation, or orchestration.

Every public behavior change requires focused tests and the complete verification sequence described in the [release process](release-process.md).
