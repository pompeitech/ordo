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

Scripts should check the exit code before consuming JSON output.

## Current command boundary

The core contains workflow and decision-provider APIs, but this release does not expose `ordo run`, `ordo eval`, or JEV commands. Installed workflows are consumed by Claude Code and Codex as harness skills.
