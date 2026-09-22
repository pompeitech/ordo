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

Read-only repository inspection. The report contains repository evidence, package-manager status and conflicts, detected technologies, and Claude/Codex/MiniCPM markers.

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
| `--adapter <claude\|codex\|minicpm>` | Select a target; repeat to select several |
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

## `ordo minicpm`

```bash
ordo minicpm [chat] [directory] [options]
ordo minicpm setup [directory] [options]
ordo minicpm start [directory]
ordo minicpm stop [directory]
ordo minicpm status [directory]
ordo minicpm models [directory]
```

With no subcommand, starts a coding-agent session against the configured or explicitly selected OpenAI-compatible endpoint. `setup` creates `.ordo/minicpm/runtime.json` and `compose.yaml`, pulls the llama.cpp Docker image, downloads the selected GGUF through the container, starts the server, and waits for API health. Models and sessions are cached locally and ignored by Git.

| Chat option | Meaning |
| --- | --- |
| `--base-url <url>` | Override the configured API base URL |
| `--model <name>` | Override the configured served model name |
| `-p`, `--prompt <text>` | Run one non-interactive request |
| `--no-tools` | Send plain chat requests without repository tools |
| `--max-tokens <number>` | Limit each model completion |
| `--max-tool-turns <number>` | Tool rounds before a resumable safety pause; default `48`, maximum `128` |
| `--session <name>` | Load and save a named local session |
| `--no-session` | Disable session persistence |
| `--dangerously-auto-approve` | Run mutating tools without confirmation |

| Setup option | Meaning |
| --- | --- |
| `--model <preset>` | `minicpm5-2b-q4` by default; use `models` to list choices |
| `--port <number>` | Bind the API to localhost on this port; default `8080` |
| `--context-size <number>` | llama.cpp context size; default `8192` |
| `--accelerator <auto\|cpu\|cuda>` | Select the container image and GPU configuration |
| `--no-start` | Generate configuration and pull the image without starting |
| `--force` | Replace an existing runtime configuration |

Environment overrides are `ORDO_MINICPM_BASE_URL`, `ORDO_MINICPM_MODEL`, and `MINICPM_API_KEY`. The interactive interface is a colorized agent shell showing model, project, endpoint, session, context budget, streamed output, structured tool activity, and approval prompts. It supports `/help`, `/status`, `/model`, `/tools`, `/context`, `/clear`, and `/exit`. `/tools` shows the effective tool registry and permissions. `/context` reports estimated usage, message and tool counts, compactions, active agent, and loaded guidance.

Before each request, Ordo reserves completion and tool-schema capacity, bounds individual tool results, and compacts the oldest complete message groups when necessary. Assistant tool calls and their results are retained or removed together so the OpenAI-compatible message sequence remains valid. A compact execution ledger helps the model avoid repeating forgotten work, and identical tool calls are suppressed after two attempts. Reaching the tool-round budget creates a resumable pause and preserves the session instead of failing the command.

Read/list/search tools are non-mutating. For writes, replacements, and shell commands, the interactive approval prompt accepts `y` for the current action, `a` for all remaining mutations in the current process, and `N` to deny. Session-wide approval is deliberately reset when the process exits. `--dangerously-auto-approve` enables it immediately. Non-interactive mode denies mutating calls unless that flag is enabled.

Tool events expose sanitized arguments, a bounded result preview, status, duration, and whether an agent, rule, skill, or workflow was loaded. Reading a catalog agent from `.minicpm/agents/` parses its canonical `tools:` field and restricts subsequent API tool definitions accordingly: `Read`, `Grep`, `Glob`, `Write`, `Edit`, and `Bash` map to `read_file`, `search_files`, `list_files`, `write_file`, `replace_in_file`, and `run_command`. The profile resets for the next user request unless another agent is loaded.

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

The core contains workflow and decision-provider APIs, but this release does not expose `ordo run`, `ordo eval`, or JEV commands. Installed workflows are consumed by Claude Code and Codex as harness skills and by MiniCPM through its generated routing index.
