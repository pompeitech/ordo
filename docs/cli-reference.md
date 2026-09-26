# CLI reference

## Invocation

```text
ordo <command> [directory] [options]
```

When omitted, `directory` defaults to the current working directory. Ordo resolves the nearest repository root by preferring a Git boundary and otherwise using the nearest `package.json`.

## Global options

| Option | Meaning |
| --- | --- |
| `-h`, `--help` | Show command help without inspecting the repository |
| `-v`, `--version` | Print the CLI version |
| `-j`, `--json` | Emit machine-readable JSON for commands that produce reports |

Human-readable output uses ANSI color only when appropriate. `NO_COLOR` disables color, `FORCE_COLOR=1` enables it, and JSON output never contains ANSI sequences.

## `ordo detect`

```bash
ordo detect [directory] [--json]
```

Read-only repository inspection. The report contains repository evidence, package-manager status and conflicts, detected technologies, and Claude/Codex markers.

## `ordo doctor`

```bash
ordo doctor [directory] [--content-root <directory>] [--json]
```

Validates repository discovery, Node.js support, package-manager evidence, configuration, catalog, installation state, and configured adapters.

Catalog precedence is:

1. `--content-root`;
2. `contentRoot` from the configuration;
3. `<repository>/content`.

Doctor returns exit code `1` when any diagnostic finding has severity `error`.

## `ordo init`

```bash
ordo init [directory] [options]
```

| Option | Meaning |
| --- | --- |
| `--adapter <claude\|codex>` | Select a target; repeat to select several |
| `--content-root <directory>` | Persist an explicit canonical catalog |
| `--conflict-strategy <error\|skip\|overwrite>` | Set unmanaged and modified-file behavior |
| `--prune` | Permit removal of stale, unmodified, Ordo-owned files |
| `--no-prune` | Explicitly disable pruning |
| `-i`, `--interactive` | Force the guided wizard |
| `--non-interactive` | Disable the guided wizard |
| `-y`, `--yes` | Use safe non-interactive defaults |
| `--force` | Replace an existing Ordo configuration |
| `-j`, `--json` | Initialize non-interactively and emit `InitReport` JSON |

The wizard is selected automatically only when stdin and stdout are terminals and neither `--yes` nor `--json` is present. `--interactive` cannot be combined with `--json` or `--yes`.

Init writes configuration atomically. Without `--force`, an existing `ordo.config.json` or `.ordorc.json` is never replaced.

## `ordo install`

```bash
ordo install [directory] [--content-root <directory>] [--dry-run] [--json]
```

The command loads configuration and catalog, maps selected entries through every configured adapter, compares the result with the filesystem and `.ordo/state.json`, and builds one deterministic plan.

`--dry-run` performs all validation and planning but writes neither destination files nor installation state. A plan containing conflicts is not partially applied and returns exit code `1`.

## `ordo context`

```bash
ordo context init
ordo context add docs/domain/business-rules.md
ordo context
ordo context preview
ordo context snapshot
ordo context hide docs/domain/business-rules.md
ordo context show docs/domain/business-rules.md
ordo context remove docs/domain/business-rules.md
```

`init` creates `.ordo/brain.md` and `.ordo/context/index.json` without overwriting existing memory. `add` tracks an existing file inside the repository. Hidden entries remain indexed but are excluded from preview. `preview` prints the exact ordered blocks Ordo prepares for a future harness request and an approximate token estimate. `snapshot` persists that Ordo-owned payload under `.ordo/context/snapshots/` using a content-derived identifier and reuses an existing identical snapshot. Claude Code/Codex may add their own runtime instructions that Ordo cannot necessarily inspect.

All context actions accept `--json`. Mutating actions accept `--repository <directory>` when the target is not the current repository.

## `ordo profile`

```bash
ordo profile init --default-agent architect --rule typescript-coding-style --dry-run
ordo profile init --default-agent architect --rule typescript-coding-style
ordo profile show
ordo profile validate
ordo profile set agents architect --mode default
```

