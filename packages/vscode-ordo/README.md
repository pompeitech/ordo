# Ordo for VS Code

Ordo adds a project workspace for teams that need shared business requirements, acceptance criteria, decisions, context, and implementation plans alongside their code.

The extension reads and writes the repository-local Ordo artifacts through `@pompeitech/ordo-core`. Specifications, explorations, architecture proposals, plans, and context live under `.ordo/` and can be reviewed and shared through the team's normal Git workflow. The extension never sends project artifacts or credentials to a hosted Ordo service.

Ordo ships as a VS Code extension (`pompeitech.ordo`) that also runs in editors based on VS Code that install extensions from Open VSX.

## Features

Ordo opens as a full page in the editor (Activity Bar → Ordo, or **Ordo: Open Ordo**), with a side menu:

- **Overview**: counts, quick actions, project memory, team profile summary, AI connections and plan usage.
- **Chat**: ask Claude Code or Codex about the project, and switch agent at any message. Read-only, and personal: chats stay on this machine.
- **Requirements**, **Plans**, **Decisions**, **Sessions**: the shared artifacts under `.ordo/`, opened beside the page. New requirements and implementation plans are created from here, and an existing plan is never overwritten.
- **Team profile**: which agents, skills, rules, and workflows the team uses (required, default, recommended, available, or disabled), saved to `.ordo/profile.json` only after reviewing the pending changes. Skills and rules that fit the detected stack are suggested with their evidence. The catalog is the repository's own `content/` or, failing that, the one shipped with Ordo.
- **Run a step**: in a panel of the Workflow page, pick Claude Code or Codex, see how many tokens Ordo will send, and follow the agent's output.
- **Code review**: in a panel of the Workflow page, keep or undo each file the agent changed (with VS Code's diff editor one click away), then approve, request changes, or block.
- **AI connections**: whether the Claude Code and Codex CLIs are installed and signed in, and how much of the plan's 5-hour and weekly windows is used. Codex is read live; Claude Code shows the last value reported during a run. An agent that is not signed in cannot run.

Plan usage is personal: it stays in `$XDG_STATE_HOME/ordo/usage.json` (default `~/.local/state/ordo/usage.json`) on this machine and is never written to `.ordo/`.

## Settings

- `ordo.closeSidebarOnOpen` (default `true`): close the sidebar when Ordo opens from the Activity Bar, so the page uses the full width.

## Chat with Claude Code or Codex

**Ordo → Chat** (or **Ordo: Open Chat**) is a conversation with the agents you already have. It is read-only: the agent can read and search the project but cannot change files or run commands. Claude Code gets only its `Read`, `Grep` and `Glob` tools; Codex runs in its read-only sandbox. To change code, use a plan step and its code review.

**Example**, in any project:

1. Open **Chat**, choose **Claude Code** at the top and ask `Where are card numbers validated?`. Press Enter (Shift+Enter adds a line). The answer streams in, and **Stop** interrupts it.
2. Ask a follow-up, `Does it accept 15 digits?`. Claude continues its own conversation: Ordo sends only the new message.
3. Switch to **Codex** and ask `Would a Luhn check fit there?`. Before you send, the chat says what Codex has not seen, for example "Codex has not seen 4 earlier messages: Ordo hands them over with your next message (~180 tokens)". Codex receives that transcript once, then continues its own thread.
4. Chats are listed on the left, with **New chat** and **Delete**. In a narrow window the list becomes a drop-down above the conversation. The chat always fills the window: messages scroll, the message box stays at the bottom and grows as you type. Answers show Markdown: code blocks, inline code, bold and lists.

Chats are personal: they are stored in `$XDG_STATE_HOME/ordo/chats/` (default `~/.local/state/ordo/chats/`, or `$ORDO_STATE_DIR/chats/`), readable only by you, never in `.ordo/` or Git. Each message uses your own Claude Code or Codex plan, like a run. The agent keeps its conversation in its own CLI (a Claude Code session, a Codex thread); if it has forgotten one, Ordo starts a new one with the full transcript.

## Run a step with an agent

A plan step that is ready shows **Run** in **Ordo → Workflow**. Everything happens in a panel at the top of that page, without dialogs. Ordo uses the same runtime as `ordo agent`, so the same gates apply: the specification must be `ready`, the team profile valid, shared context present, and the agent installed and signed in.

**Example**, with the demo (`pnpm ordo:demo`), after approving the step `errors`:

1. The row "Safe checkout" shows **Run "logging"**. Click it: the **Run step** panel opens.
2. Pick the agent with its button, **Claude Code** or **Codex**. An agent that is not connected is greyed out and says why.
3. The panel shows what Ordo will send before the agent reads any code, as a bar with a legend, for example `~6,000 tokens`: specification and step ~200, project context ~120, profile instructions ~5,650. It also shows the session's agent, skills and rules. Optionally add an instruction, then press **Start**.
4. The agent's text streams into the panel, and **Stop** interrupts it. If Codex asks to run a command, the request appears in the panel with **Allow once** and **Decline**.
5. When the agent finishes, the panel turns into the code review of what it changed.

The run uses your own Claude Code or Codex plan (or API key). Ordo records the estimate in the session manifest (`promptEstimatedTokens`) next to the tokens the agent reports.

## Code review of agent work

Every agent run started from Ordo is photographed before and after, so a person reviews exactly what the agent changed before the step can go on.

**Example**, with the demo (`pnpm ordo:demo`):

1. Open **Ordo → Workflow**. The row "Safe checkout" shows **Review step** for the step `errors`. Click it: the **Code review** panel opens at the top of the page.
2. Every file the agent changed is listed with a check box, its kind (A added, M modified, D deleted) and its line counts: `README.md`, `src/checkout.ts`, `src/errors.ts`. **Diff** opens that file in VS Code's diff editor beside the page (before the run on the left, the file now on the right); the panel stays where it is.
3. Uncheck `README.md`, which the agent rewrote for no reason.
4. Choose **Approve**, **Request changes** or **Block**. The last two need a note, which the panel asks for inline.
5. Press **Undo 1 file and submit review**. `README.md` goes back to its text from before the run; the other two files stay. In the replay, the review shows "kept 2 file(s) · undone: README.md".

If you edited a file by hand after the agent finished, Ordo refuses to undo it and the panel names the file. Nothing is undone and nothing is recorded, so your work is never overwritten. Outside a Git repository the review still works, without a diff. From the terminal: `ordo plan changes <plan> --step-id <step> --diff` and `ordo plan review … --reject <file>` (see the CLI reference).

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
pnpm --filter ordo preview # screenshots of the page at 1440, 1024, 760 and 500 px
```

The tests cover the plan input mapping, plan creation against a real `.ordo/` fixture, and the AI connection helpers. The webview UI has no automated tests; `preview` renders it outside VS Code with the demo data and a dark theme, writes an HTML file and four screenshots per tab to `$TMPDIR/ordo-preview` (or `ORDO_PREVIEW_DIR`), and warns when a page is wider than the window. It needs Google Chrome, or `ORDO_PREVIEW_CHROME`. Example: `ORDO_PREVIEW_TABS=chat,workflow pnpm --filter ordo preview`.
