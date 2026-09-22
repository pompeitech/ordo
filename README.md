# Ordo

```text
   ██████╗        ██████╗ ██████╗ ██████╗  ██████╗
  ██╔═══██╗      ██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗
  ██║ █ ██║      ██║   ██║██████╔╝██║  ██║██║   ██║
  ██║   ██║      ██║   ██║██╔══██╗██║  ██║██║   ██║
  ╚██████╔╝      ╚██████╔╝██║  ██║██████╔╝╚██████╔╝
   ╚═════╝        ╚═════╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝

                    ╔═══════════════════╗
                    ║  ORDER · CONTROL  ║
                    ║  VERIFY · REPEAT  ║
                    ╚═══════════════════╝
```

**A deterministic content and workflow harness for AI-assisted software development.**

Ordo keeps the reusable engineering layer of an AI coding setup — agents, rules, skills, workflows, installation state, and safety checks — in one versioned catalog. It installs that catalog into the conventions used by Claude Code and Codex without taking ownership of your application code.

## Why Ordo?

- One catalog for agents, rules, skills, and workflows
- Deterministic, ownership-aware installation
- Explicit conflict handling and optional stale-file pruning
- Repository detection and diagnostics before changes are made
- Native targets for Claude Code and Codex
- JSON output for CI and automation
- No model runtime, credentials, or hosted service required

## Install

```bash
npm install -g @pompeitech/ordo
```

Requires Node.js 20.12 or newer.

## Quick start

From the root of an existing project:

```bash
ordo init
ordo install --dry-run
ordo install
ordo doctor
```

The interactive initializer lets you choose Claude Code, Codex, or both; select catalog content; choose a conflict policy; and decide whether installation should happen immediately.

For automation:

```bash
ordo init --non-interactive \
  --adapter claude \
  --adapter codex \
  --conflict-strategy error \
  --no-prune

ordo install
```

## CLI reference

| Command | Description |
| --- | --- |
| `ordo init` | Create or replace `ordo.config.json` |
| `ordo install` | Plan and apply catalog files safely |
| `ordo doctor` | Diagnose repository, configuration, catalog, and targets |
| `ordo detect` | Inspect repository, package manager, stack, and harness markers |
| `ordo agents` | List or inspect catalog agents |
| `ordo rules` | List or inspect catalog rules |
| `ordo skills` | List or inspect catalog skills |
| `ordo workflows` | List or inspect catalog workflows |
| `ordo --version` | Print the installed CLI version |

Most commands accept `--json` for machine-readable output. Installation accepts `--dry-run` to preview every action without writing files.

```bash
ordo doctor . --json
ordo agents . --id planner
ordo skills . --id coding-standards
ordo install . --dry-run --json
```

## How installation works

Ordo reads the canonical catalog, maps each entry to the selected target harnesses, compares the result with the previous ownership state, and creates an installation plan.

By default, unmanaged files are treated as conflicts and are never overwritten. Files previously written by Ordo can be updated deterministically. Use `--conflict-strategy skip` or `--conflict-strategy overwrite` only when intentional.

Generated ownership state is stored in `.ordo/state.json`.

## Configuration

```json
{
  "schemaVersion": 1,
  "targets": [
    { "adapter": "claude" },
    { "adapter": "codex" }
  ],
  "contentRoot": "content",
  "installation": {
    "conflictStrategy": "error",
    "prune": false
  }
}
```

Content selection can be narrowed by category:

```json
{
  "content": {
    "agents": { "include": ["planner", "code-reviewer"] },
    "skills": { "exclude": ["data-scraper"] }
  }
}
```

## Catalog layout

```text
content/
├── agents/
├── rules/
├── skills/
└── workflows/
```

Catalog entries are Markdown files with lightweight frontmatter. Projects can point to an external catalog with `--content-root` or `contentRoot`.

## Supported integrations

- **Claude Code** — `.claude/` and `CLAUDE.md`
- **Codex** — `.codex/`, `.agents/`, and `AGENTS.md`

Ordo does not install or manage model runtimes. Bring your own Claude Code or Codex environment and let Ordo manage the reusable repository guidance around it.

## Safety model

- `ordo doctor` is read-only.
- `ordo install --dry-run` is read-only.
- Existing unmanaged files are protected by default.
- Stale-file removal is opt-in through `--prune`.
- Installation is planned before it is applied.
- Writes are tracked in `.ordo/state.json`.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The public npm package is `@pompeitech/ordo`.

## Release

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cd packages/cli
pnpm pack
npm publish --access public
```

For the repository release path, push an annotated `vX.Y.Z` tag after the release commit. GitHub Actions validates the tag and publishes the matching package automatically; configure the `NPM_TOKEN` environment secret first. See the [release process](docs/release-process.md).

## Links

- [Documentation](docs/README.md)
- [CLI reference](docs/cli-reference.md)
- [Configuration](docs/configuration.md)
- [Installation safety](docs/installation-safety.md)
- [Release process](docs/release-process.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [License](LICENSE)
- [Issue tracker](https://github.com/pompeitech/ordo/issues)

## License

MIT © Davide D'Antonio