The shared `.ordo/profile.json` references canonical agent, skill, rule, and workflow IDs plus content hashes; it does not copy prompt files into the project. By default, all catalog agents are allowed, common rules are required, other rules are recommended, and workflows are enabled. Skills are included only when selected during initialization. `--agent`, `--rule`, and `--skill` can be repeated to restrict/enable entries or choose default rules. The profile may specify one default agent. Use `set` to change an entry to `enabled`, `recommended`, `default`, `required`, or `disabled`. `validate` detects missing or changed catalog entries; review catalog changes before updating the profile.

Session creation validates an existing profile and records its hash plus the effective agent, skills, rules, and workflow references. If no default agent is configured, pass `--agent <id>`. Enabled skills and rules can be selected with repeated `--skill <id>` and `--rule <id>` flags. Use `--content-root` when the catalog is not in its normal location. Profile `init` and `set` support `--dry-run`.

## `ordo session`

```bash
ordo session create --title "Implement billing rules" \
  --provider openai \
  --model <model> \
  --context-snapshot <snapshot-id>
ordo session list
ordo session show <session-id>
ordo session export <session-id> --json
ordo session run <session-id> --prompt "Summarize the billing rules"
```

Sessions are repository-local records with append-only JSONL event logs under `.ordo/sessions/`. Runtime, context snapshot, status, messages, tool activity, approvals, diffs, verification, and usage share a harness-neutral schema. **Current implementation note:** `session run --provider ...` is an early direct-provider prototype retained for development; it is not the product execution target and does not constitute Claude Code/Codex integration. The target runner delegates exclusively to installed/authenticated Claude Code or Codex, preserving their credentials and native coding-agent loop. Messages, tool calls, approvals, and available usage are appended to the session event log.

When a shared project profile exists, create the session with `--agent <id>` and zero or more `--skill <id>` options (or rely on the profile default agent). The selection is frozen into the session record with content hashes. The current prototype validates the profile/catalog and adds selected agent, skills, and active rules to a direct-provider prompt; the target Claude Code/Codex adapters must translate those pinned selections into native harness inputs and block if the catalog has changed. If the catalog is outside the repository or configured default, pass `--content-root` to `session run` as well.

## `ordo agent claude`

```bash
ordo agent claude --spec checkout --plan checkout-plan --step api \
  --skill payments-domain --prompt "Preserve backward compatibility"
ordo agent claude --spec checkout --plan checkout-plan --repository ./service --json
```

Requires a `ready` specification, a valid plan linked to that spec, a ready plan step, a valid shared project profile with the `implement` workflow enabled, and at least one visible block in the Ordo project-context snapshot. Ordo freezes the profile selection and context snapshot, composes them with the spec, plan step, acceptance criteria, expected output, verification commands, and only the applicable `implement` workflow (not every enabled workflow), then records an audit session before starting Claude Code. Select the project-default agent or pass `--agent`; repeat `--skill` and `--rule` for enabled profile entries. `--prompt` adds a task-specific instruction without replacing the approved task.

The locally installed Claude Code CLI runs headless with its normal permission behavior; Ordo never reads credentials or enables permission bypass. Streaming text, declared runtime capabilities, available usage, and the native session ID are recorded in the Ordo session. On success the plan step is paused for human review and verification, not marked complete. Use `ordo plan finish <plan-id> --step-id <step-id> --status completed` only after reviewing the result and running the listed verification. A failed run records an error and marks the step as error. Ctrl-C terminates the Claude child process, records the native session ID if already received, pauses both Ordo session and plan step, and exits with code 130. JSON output includes the Ordo session ID, native Claude session ID, capabilities, spec/plan/step IDs, and context snapshot ID.

This vertical slice does not yet map Claude's native approval requests into Ordo UI, enforce path-level plan areas, or resume an interrupted native session. Cancellation is currently Ctrl-C in the CLI; it preserves a paused Ordo session/step but does not itself expose a resume command. Claude's own permission controls remain authoritative; Ordo's path/scope review and deterministic verification are still required. A basic smoke test has been completed against a real macOS Claude Code NVM install and Claude Pro account; approval, resume, sandbox, and platform/version matrix validation remain open.

