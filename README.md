# Ordo

Ordo is a deterministic agent-engineering CLI for installing and coordinating reusable agents, rules, skills, and workflows across Claude Code and Codex.

## Install

```bash
npm install -g @pomepitech/ordo
```

## Quick start

```bash
ordo init --adapter claude --adapter codex
ordo install
ordo doctor
```

The wizard can configure either harness, select catalog content, choose conflict policy, and install safely. Ordo intentionally does not install, manage, or run local/open models.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Supported integrations

- Claude Code
- Codex

The catalog contains reusable agents, rules, skills, and workflows. `ordo doctor` validates repository state and `ordo install --dry-run` previews changes without writing files.

## License

MIT
