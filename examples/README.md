# Ordo examples

This directory contains copyable examples for the public Ordo configuration and catalog contracts. Every JSON configuration and catalog example is parsed or validated by the automated test suite.

Examples are intentionally separate from [`fixtures/`](../fixtures/README.md): examples teach supported usage, while fixtures exercise detection and validation edge cases.

## Inventory

| Path | Purpose |
| --- | --- |
| [`configs/both-harnesses.json`](configs/both-harnesses.json) | Install the complete catalog for Claude Code and Codex |
| [`configs/codex-curated.json`](configs/codex-curated.json) | Install an explicit, minimal Codex selection |
| [`configs/custom-layout.json`](configs/custom-layout.json) | Use repository-local output directories and a shared catalog |
| [`custom-catalog/`](custom-catalog/) | Small valid catalog showing all four content kinds |
| [`ci/verify-ordo.sh`](ci/verify-ordo.sh) | Read-only CI verification of configuration, catalog, and installation plan |

## Using a configuration example

Copy an example to the root of the repository that Ordo should manage:

```bash
cp /path/to/ordo/examples/configs/both-harnesses.json ./ordo.config.json
```

The first two examples omit `contentRoot` deliberately. Supply the catalog when installing:

```bash
ordo doctor .
ordo install . --content-root /absolute/path/to/ordo/content --dry-run
ordo install . --content-root /absolute/path/to/ordo/content
```

For a standalone npm installation, the recommended approach is `ordo init .`; it writes the path of the bundled catalog into the generated configuration. Use the files here when you need a reviewed, version-controlled template or want to understand the schema.

Before applying any example, inspect the plan with `--dry-run`. The default `error` conflict policy prevents Ordo from silently replacing an unowned file.

## Example: both harnesses

[`both-harnesses.json`](configs/both-harnesses.json) installs every catalog entry into both default adapter roots:

- `.claude/` for Claude Code;
- `.codex/` for Codex.

It is the broadest example and is useful for a repository used with both tools.

## Example: curated Codex installation

[`codex-curated.json`](configs/codex-curated.json) demonstrates allowlists. When an `include` list is present, only those IDs from that content kind are selected. IDs must match frontmatter `name` values, not filenames inferred by the reader.

The example selects:

- the `planner` and `tdd-guide` agents;
- common, TypeScript, and security rules;
- testing and verification skills;
- the `plan`, `implement`, and `review` workflows.

Unknown IDs are rejected before installation.

## Example: custom catalog and layout

[`custom-layout.json`](configs/custom-layout.json) assumes this directory structure in the target repository:

```text
repository/
├── shared-ordo-content/
│   ├── agents/
│   ├── rules/
│   ├── skills/
│   └── workflows/
└── ordo.config.json
```

It writes adapter output below `ai/claude` and `ai/codex`. Output directories must be relative, must remain inside the repository, and must not contain `..` segments.

The catalog under [`custom-catalog/`](custom-catalog/) is a compact authoring reference. To test it without changing the main configuration:

```bash
ordo install . --content-root /path/to/ordo/examples/custom-catalog --dry-run
```

## CI verification

Copy [`ci/verify-ordo.sh`](ci/verify-ordo.sh) into a repository whose `ordo.config.json` contains a resolvable `contentRoot`, or pass an explicit catalog path as the second argument:

```bash
./verify-ordo.sh /path/to/project /path/to/catalog
```

The script runs diagnostics and a dry-run installation only. It does not mutate the repository. A non-zero exit stops the job.

## What examples guarantee

Automated tests guarantee that:

- every JSON file under `configs/` satisfies the current configuration parser;
- the custom catalog passes the current catalog validator;
- local Markdown links resolve to existing files or directories;
- the CI script is syntax-checked by Bash when Bash is available.

They do not guarantee that an example's selected IDs exist in every external catalog. Selection is validated against the catalog supplied at runtime.
