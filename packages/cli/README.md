# @pomepitech/ordo

Ordo is a deterministic CLI for coordinating Claude Code and Codex repositories.

## Install

```bash
npm install -g @pomepitech/ordo
```

## Initialize a repository

```bash
ordo init --adapter claude --adapter codex
ordo install
ordo doctor
```

The interactive wizard supports Claude Code, Codex, content selection, conflict policy, and safe installation. Ordo does not install, manage, or run local/open models.

## Commands

| Command | Purpose |
| --- | --- |
| `ordo init` | Create `ordo.config.json` |
| `ordo install` | Install selected catalog content |
| `ordo doctor` | Validate configuration and targets |
| `ordo detect` | Inspect repository and harnesses |
| `ordo agents` | Inspect catalog agents |
| `ordo rules` | Inspect catalog rules |
| `ordo skills` | Inspect catalog skills |
| `ordo workflows` | Inspect catalog workflows |

Claude Code and Codex remain the supported integrations. Existing repositories containing legacy local-model files are no longer managed by Ordo.