## `ordo brainstorm`

```bash
ordo brainstorm create --title "Checkout design" --problem "Choose a consistency model"
ordo brainstorm add checkout-design --title "Saga" --summary "Compensating steps" --tradeoff "More moving parts"
ordo brainstorm select checkout-design --alternative saga
ordo brainstorm crystallize checkout-design --acceptance "A failed payment releases stock"
ordo brainstorm list
ordo brainstorm show checkout-design
```

Brainstorming is read-only with respect to project code. Explorations under `.ordo/explore/` move from `intent` through `diverging` and `converging` to `crystallized`. Only the selected alternative can be crystallized, and crystallization writes a Markdown spec under `.ordo/specs/`.

## `ordo spec`

```bash
ordo spec create --title "Checkout" --objective "Create a safe checkout" --acceptance "A valid order succeeds"
ordo spec list
ordo spec show checkout
ordo spec validate checkout
ordo spec status checkout --status ready
```

Specs are Markdown files with YAML frontmatter under `.ordo/specs/`. Status is one of `draft`, `ready`, `implemented`, `verified`, or `superseded`. `validate` returns exit code `5` when the spec is invalid.

## `ordo architect`

```bash
ordo architect create --spec checkout --title "Checkout architecture" \
  --impact "orders module" \
  --component '{"name":"OrderService","responsibility":"Persist orders","changes":["validate totals"]}' \
  --contract "POST /orders returns 201" \
  --decision "Use optimistic locking" \
  --risk "Concurrent updates"
ordo architect list
ordo architect show checkout-architecture
ordo architect approve checkout-architecture
```

An architecture proposal links an existing spec to its impacted areas, components, contracts, decisions, and risks. Proposals are stored under `.ordo/architectures/` with status `proposed` and are never approved implicitly: `approve` is an explicit human action, and a proposal can be approved only once. `create` and `approve` accept `--dry-run`.

## `ordo plan`

```bash
ordo plan create --title "Checkout plan" --spec checkout \
  --step '{"id":"schema","description":"Add order schema","expectedOutput":"Migration","verification":["pnpm test"]}' \
  --step '{"id":"api","description":"Expose endpoint","expectedOutput":"Route","dependsOn":["schema"],"verification":["pnpm test"]}'
ordo plan validate checkout-plan
ordo plan run checkout-plan [--step-id schema] [--session <session-id>]
ordo plan finish checkout-plan --step-id schema --status completed
ordo plan review checkout-plan --step-id schema --decision changes-requested --note "Add the CVV test"
ordo plan changes checkout-plan --step-id schema [--diff]
ordo plan review checkout-plan --step-id schema --decision approved --reject src/legacy.ts
```

Plans are JSON documents under `.ordo/plans/` with atomic steps, dependencies, and verification commands. `run` starts only a step whose dependencies are complete; starting a blocked step fails with exit code `3`. `finish` records `completed`, `error`, `paused`, `cancelled`, or `skipped`. `create`, `run`, and `finish` accept `--dry-run`, and `validate` returns exit code `5` for an invalid plan.

`review` records a person's decision on a step an agent finished: `ordo agent` leaves every step paused for review. The decisions are:

- `approved` completes the step;
- `changes-requested` makes it runnable again;
- `blocked` stops it.

The last two require `--note`. Only a person can review a step. The decision is written to the audit log with the reviewer's name and appears in the decision trail.

`ordo agent` photographs the working tree before and after every run. Each photo is a Git tree built from a temporary index: no commit, your own index untouched, untracked files included, ignored files and `.ordo/` excluded. A local ref under `refs/ordo/snapshots/` keeps each photo from being garbage-collected.

