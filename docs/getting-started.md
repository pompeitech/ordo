# Getting started

This guide takes a repository from no Ordo configuration to an installed Claude Code, Codex, or MiniCPM harness.

## Requirements

- Node.js 20.12 or newer.
- A target directory containing either a `.git` directory or `package.json`.
- Write access to the target repository for installation.
- Docker with Compose v2 when using `ordo minicpm setup`; external MiniCPM endpoints do not require Docker.

Ordo itself does not require the target repository to use npm, pnpm, Yarn, or Bun. Package-manager detection is informational and evidence-based.

## Install Ordo

Install the standalone package globally from npm:

```bash
npm install --global @pomepitech/ordo
ordo --version
```

For local development, build and link the current checkout:

```bash
pnpm install
pnpm build
cd packages/cli
npm link
```

The standalone package and development build both include the canonical catalog. A target repository does not need its own `content/` directory.

## Inspect the repository

Run detection before writing anything:

```bash
ordo detect
```

The report identifies the repository root, package-manager evidence, recognized technologies, and existing Claude, Codex, or MiniCPM markers. Detection is read-only.

Use JSON in scripts:

```bash
ordo detect --json
```

## Initialize interactively

From the target repository root, run:

```bash
ordo init
```

The wizard performs these decisions in order:

1. Select Claude Code, Codex, MiniCPM, or a combined target.
2. Detect and validate the canonical content catalog.
3. Select all content or choose entries by category.
4. Select the conflict strategy.
5. Decide whether stale Ordo-owned files may be pruned.
6. Decide whether to install immediately.

If installation is declined, Ordo creates only `ordo.config.json` and prints the commands needed to continue.

## Initialize non-interactively

Safe defaults configure both adapters, use conflict strategy `error`, disable pruning, and select all catalog content:

```bash
ordo init --yes
```

Select one adapter explicitly:

```bash
ordo init --yes --adapter codex
ordo init --yes --adapter claude
ordo init --yes --adapter minicpm
```

Non-interactive initialization does not install content automatically. Continue with a dry run and installation:

```bash
ordo install --dry-run
ordo install
```

## Understand generated files

For Codex, Ordo may create:

```text
AGENTS.md
.agents/rules/
.agents/skills/
.codex/agents/
```

For Claude Code, Ordo may create:

```text
.claude/agents/
.claude/rules/
.claude/skills/
```

For MiniCPM, Ordo may create:

```text
MINICPM.md
.minicpm/agents/
.minicpm/rules/
.minicpm/skills/
.minicpm/workflows/
```

Every successful real installation also writes `.ordo/state.json`. This state file records ownership and checksums; it is not a cache and should not be edited manually.

## Verify and start the harness

After installation:

```bash
ordo doctor
```

Then launch the configured harness from the same repository:

```bash
codex
```

or:

```bash
claude
```

or let Ordo install and run MiniCPM with Docker, then start its native terminal interface:

```bash
ordo minicpm setup
ordo minicpm
```

`setup` defaults to MiniCPM5 2B Q4, persists the model cache under `.ordo/minicpm/models/`, and waits until the API is ready. Run `ordo minicpm models` before setup to see smaller and higher-quality presets. The colorized terminal interface automatically compacts older messages and tool results to remain inside the configured context window. Claude Code and Codex keep their external runtimes; MiniCPM can use Ordo's managed Docker runtime or any compatible external server.

## Update installed content

After upgrading Ordo, changing `ordo.config.json`, or editing a custom catalog, preview and apply the new plan:

```bash
ordo install --dry-run
ordo install
ordo doctor
```

Unchanged files produce `skip` actions. Files modified after installation are protected according to the configured conflict strategy.

## Continue reading

- Use the [CLI reference](cli-reference.md) for every command and option.
- Use the [configuration reference](configuration.md) for content selection and installation policy.
- Read [installation safety](installation-safety.md) before enabling overwrite or pruning.
