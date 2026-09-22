# @pomepitech/ordo

```text
   ██████╗        ██████╗ ██████╗ ██████╗  ██████╗
  ██╔═══██╗      ██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗
  ██║ █ ██║      ██║   ██║██████╔╝██║  ██║██║   ██║
  ██║   ██║      ██║   ██║██╔══██╗██║  ██║██║   ██║
  ╚██████╔╝      ╚██████╔╝██║  ██║██████╔╝╚██████╔╝
   ╚═════╝        ╚═════╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝
```

Deterministic content and workflow management for Claude Code and Codex.

## Install

```bash
npm install -g @pomepitech/ordo
```

## Quick start

```bash
ordo init
ordo install --dry-run
ordo install
ordo doctor
```

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

Use `--json` for automation and `ordo install --dry-run` to preview changes. Existing unmanaged files are protected by default and Ordo does not manage model runtimes.

Full documentation: [github.com/pompeitech/ordo](https://github.com/pompeitech/ordo).
