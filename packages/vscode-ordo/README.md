# Ordo for VS Code

Ordo adds a project workspace for teams that need shared business requirements, acceptance criteria, decisions, context, and implementation plans alongside their code.

The extension reads and writes the repository-local Ordo artifacts through `@pompeitech/ordo-core`. Specifications, explorations, architecture proposals, plans, and context live under `.ordo/` and can be reviewed and shared through the team's normal Git workflow. The extension never sends project artifacts or credentials to a hosted Ordo service.

Ordo ships as a VS Code extension (`pompeitech.ordo`) that also runs in editors based on VS Code that install extensions from Open VSX.

## Features

Ordo opens as a full page in the editor (Activity Bar → Ordo, or **Ordo: Open Ordo**), with a side menu:

- **Overview**: counts, quick actions, project memory, team profile summary, AI connections and plan usage.
- **Requirements**, **Plans**, **Decisions**, **Sessions**: the shared artifacts under `.ordo/`, opened beside the page. New requirements and implementation plans are created from here, and an existing plan is never overwritten.
- **Team profile**: which agents, skills, rules, and workflows the team uses (required, default, recommended, available, or disabled), saved to `.ordo/profile.json` only after reviewing the pending changes. Skills and rules that fit the detected stack are suggested with their evidence. The catalog is the repository's own `content/` or, failing that, the one shipped with Ordo.
- **Code review**: after each agent run, the changed files open in the diff editor; keep or undo each file, then approve, request changes, or block.
- **AI connections**: whether the Claude Code and Codex CLIs are installed and signed in, and how much of the plan's 5-hour and weekly windows is used. Codex is read live; Claude Code shows the last value reported during a run. An agent that is not signed in cannot run.

Plan usage is personal: it stays in `$XDG_STATE_HOME/ordo/usage.json` (default `~/.local/state/ordo/usage.json`) on this machine and is never written to `.ordo/`.

## Settings

- `ordo.closeSidebarOnOpen` (default `true`): close the sidebar when Ordo opens from the Activity Bar, so the page uses the full width.

## Code review of agent work

Every agent run started with `ordo agent` is photographed before and after, so a person reviews exactly what the agent changed before the step can go on.

**Example**, with the demo (`pnpm ordo:demo`):

1. Open **Ordo → Workflow**. The row "Safe checkout" shows **Review step** for the step `errors`.
2. Click it. The list of files the agent changed appears (`README.md`, `src/checkout.ts`, `src/errors.ts`), each checked, and the first diff opens beside it: before the run on the left, the file now on the right. The diff button on each row opens that file's diff.
3. Uncheck `README.md`, which the agent rewrote for no reason, and press Enter.
4. Choose **Approve** (or request changes / block with a note) and confirm **Undo and record the review**.
5. `README.md` is back to its text from before the run; the other two files stay. In the replay, the review shows "kept 2 file(s) · undone: README.md".

If you edited a file by hand after the agent finished, Ordo refuses to undo it and names the file. Nothing is undone and nothing is recorded, so your work is never overwritten. Outside a Git repository the review still works, without a diff. From the terminal: `ordo plan changes <plan> --step-id <step> --diff` and `ordo plan review … --reject <file>` (see the CLI reference).

## Agent credentials

Ordo runs the `claude` and `codex` executables installed by the user and relies on the account they are already signed in to. Ordo never offers its own Claude or ChatGPT login and never reads the CLIs' credential files. See [ADR-0001](../../docs/adr/0001-connessioni-agenti-e-credenziali.md).

- `ordo.claudeCode.path` and `ordo.codex.path` set an optional absolute path to each executable. If they are empty, Ordo uses `PATH`. Both are machine-scoped, so a repository cannot override them.
- **Claude Code** can use the user's Anthropic API key. It is stored in the operating system keychain and passed as `ANTHROPIC_API_KEY` to the `claude` process, and only when Claude Code is not logged in.
- **Codex** can be logged in with the user's OpenAI API key through the official `codex login --with-api-key`. Codex stores the key and Ordo keeps no copy. Run `codex logout` to remove it.

Ordo itself does not call model APIs; all AI work runs through Claude Code or Codex.

## Demo

```sh
pnpm ordo:demo         # builds, creates /tmp/ordo-demo and opens a separate VS Code with Ordo
pnpm ordo:demo:clean   # closes that VS Code window and deletes the demo
```

The demo project is always the same: a requirement that went through most of the workflow, with a review that asked for changes, a rerun and a step waiting for review; a requirement waiting for approval; and an open exploration. The command prints what to show. Agent runs are simulated; everything else goes through the real Ordo core. `ORDO_DEMO_DIR` changes the location (the folder must be named `ordo-demo`), and `ORDO_DEMO_CODE` points to another `code`-compatible CLI. `pnpm test:demo` checks that the scenario still matches the product.

## Development

```sh
pnpm --filter ordo build   # bundle into dist/
pnpm --filter ordo test    # builds core/runtime, then unit and plan-flow tests
```

The tests cover the plan input mapping, plan creation against a real `.ordo/` fixture, and the AI connection helpers. The webview UI and the interactive plan flow are not covered by automated tests yet.