- `changes` lists the files the latest run of a step added, modified or deleted, with line counts; `--diff` prints the unified diff.
- `review --reject <path>` (repeatable) or `--reject-all` undoes files before recording the decision, restoring the version from before the run.
- Undo is all or nothing: if a rejected file was edited after the agent finished, nothing is undone and the command fails with the list of conflicts.
- The audit entry of the review records which files were accepted and which were rejected.
- Outside a Git work tree the run and the review still work, without a diff.

## `ordo status`

```bash
ordo status [directory] [--json]
ordo status --spec checkout [--json]
```

Without `--spec`, `status` lists every requirement, plus every exploration not yet crystallized, across the fixed workflow `brainstorm → spec → architect → plan → implement → verify → review → record`. Each phase is `done`, `in-progress`, `blocked`, `not-started`, `skipped` (an optional phase the team went past), or `unavailable` (not implemented by Ordo yet). The current phase explains what blocks it and names the next allowed action. The gates match the ones the other commands enforce: for example, agents run only after the specification is `ready`.

With `--spec`, `status` prints the decision trail of that requirement, oldest first. It includes:

- the exploration and its alternatives, chosen and not chosen, with trade-offs;
- status changes and the architecture approval;
- plans and steps;
- every agent session, including reruns after a review asked for changes;
- review decisions.

Each entry is marked as a 👤 human decision, 🤖 agent work, ⚙️ an automatic Ordo transition, or recorded activity. Agent entries show the tokens the harness reported and flag the run that used the most; runs whose harness reports no usage say "tokens not measured". Every entry comes from an Ordo record:

- `audit`: the append-only log in `.ordo/audit/<kind>/<id>.jsonl`. It is written on every state change, with the actor from `ORDO_ACTOR` or Git's `user.name` (never an email) and the actor type from `ORDO_ACTOR_TYPE`, which defaults to a person.
- `artifact`: the artifact's own fields. Marked `approximate` when only the last-update time is known.
- `session`: agent sessions under `.ordo/sessions/`.

Git history is not used. History that was never recorded is left out rather than invented.

## Catalog inspection commands

```bash
ordo agents [directory] [--id <name>] [--content-root <directory>] [--json]
ordo rules [directory] [--id <name>] [--content-root <directory>] [--json]
ordo skills [directory] [--id <name>] [--content-root <directory>] [--json]
ordo workflows [directory] [--id <name>] [--content-root <directory>] [--json]
```

Without `--id`, each command returns a deterministic metadata list. With `--id`, it returns the complete canonical Markdown for the exact entry. Inspection is read-only.

## Exit codes

| Code | Contract |
| --- | --- |
| `0` | Command completed successfully |
| `1` | Operational failure, unhealthy Doctor report, or blocked installation plan |
| `2` | Invalid CLI syntax, unsupported option, or unknown command |
| `3` | Blocked plan transition, such as starting a step with incomplete dependencies |
| `5` | Spec or plan validation failed |
| `130` | Agent execution interrupted; the Ordo session and plan step are paused |

Scripts should check the exit code before consuming JSON output.

## Current command boundary

The core contains deterministic workflow and decision APIs. `ordo agent claude` and `ordo agent codex` execute one ready plan step linked to a ready spec, shared profile, and immutable Ordo context snapshot. Claude uses its local CLI; Codex uses its local app-server. Codex command-execution, file-change, and sandbox-permission requests can be answered once in the interactive CLI; non-interactive runs default to deny unless an explicit approval handler is supplied. Permission grants are scoped to the current turn; session-wide grants are not offered. The Electron approval panel, Claude native approvals, native session resume, and path-level enforcement are not yet implemented; unsupported Codex server requests fail closed and usage remains unavailable. Ctrl-C requests cancellation and preserves the Ordo session/step as paused. `ordo agent codex` passed fixture tests and a real non-mutating end-to-end scratch run on `codex-cli 0.157.0`; approval request/response behavior is contract-tested with a JSON-RPC fixture. `ordo plan run` on its own still records step state and does not invoke either coding harness. Installed workflows are consumed by Claude Code and Codex as harness skills. `ordo context preview` prepares and displays the Ordo-owned context; `ordo agent claude|codex` includes its snapshot in the task prompt.
