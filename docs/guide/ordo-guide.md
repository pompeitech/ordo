# Ordo — Complete guide

*Guide version: 26 September 2026 · VS Code extension `pompeitech.ordo` 0.1.0 · Language: English ([versione italiana](guida-ordo.md))*

This guide covers **everything** Ordo does, **how** it does it and **how to use it every day**, on your own and as a team. Each feature is described in detail and followed by concrete examples. If something is not written here, Ordo does not do it; chapter 14 lists the current limitations.

---

## Contents

1. [Ordo in one page](#1-ordo-in-one-page)
2. [Key concepts](#2-key-concepts)
3. [Installation and first start](#3-installation-and-first-start)
4. [The Ordo page and navigation](#4-the-ordo-page-and-navigation)
5. [Overview](#5-overview)
6. [Workflow: pipeline and replay](#6-workflow-pipeline-and-replay)
7. [Running a step with an agent (Run)](#7-running-a-step-with-an-agent-run)
8. [Code review of the agent's work](#8-code-review-of-the-agents-work)
9. [Requirements, Plans, Decisions, Sessions, Chat](#9-requirements-plans-decisions-sessions-chat)
10. [Team profile](#10-team-profile)
11. [AI connections and plan usage](#11-ai-connections-and-plan-usage)
12. [Working as a team](#12-working-as-a-team)
13. [Typical days: everyday examples](#13-typical-days-everyday-examples)
14. [Current limitations](#14-current-limitations)
15. [Troubleshooting](#15-troubleshooting)
16. [Reference: commands, settings, files, CLI](#16-reference-commands-settings-files-cli)
17. [Glossary](#17-glossary)

---

## 1. Ordo in one page

Ordo is a VS Code extension, with a twin CLI, that brings **order to work done with coding agents** (Claude Code and Codex) in a team.

Without Ordo, everyone asks their agent for things in their own chat. The reason for a change gets lost. Nobody knows which agent did what, who approved it or what it cost, and the team's rules live in people's heads.

With Ordo:

- **Requirements, decisions and plans are files** in the repository's `.ordo/` folder, versioned with Git like code. Everyone on the team, and every agent, starts from the same ground.
- **Work follows a fixed, visible flow:** exploration → specification → architecture → plan → implementation → (verification, review, record). Ordo shows where each requirement stands and **what blocks it**.
- **Agents run one step at a time** of an approved plan, with the team's context and rules. Ordo has no model of its own: it uses the Claude Code or Codex you installed, with your account.
- **After every agent step, a person decides.** They see the changed files in the diff editor, keep or undo each file, then approve, request changes or block.
- **You can chat with Claude Code or Codex** right in the Ordo page, and switch between them at any message. The chat is read-only and stays private, on your machine.
- **Everything is recorded:** who decided what and when, which agent worked and how many tokens it spent. The **replay** walks through the history of each requirement.

> **In one sentence:** Ordo is the system of record for work with agents. Agents execute, people decide, and everything is tracked in Git.

### What Ordo does *not* do

- It does not call AI models on its own and has no online service: everything stays on your machine and in your repository.
- It does not store your Claude or ChatGPT credentials. Sign-in stays with their CLIs; for API keys see chapter 11.
- It does not commit or push for you.
- It does not let agents work without an approved specification and a plan.

---

## 2. Key concepts

Read this chapter once; everything else depends on it.

### 2.1 Requirement (specification, "spec")

It describes **what** must be done and **why**, written for both business and developers. It is a Markdown file in `.ordo/specs/<id>.md` with these sections:

- objective, non-goals and actors;
- requirements and constraints;
- **acceptance criteria** and risks.

It has a **status**:

| Status | Meaning |
|---|---|
| `draft` | Draft: can still change. Agents **cannot** work on it. |
| `ready` | Approved by the business: agents can run its plan. |
| `implemented` | Implemented. |
| `verified` | Verified. |
| `superseded` | Replaced by another spec. |

The `id` comes from the title: "Safe checkout" becomes `safe-checkout`.

### 2.2 Exploration (brainstorm)

It comes **before** the spec, when the solution is not obvious. It holds the problem, assumptions, open questions and **several alternatives**, each with benefits, tradeoffs and risks. A person **selects** one alternative and **crystallizes** it into a spec. File: `.ordo/explore/<id>.json`.

Example: the problem "invalid payments reach the database" has two alternatives:

- "Validate before persistence" (tradeoff: more latency);
- "Reconcile nightly" (tradeoff: wrong orders visible for hours).

The first is selected, and the "Safe checkout" spec is born.

### 2.3 Architecture proposal

It explains **how** to implement a spec: impacted areas, components, contracts, decisions and risks. It starts as `proposed` and becomes `approved` only with an explicit human approval. File: `.ordo/architectures/<id>.json`.

### 2.4 Plan and steps

A **plan** breaks a spec into small, verifiable **steps**. Each step has:

- a description;
- the expected output;
- verification commands (for example `pnpm test`);
- optionally, **dependencies** (a step starts only when the steps it depends on are completed or skipped).

File: `.ordo/plans/<id>.json`.

Step statuses:

| Status | Meaning |
|---|---|
| `pending` | Waiting. When its dependencies are met it is **ready** and **Run** appears. |
| `running` | An agent is working on it. A plan can have only one `running` step at a time. |
| `paused` | The agent finished (or was stopped): **waiting for a person's review**. |
| `completed` | Approved in review. |
| `blocked` | Blocked in review. |
| `error` | The run failed. |
| `skipped` / `cancelled` | Skipped or cancelled. |

### 2.5 Session

Every agent run creates a **session** in `.ordo/sessions/`:

- `<uuid>.json` holds title, status, profile used and context snapshot;
- `<uuid>.jsonl` is the **event log**: the full request sent to the agent, its response text, permission requests, tokens and the file snapshots.

### 2.6 Project context and memory

This is what the agent receives besides the spec:

- **`.ordo/brain.md`**, the project memory: vocabulary, domain invariants, lasting decisions;
- the **context documents** registered in `.ordo/context/index.json`, for example `docs/business.md`. Each one can be visible (sent to agents) or hidden.

On every run Ordo captures the context in an **immutable snapshot** (`.ordo/context/snapshots/`), so you always know exactly what the agent received.

### 2.7 Team profile

`.ordo/profile.json` states which **agents, skills, rules and workflows** from the catalog the team uses, and how strongly (chapter 10). It is shared through Git and applies to everyone.

The **catalog** is the set of available content: agents such as `tdd-guide` and `code-reviewer`, skills such as `fastify-patterns` and `testing`, rules such as `common-security`, workflows such as `implement`. It comes from the repository's `content/` folder or, when that is missing, from the one bundled with Ordo.

### 2.8 Audit

Every creation and status change writes a line to `.ordo/audit/<kind>/<id>.jsonl`, with:

- **what** changed (from → to);
- **when**;
- **who**: the name in `git config user.name`, or `ORDO_ACTOR`;
- **what kind of actor**: 👤 person, 🤖 agent or ⚙️ Ordo itself.

It is an *append-only* log: lines are added, never modified.

### 2.9 Harness

Claude Code or Codex: the program that actually does the work on the code. Ordo calls them "harnesses".

---

## 3. Installation and first start

### 3.1 Requirements

| What | Why | How to check |
|---|---|---|
| VS Code 1.104 or later | Required by the extension | *Code → About* |
| Git | The code review diff is built on Git | `git --version` |
| Claude Code and/or Codex, installed **and signed in** | They run the steps | `claude --version`, then `claude` → `/login`; `codex --version` and `codex login` |
| A Git repository with your project | `.ordo/` lives there | `git status` |

Ordo also works with no agent installed: requirements, plans, profile and replay stay available. Only **Run** needs a connected agent.

### 3.2 Installing the extension

Ordo is not on the Marketplace yet. Install it from the `.vsix` package:

```sh
# in the Ordo repository
pnpm install
pnpm --filter ordo package          # creates packages/vscode-ordo/ordo.vsix
code --install-extension packages/vscode-ordo/ordo.vsix
```

Alternatively, from VS Code's Extensions view: `…` menu → **Install from VSIX…** → choose `ordo.vsix`.

Then open your project and, if VS Code asks, **trust the workspace**: Ordo does not run in restricted mode.

### 3.3 Installing the CLI (optional but useful)

Some operations are terminal-only today: explorations, architecture proposals and multi-step plans. In the Ordo repository:

```sh
pnpm -r build
alias ordo="node $PWD/packages/cli/dist/bin.js"   # put it in your ~/.zshrc
ordo --help
```

### 3.4 Preparing a project the first time

A full example on an existing project, `checkout-service`:

1. **Open Ordo:** click the **Ordo** icon in the Activity Bar on the left. The Ordo page opens.
2. **Shared context:** in **Overview**, if **Set up shared context** is shown, click it. Ordo creates `.ordo/brain.md` and `.ordo/context/index.json` and opens `brain.md` beside the page. Write there what every agent must know, for example:
   ```markdown
   # Project memory
   - An order does not exist until its payment is validated.
   - APIs answer 422 with a "reason" field for validation errors.
   - Never log card numbers or CVV.
   ```
3. **Context documents** (optional): to send a document such as `docs/business.md` to agents, run `ordo context add docs/business.md` in the terminal.
4. **Team profile:** **Team profile** → **Create with N suggestions** (see 10.2). Then set **one agent to `Default`**, for example `tdd-guide`, and press **Save profile**. Without a default agent, Run does not start (see 14).
5. **Connections:** **AI connections** → check that Claude Code and/or Codex show **Connected**.
6. **Commit `.ordo/`** with a clear message, for example `chore: set up Ordo for the team`, and open a pull request so the team receives it.

### 3.5 Trying everything with the demo

From the Ordo repository:

```sh
pnpm ordo:demo         # creates /tmp/ordo-demo and opens a separate VS Code with Ordo installed
pnpm ordo:demo:clean   # closes that VS Code and deletes the demo
```

The demo contains:

- a requirement ("Safe checkout") that has gone through most of the flow, with a review that requested changes, a rerun and a step waiting for review;
- a draft requirement ("Order audit trail");
- an open exploration ("Faster product search").

The command prints the steps to show. The demo's agent runs are **simulated**; everything else goes through the real Ordo core.

---

## 4. The Ordo page and navigation

### 4.1 Opening Ordo

- **Ordo icon** in the Activity Bar: opens the Ordo page as an editor tab and **closes the side bar**, so the page takes the full width. To keep the side bar open, turn off the `ordo.closeSidebarOnOpen` setting.
- **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`):
  - **Ordo: Open Ordo** opens the page;
  - **Ordo: Open Chat** opens the chat;
  - **Ordo: Open Workflow and Replay** opens the Workflow tab;
  - **Ordo: Open Team Profile** opens the Team profile tab;
  - **Ordo: Open AI Connections** opens the AI connections tab.

### 4.2 The page's side menu

| Group | Tab | Purpose |
|---|---|---|
| Project | **Overview** | The project at a glance |
| Project | **Chat** | Questions to Claude Code or Codex about the project, read-only (9.5) |
| Project | **Workflow** | Where each requirement stands, next actions, Run, code review, replay |
| Project | **Requirements** | Specifications |
| Project | **Plans** | Implementation plans |
| Project | **Decisions** | Explorations and architecture proposals |
| Project | **Sessions** | Agent runs |
| Configuration | **Team profile** | The team's agents, skills, rules and workflows |
| Configuration | **AI connections** | Claude Code and Codex: status, credentials, usage |

Next to the items you see:

- a **number**: how many items there are;
- a **coloured dot** for the status: 🟢 all good, 🟡 something to do, 🔴 a problem.

On **Workflow**, a yellow dot means "something is waiting for a person".

The page **remembers the last open tab**. Below 720 pixels wide, the menu moves to the top. Files you open from the page (specs, plans, diffs) open **beside** it, and the page stays visible.

### 4.3 Automatic refresh

The page refreshes by itself when:

- you save a file in `.ordo/`;
- you work from the terminal: `ordo agent`, `ordo plan review`, and a watcher observes `.ordo/`;
- you change Ordo's settings.

The **Refresh** button at the top right forces a refresh.

---

## 5. Overview

What it shows, from the top:

1. **Repository name** and the **Refresh** button.
2. **Quick actions:**
   - **New business requirement** creates a spec (see 9.1);
   - **Create implementation plan** creates a plan (see 9.2);
   - **Set up shared context** appears only when the context does not exist yet.
3. **Four clickable counters:** Requirements, Plans, Decisions (explorations plus architecture proposals) and Sessions. Clicking one opens its tab.
4. **"Team profile" card**, with a summary, for example *"10 agents · default tdd-guide · 4 skills · 5 required rules"*, and a button to open the profile. If there is no profile, it invites you to create one.
5. **"AI connections & plan usage" card**: for each agent its status (Connected / Not logged in / Not found) and, when connected, the plan usage meters (see 11.4).
6. **"Project memory" card**: how many context documents are visible or hidden, and the **Open brain.md** button.

**Everyday example:** in the morning you open Ordo and Overview shows Codex at 97% of its weekly quota. You decide to use Claude Code for today's steps.

---

## 6. Workflow: pipeline and replay

This is the most important tab. It has three parts:

- the **panel** at the top, for Run and code review (chapters 7 and 8);
- the **pipeline**;
- the **replay**.

### 6.1 The pipeline

There is **one row per requirement**, plus one row for each exploration not yet crystallized. The columns are the 8 phases of the flow, always in the same order:

`brainstorm → spec → architect → plan → implement → verify → review → record`

Each cell has a symbol:

| Symbol | Status | Meaning |
|---|---|---|
| ✓ | done | Phase complete |
| ◐ | in progress | Under way |
| ✕ | blocked | Blocked: something prevents moving on |
| (empty) | not started | Not started yet |
| – | skipped | Optional phase skipped (for example, a spec written without exploration) |
| · | not available yet | Phase not implemented in Ordo yet |

Hover a cell to see its summary and the reason for a block.

Under each row title you see the **tokens** agents used for that requirement, for example *"69,000 tokens + 1 not measured"*.

Below each row there is a **detail line**: the current phase, what is happening, **what blocks it**, and a **button for the next action**.

#### How Ordo computes each phase

These are the same rules the CLI and the engine apply, so the interface and the terminal always agree.

| Phase | Rule |
|---|---|
| **brainstorm** | ✓ if the requirement came from a crystallized exploration; – if the spec was written directly. An exploration not yet crystallized has its own row, with brainstorm ◐. |
| **spec** | ◐ when `draft` (waiting for business approval); ✓ when `ready`, `implemented` or `verified`; – when `superseded`; ✕ when the file is invalid. |
| **architect** | ✓ with an `approved` proposal; ◐ with a `proposed` one awaiting approval; – when the team planned without a proposal; ✕ while the spec is not `ready` yet. |
| **plan** | ✓ when a plan exists; ◐ when the plan is a draft; empty when there is none. |
| **implement** | ✕ without a plan, when the spec is not `ready`, when a step failed or was blocked in review, or when no step is ready because of dependencies. ◐ while a step runs or waits for review, or when some of the steps are completed. ✓ when every step is completed or skipped. |
| **verify** | ✓ only when the spec is `verified`; otherwise "not available yet". |
| **review**, **record** | Not available as separate phases yet. Review happens **during** the work today, after each step (chapter 8). |

#### Next actions

| Button | What it does |
|---|---|
| **Mark ready** | Asks for confirmation ("this is the business approval, recorded under your name"), then moves the spec to `ready`. |
| **Approve architecture** | Asks for confirmation and approves the proposal. |
| **Create plan** | Starts the guided plan creation (9.2). |
| **Run "<step>"** | Opens the Run panel (chapter 7). |
| **Review step** | Opens the code review panel (chapter 8). |
| **Propose architecture**, **Add an alternative**, **Select an alternative**, **Crystallize into a spec** | Terminal-only today: Ordo shows the exact command with **Copy command**. |

**Example:** the "Order audit trail" row reads *"spec: Draft · Waiting for business approval to mark it ready"* with a **Mark ready** button. The product manager reads the spec, clicks **Mark ready** and confirms. The spec moves to `ready`, and the block in the architect column disappears.

### 6.2 The replay

**Click a row** (the requirement) and the **Replay** appears below the pipeline: the full history of how that requirement got where it is.

**At the top, the numbers:** how many events, how many **👤 human decisions**, how many **🤖 agent runs**, the total tokens (plus runs not measured).

**The phase strip:** the 8 phases as boxes joined by arrows. During the replay they **light up** as the story reaches them, and the phase of the current event is highlighted. Each box shows how many human decisions happened there (👤 2) and how many tokens were spent (60k tok).

**Controls:**

- **⏮** goes back to the start;
- **▶ / ⏸** plays or pauses, one event every 0.7 seconds;
- **⏭** jumps to the end;
- the **slider** jumps to a precise point; its label shows "event 7 / 23 · 25 Sep 20:10".

**Filters:** *All*, *👤 Human decisions* (people's decisions only) and *🤖 Agent runs* (runs only).

**The timeline:** every event has an icon and a category.

| Icon | Category | Examples |
|---|---|---|
| 👤 | Human decision | Alternative selected, spec `draft → ready`, architecture approved, step review |
| 🤖 | Agent | "claude-code 2.1.282 worked on "validate"" with tokens and permission approvals |
| ⚙️ | Ordo | "validate" waiting for review (automatic pause at the end of a run) |
| • | Activity | Spec created, plan created, alternative proposed, run started |

Details shown under events:

- **"not chosen: Reconcile afterwards (Invalid orders are visible for hours)":** the rejected alternatives, with their tradeoffs.
- **"kept 2 file(s) · undone: README.md":** what the review kept and what it undid.
- **"42,000 tokens · most tokens":** the requirement's most expensive run, highlighted.
- **"tokens not measured":** the agent did not report tokens. Today this happens with Codex.
- **"from the artifact, time approximate":** events of requirements created before the audit log existed. The time is the file's last update.

**Everyday example:** the tech lead asks "why did we validate synchronously?". You open the replay of "Safe checkout", filter *Human decisions* and see:

- the alternative Davide selected on 12 September, with the rejected alternative and its tradeoff;
- the architecture Marco approved on 14 September, with the decision "Validate synchronously before persistence".

No digging through chats.

---

## 7. Running a step with an agent (Run)

### 7.1 When Run appears

The **Run "<step>"** button appears in the detail line when **all** of these are true:

- the spec is `ready`;
- the plan exists and one step is **ready**: `pending`, with its dependencies completed;
- no other step of the same plan is `running`.

### 7.2 The Run panel, step by step

Click **Run "logging"**: the **Run step "logging"** panel opens at the top of the Workflow tab.

1. **Agent:** one button per agent, **Claude Code** and **Codex**, with version and sign-in method. An agent that is not connected is **greyed out** and says why, for example *"Codex is installed but not logged in. Run `codex login`…"*. The first connected agent is selected automatically.
2. **Estimate of what Ordo will send.** As soon as you pick the agent, Ordo prepares the request **without starting anything** and shows:
   - *"Ordo will send ~6,000 tokens before the agent reads any code"*;
   - a **bar** split by part, with a legend: *Specification and plan step ~200 · Project context ~120 · Profile instructions ~5,650*;
   - the **session selection**: *Agent: tdd-guide · Skills: … · Rules: common-security, …*.

   The estimate counts about 4 characters per token, so it is approximate; the real tokens are reported by the agent and appear later in the replay. If something prevents the run (spec not `ready`, profile needing review, no default agent, missing context), you see the error **here**, before starting.
3. **Additional instruction (optional):** a note for the agent for this run only, for example *"Use the existing logger in src/logger.ts"*.
4. **Start:** starts the agent. From here:
   - the agent's text **streams into the panel** live;
   - if Codex asks for permission (for example to run `npm test`), the panel shows a *"Codex asks: …"* box with the command, folder and reason, and **Allow once** and **Decline** buttons. Each permission applies to that request only. If you close the page while a request is open, Ordo **declines** it;
   - **Stop** interrupts the agent.
5. **End:** the panel turns automatically into the **code review** of what the agent changed (chapter 8).

### 7.3 What Ordo does behind the scenes

The behaviour is identical to `ordo agent`, because the code is the same:

1. It checks the gates: spec `ready` and valid, plan valid and linked to the spec, step ready, agent installed and signed in, profile valid, context present.
2. It creates a **session** and sets the step to `running`.
3. It **captures the project files** (see 8.4).
4. It records in the session manifest what it sends: spec, step, context snapshot, agent, skills, rules, request fingerprint and **token estimate**.
5. It starts the agent in the project folder, with **your** permissions and **your** account.
6. It records every event: text, tokens, permissions requested and decided.
7. At the end it **captures the files again** and **pauses the step for review**. For Ordo, "the agent finished" does **not** mean "approved".

If you interrupt with **Stop**, the step still pauses and whatever the agent changed so far can be reviewed. If the run fails, the step moves to `error` (see 14).

### 7.4 Everyday example

It is 10:00. In the pipeline, on "Safe checkout", **Run "logging"** appears.

1. You click it, choose **Claude Code** and read the estimate: ~6,000 tokens, 5,650 of them profile instructions.
2. You add the instruction *"Never log the whole order object"* and press **Start**.
3. You follow the output while doing other things; two minutes later the panel becomes the code review.

---

## 8. Code review of the agent's work

### 8.1 When and where

After every run the step is `paused`, and **Review step** appears in the pipeline. The review opens:

- **automatically**, at the end of a Run started from the page;
- with **Review step** in the pipeline's detail line.

### 8.2 The panel, step by step

1. **List of the files the agent changed.** For each:
   - a **checkbox**: checked = **keep** the file, unchecked = **undo** it;
   - the kind: **A** added, **M** modified, **D** deleted;
   - the lines: `+2 −1`, or "binary";
   - the **Diff** button: opens the file in **VS Code's diff editor**, beside the page. Left is the version **before** the run, right is the file **as it is now**. The panel stays where it is.
2. **Decision:**
   - **Approve**: the step is done (`completed`) and the kept files stay as the agent left them;
   - **Request changes**: the step becomes **runnable again** (`pending`, Run appears again); write what must change;
   - **Block**: the step stops (`blocked`); write why.
3. **Note:** optional for Approve, **required** for Request changes and Block. If it is missing, the panel says so and sends nothing.
4. **Submit button.** It states exactly what it will do: *"Submit review"* when you keep everything, *"Undo 1 file and submit review"* when you undo one.

**What happens on submit:**

1. Unchecked files go back to their version from **before** the run: a file the agent added is deleted, a modified or deleted one is restored.
2. The decision is recorded in the audit with your name, the note and the list of **kept** and **undone** files.
3. The replay shows the review as a 👤 human decision, with "kept N file(s) · undone: …".

### 8.3 Safeguards

- **Your work is never overwritten.** If you edited by hand a file you want to undo after the run ended, Ordo **undoes nothing** and the panel lists the conflicting file. It is all or nothing: either every selected file is undone, or none is.
- **Only files the agent changed** in that run can be undone, not others.
- **Outside Git** the run and the review work, but without a diff: the panel says so and you can still record the decision.

### 8.4 How file snapshots work

Before and after each run Ordo captures a **snapshot** of the project files: a Git "tree" object, built with a temporary index.

- **No commit** and **no change to your staging area**: `git status` and `git diff --cached` stay the same.
- **Untracked** files are included; **ignored** files (`.gitignore`) and the `.ordo/` folder are excluded.
- Each snapshot is protected by a local ref `refs/ordo/snapshots/<session>-before|after`, so Git does not delete it during cleanup. These refs are **not sent** by a normal `git push`.
- The diff compares the two snapshots: if you already had your own uncommitted changes **before** the run, they do **not** show up as the agent's.

> **Important consequence:** code review with diffs happens **on the machine where the agent ran**, because snapshots are local. The replay (who decided what, which files were kept or undone) is visible to everyone through Git.

### 8.5 Everyday example

The agent was supposed to write error messages, but it also "improved" `README.md` with *"Now with AI-powered payments!"*.

1. In the panel you keep `src/checkout.ts` and `src/errors.ts`, after opening their **Diff** to check them.
2. You uncheck `README.md` and leave **Approve**.
3. You press **Undo 1 file and submit review**.

The README is back as it was, the step is completed, and the replay keeps "kept 2 file(s) · undone: README.md".

If the code had been wrong instead: choose **Request changes**, write *"Missing the test for a short CVV"* and submit. The step becomes runnable again, and the next Run picks it up.

---

## 9. Requirements, Plans, Decisions, Sessions, Chat

### 9.1 Requirements: creating a requirement

**New business requirement** (in Overview or Requirements), or *Ordo: Create Business Requirement*. VS Code asks a few questions in sequence:

| # | Question | Required | Tip |
|---|---|---|---|
| 1 | Requirement title | yes | Short, with a verb: "Allow operators to refund orders" |
| 2 | Business outcome | yes | What improves for the customer or the business |
| 3 | Actors | no | Who is involved: "Customer; Payment provider" |
| 4 | Business rules | no | Separate rules with `;` |
| 5 | Functional requirements | no | Separate with `;` |
| 6 | Acceptance criteria | yes | **Observable** results, separated with `;` |
| 7 | Open questions | no | Doubts to settle with the team |
| 8 | Constraints | no | Technical, legal, operational limits |

Semicolons become bullet lists. Ordo creates `.ordo/specs/<id>.md` as `draft` and opens it beside the page: refine it by hand like any Markdown file.

**Example:**

- *Title:* "Refund an order"
- *Outcome:* "Customers get their money back within a day when an order is cancelled"
- *Acceptance criteria:* "A cancelled paid order creates a refund; The customer receives a confirmation email; Refunds appear in the daily report"

The **Requirements** tab lists every spec with status and objective; clicking one opens the file.

### 9.2 Plans: creating a plan

**Create implementation plan**, or *Ordo: Create Implementation Plan*:

1. choose the **spec** from the list;
2. the plan **title** (suggested: "<spec> implementation");
3. the **first step**: what to do, in a bounded way;
4. the **expected output** of that step;
5. the **verification** commands, separated with `;` (for example `pnpm test; pnpm lint`).

Ordo creates `.ordo/plans/<id>.json` with **one step** (`step-1`), whose input is the spec, and opens it beside the page. An existing plan is never overwritten: the same title gives an error.

**Plans with several steps and dependencies:** today these are created from the terminal.

```sh
ordo plan create --title "Refund implementation" --spec refund-an-order \
  --step '{"id":"model","description":"Add the refund model","expectedOutput":"Migration and model","verification":["pnpm test"]}' \
  --step '{"id":"api","description":"Expose POST /refunds","expectedOutput":"Endpoint with tests","dependsOn":["model"],"verification":["pnpm test"]}'
```

The **Plans** tab shows each plan with its spec, number of steps and status.

### 9.3 Decisions

Lists **explorations** (problem and status) and **architecture proposals** (linked spec and status). Clicking one opens the file. They are created from the terminal:

```sh
ordo brainstorm create --title "Payment safety" --problem "Invalid payments reach the order store"
ordo brainstorm add payment-safety --title "Validate before persistence" \
  --summary "Reject invalid payments before saving" --tradeoff "Adds latency"
ordo brainstorm select payment-safety --alternative validate-before-persistence
ordo brainstorm crystallize payment-safety --acceptance "- Invalid cards are rejected"

ordo architect create --spec safe-checkout --title "Synchronous payment validation" \
  --impact "checkout API" \
  --component '{"name":"checkout","responsibility":"Validate payments","changes":["add PaymentValidator"]}' \
  --contract "POST /orders returns 422 for invalid payments" \
  --decision "Validate synchronously before persistence"
```

Approving a proposal happens in the pipeline (**Approve architecture**) or with `ordo architect approve <id>`.

### 9.4 Sessions

Lists agent runs: title ("<plan>: <step>"), status and, when present, provider and model. Clicking one opens the session file. The full event log sits next to it, in the `.jsonl` file.

### 9.5 Chat

The **Chat** tab (or *Ordo: Open Chat*) is a conversation with the agents you already have installed, inside the Ordo page.

**What the agent can do:** only **read and search** the project. It does not change files or run commands:

- Claude Code gets only its `Read`, `Grep` and `Glob` tools, and everything else is denied without asking;
- Codex works in its read-only sandbox.

When a change is needed, the agent shows it as a snippet or a diff. To apply it, use a plan step with its code review (chapters 7 and 8).

**How the page is laid out:**

- **on the left**, the list of chats, newest first, with **New chat**;
- **at the top**, the **Claude Code | Codex** buttons, to choose who answers. An agent that is not connected is greyed out;
- **in the middle**, the messages, with their time and, for Claude's replies, the tokens used;
- **at the bottom**, the message box. **Enter** sends, **Shift+Enter** adds a line. While the agent answers, the button becomes **Stop**;
- **Delete**, top right, deletes the chat after a confirmation in the page itself.

The chat fills the height of the window: messages scroll and the message box stays at the bottom, growing as you type. In a narrow window the chat list becomes a drop-down above the conversation. Answers show Markdown: code blocks, inline code, bold and lists.

**How continuity works.** Each agent continues **its own** conversation with its CLI's mechanisms (a Claude Code session, a Codex thread). When you keep talking to the same agent, Ordo sends only the new message.

**Switching agents.** You can switch agent at any message, but not while it is answering. If the new agent has not seen part of the conversation, the page says so before you send, for example: *"Codex has not seen 4 earlier messages: Ordo hands them over with your next message (~180 tokens)"*. With the next message Ordo hands it the transcript of those messages, once; after that it continues in its own thread. Failed or stopped replies are not handed over.

The new agent receives **what you said to each other**, not the files the other one read or its internal reasoning: if it needs them, it reads them again.

**Where chats go.** They are **personal**:

- they live in `~/.local/state/ordo/chats/` (or `$XDG_STATE_HOME/ordo/chats/`, or `$ORDO_STATE_DIR/chats/`), one folder per project;
- the files are readable only by you;
- they **never** go into `.ordo/` or Git, and they do not appear in the replay.

Each message uses **your** Claude or ChatGPT plan (or your API key), like a run.

**If the agent has "forgotten" the conversation**, for example because its CLI deleted old sessions, Ordo opens a new one and hands over the whole transcript. You do not need to do anything.

**Everyday example:**

1. Open **Chat**, choose **Claude Code** and ask *"Where are credit cards validated?"*. Claude searches the code and answers: *"In `validateCard`, `checkout.js:2`: it only checks for 16 digits."*
2. Ask *"Does a 15-digit American Express card pass?"*: Claude continues the same conversation.
3. You want a second opinion: click **Codex**. The page says Codex has not seen 4 messages (~180 tokens). Ask *"Does a Luhn check make sense there?"*: Codex receives the transcript and answers to the point.
4. Once you know what to do, write the requirement (9.1) and have an agent work through a plan, with its code review.

---

## 10. Team profile

### 10.1 What it is for

It decides, **for the whole team**, which catalog content agents use:

| Tab | Contents | Examples |
|---|---|---|
| **Agents** | Roles with specific instructions | `tdd-guide`, `code-reviewer`, `architect` |
| **Skills** | Knowledge to apply | `fastify-patterns`, `testing`, `security-review` |
| **Rules** | Coding rules | `common-security`, `typescript-testing` |
| **Workflows** | Procedures | `implement`, `review`, `plan` |

Each entry has a **mode**:

| Mode | For agents | For skills and rules |
|---|---|---|
| **Required** | The **only** allowed agent | Applied **always** |
| **Default** | Used when the session does not pick another | Applied **automatically** |
| **Recommended** | Suggested, selectable | Suggested |
| **Available** (`enabled`) | Selectable | Available on request |
| **Disabled** | Forbidden | Forbidden |

For **workflows**, everything not `Disabled` is available. The **`implement`** workflow must be enabled, or Run does not start.

Agent constraints: at most **one** `Default` and at most **one** `Required`. A `Required` agent is also the default one. While an agent is `Required` you cannot change the others: remove the `Required` first.

### 10.2 Creating the profile

Without a profile, the tab shows **No team profile yet** and two options:

- **Create with N suggestions** creates the profile **and** stages the suggestions that fit your project (10.4);
- **Create without suggestions**.

A new profile starts like this:

- every agent `Available`;
- `common-*` rules `Required`, the others `Recommended`;
- every workflow `Available`;
- no skills.

**Then set one agent to `Default`**: without it, Run stops.

### 10.3 Editing the profile (pending changes)

1. Choose the tab (Agents, Skills, Rules or Workflows). You can **filter** by name or description.
2. Change the mode from the drop-down next to the entry. Entries outside the profile show "Not in profile".
3. Every change is **not saved yet**: it appears in the **bar at the bottom** as "from → to", for example *"Skills · fastify-patterns: not in profile → Recommended"*.
4. **Save profile** writes `.ordo/profile.json`, applying the changes in the order shown. **Discard** drops them all.

Clicking an entry's **name** opens its content, as a Markdown preview beside the page.

**"Every session starts with"** shows what every session will receive: default (or required) agent, skills and rules applied automatically, number of available workflows.

### 10.4 Suggestions based on the project

Ordo reads the project's `package.json` and detects the technologies: Fastify, Express, React, Next.js, MongoDB, TypeScript, Node.js, JavaScript, Vitest, Jest, Playwright, Vite. Then it suggests:

- the **skills** that declare that technology, as **Recommended**;
- the **rules** in that technology's folder (for example `rules/fastify/`), as **Default**.

Each suggestion shows its **reason**, for example *"fastify-patterns — Fastify (package:fastify)"*.

- **Add as …** adds one suggestion to the pending changes; **Add all** adds them all.
- Nothing changes until you press **Save profile**.
- Entries the team already decided on are not suggested again, including those `Disabled` on purpose.
- Generic skills such as `testing` or `security-review` are not suggested: pick them by hand.

### 10.5 Entries changed in the catalog

If an entry's content in the catalog changes after the profile recorded it:

- the entry shows **"changed in catalog"**;
- **Needs review** appears at the top.

Read the new content (click the name), then **Accept catalog update** and **Save profile**. Until the profile is reviewed, **Run does not start**: no agent uses instructions the team has not seen.

### 10.6 Everyday example

The team decides that on this project every session must follow security practices. The tech lead:

1. sets `security-review` to **Required**;
2. saves;
3. opens a pull request with the new `.ordo/profile.json`.

After the merge, every Run by anyone on the team includes that skill.

---

## 11. AI connections and plan usage

### 11.1 Agent status

For **Claude Code** and **Codex**, a card with:

- the **status**:
  - **Connected**: installed and signed in;
  - **Not logged in**: installed but not signed in; Ordo says how to fix it (`claude` → `/login`, or `codex login`);
  - **Not found**: the CLI cannot be found;
- the **version** and **sign-in method**, for example "Signed in via claude.ai" or "Using your Anthropic API key from the system keychain";
- **Recheck** to check again.

Ordo checks sign-in with the CLIs' official commands (`claude auth status`, `codex login status`) and reads **only** status and method: never email, organization or tokens.

> Ground rule: **an agent that is not signed in cannot run anything.** Ordo has no login of its own and never silently switches from one method to another.

### 11.2 Executable path

**Set executable path** lets you give an **absolute** path when the CLI is not on VS Code's `PATH`; if you leave it empty, Ordo searches the `PATH`. The settings are `ordo.claudeCode.path` and `ordo.codex.path`. They apply to your machine only: a repository cannot change them.

### 11.3 API keys (optional)

- **Claude Code — "Use Anthropic API key":** the key goes into the **system keychain** (macOS Keychain, Windows Credential Manager, libsecret on Linux). Ordo passes it **only** to the `claude` process, and **only** when Claude Code is not already signed in. The cost goes to the key's owner. **Remove key** removes it.
- **Codex — "Log in with OpenAI API key":** Ordo hands the key **once** to the official `codex login --with-api-key` command. From then on **Codex** stores it, not Ordo. To remove it: `codex logout` in the terminal.

Ordo never calls model APIs on its own: the key only authenticates the agent's CLI.

### 11.4 Plan usage (5 hours and week)

For agents connected with a **subscription** (claude.ai or ChatGPT) you see two meters: the **5-hour window** and the **weekly** one. For each: percentage used and reset time. A meter turns **yellow** from 80% and **red** from 95%.

- **Codex:** **live** data, read from its `app-server`. It refreshes on opening, with Recheck and every 5 minutes.
- **Claude Code:** the **last value seen** during a run started from Ordo, for example "Last seen 2 h ago during a Claude Code run". Before the first run it shows "Shown after the next Claude Code run started from Ordo".
- **With an API key or cloud** (Bedrock, Vertex…) there are no windows: Ordo shows "Pay-as-you-go on your API key".

This data is **personal**: it lives in `~/.local/state/ordo/usage.json` (or `$XDG_STATE_HOME/ordo/usage.json`) on your machine, **never** in `.ordo/` or Git.

**Everyday example:** before a large refactoring you check the meters. Claude is at 13% of its 5 hours and 80% of its week (reset Saturday at 19:00). Codex is at 97% weekly. You do the refactoring with Claude and keep Codex for small steps.

---

## 12. Working as a team

### 12.1 The principle

**Everything that matters to the team lives in `.ordo/` and goes through Git**, with pull requests and reviews like code:

- specs, explorations, architectures, plans;
- the team profile;
- the audit log;
- the sessions.

**What is personal stays on your machine:** agent sign-ins and API keys, plan usage, the file snapshots for code review, **chats**.

### 12.2 Who does what

| Role | What they do in Ordo | Where |
|---|---|---|
| **Product manager / business owner** | Writes requirements; settles open questions; approves specs (**Mark ready**) | Requirements, Workflow |
| **Tech lead / architect** | Explores alternatives; proposes and approves the architecture; curates the team profile | Decisions (CLI), Workflow, Team profile |
| **Developer** | Creates plans; runs steps with Claude Code or Codex; reviews each step; brings code to pull requests | Plans, Workflow (Run, Review) |
| **Reviewer** | Reviews pull requests with the replay at hand: sees why each choice was made | Workflow → Replay |

### 12.3 The flow of a feature, end to end

1. **PM:** *New business requirement* → `draft` spec → commit on a branch → **pull request** "spec: refund an order". The team comments on the PR.
2. **PM:** after the merge, **Mark ready** → commit (changes the spec and its audit file).
3. **Tech lead:** if needed, `ordo brainstorm …` for alternatives, then `ordo architect create …` → pull request → **Approve architecture**.
4. **Developer:** *Create implementation plan* (or `ordo plan create` with several steps) → commit.
5. **Developer:** **Run** the first step → **code review** in the panel → *Approve* or *Request changes*. Repeat for each step.
6. **Developer:** commit the code **together with** the updated `.ordo/` files (plan, audit, sessions) → code pull request.
7. **Reviewer:** reviews the PR; to understand the reasons, opens the requirement's **replay**.

### 12.4 Practical Git rules

- **Commit `.ordo/` together with the code** that work produced: the history stays consistent.
- **The audit log has one file per artifact** (`.ordo/audit/spec/<id>.jsonl`, …): two people working on different requirements do not conflict. If you work on the **same** plan, coordinate. Ordo prevents two `running` steps in the same plan on the same checkout, but not across machines until you sync through Git.
- **Team profile changes go through pull requests:** they set the rules for everyone.
- **Sessions (`.ordo/sessions/`)** contain the full request sent to the agent (spec, context, instructions) and its response text. They feed the replay and the audit, and committing them is recommended. If your context contains information you do not want in Git, decide as a team **before** starting: for example, keep sensitive data out of `brain.md` and the context documents.
- **Code review with diffs happens on the machine where the agent ran** (8.4). Do it before pushing.
- **Everyone should use the same Ordo version:** the profile records a fingerprint of catalog content, and different catalog versions make "changed in catalog" appear.

### 12.5 Everyone uses their own agent

Each person signs in with **their own** Claude or ChatGPT account, or uses **their own** API key. Ordo does not share credentials and does not pay for anyone's usage. The replay shows which agent (and which version) worked on each step.

---

## 13. Typical days: everyday examples

### 13.1 Monday morning: a new feature arrives

The PM asks: "customers must be able to request a refund".

1. The PM, in VS Code: **New business requirement** → title "Refund an order", outcome, three acceptance criteria separated by `;`. The spec is `draft`.
2. She opens a PR with the spec; the developer comments "what about orders already shipped?" and she adds a criterion.
3. After the merge: **Workflow** → "Refund an order" row → **Mark ready**.
4. The tech lead creates the proposal with `ordo architect create …` and approves it from the pipeline.
5. The developer creates the plan with three steps.

By noon the pipeline shows "Refund an order" with spec ✓, architect ✓, plan ✓ and implement ready with **Run "model"**.

### 13.2 A quick fix

A small bug: the 422 response lacks the reason.

1. **New business requirement** with a single criterion → **Mark ready**, if you are the owner.
2. **Create implementation plan** with a single step and `pnpm test` as verification.
3. **Run** with Claude Code → review → **Approve** → commit.

In the pipeline: brainstorm "–" and architect "–" (skipped, fine for a fix), plan ✓, implement ✓.

### 13.3 The agent did more than asked

The review panel shows 5 files; one is `package.json`, with a new dependency nobody asked for.

1. Open the **Diff** of `package.json` to confirm.
2. Uncheck `package.json`, choose **Request changes** and write: *"Do not add dependencies: use the validation library we already have"*.
3. Press **Undo 1 file and submit review**.

The file is back as it was. The step is runnable again; on the next Run you can repeat the instruction in *Additional instruction*.

### 13.4 A step costs too much

The replay shows "42,000 tokens · most tokens" on the first step, and the Run estimate said ~94% of the request was profile instructions.

1. In **Team profile**, check which rules and skills are `Required` or `Default`: each one is sent to **every** session.
2. Move to `Recommended` those that are not always needed.
3. Split the step into smaller steps.

On the next Run the estimate drops, and you compare tokens in the replay.

### 13.5 A new teammate

1. They install Ordo, sign in to Claude Code (`claude` → `/login`) and open the project.
2. In **AI connections** they see Claude Code **Connected**.
3. In **Workflow** they immediately see what is in progress and what is waiting for a person.
4. With the **replay** of the main requirements they understand the decisions taken and why, without asking anyone.

The team profile, already in the repository, gives them the same rules as everyone else from their first Run.

### 13.6 "Why is this requirement stuck?"

In **Workflow**, the detail line tells you, for example:

- *"implement: 1/3 steps · Step "persist" is paused for human review"* → someone must do the **Review step**;
- *"architect: … Waiting for human approval"* → the tech lead must approve;
- *"The specification must be ready before agents can run"* → the PM must press **Mark ready**.

### 13.7 Understanding the code before writing a requirement

The PM asks whether "partial refunds are hard". Before answering:

1. **Chat** → **Claude Code**: *"How are refunds handled today? Which files would a partial refund touch?"*.
2. Claude lists the files and the delicate spots, with references to the code.
3. Switch to **Codex** for a second opinion: *"Do you see any risks that are missing?"*.

With the answers, write a precise requirement (9.1). The chat stays yours; what matters to the team goes into the spec.

### 13.8 A demo for customers or management

```sh
pnpm ordo:demo
```

Follow the 6 printed steps: Overview → Workflow → replay with ▶ → live review (undo the README) → Run (optional, uses your plan) → Team profile. At the end: `pnpm ordo:demo:clean`.

---

## 14. Current limitations

Ordo is in development (branch `develop/v2`). Today:

- **A step in `error`, or `blocked` in review, cannot be restarted from the interface.** The only way today is to skip it from the terminal: `ordo plan finish <plan> --step-id <step> --status skipped`. This treats it as done and unblocks the steps that depend on it. A way to rerun it is still to be built.
- **Run always uses the profile's `Default` agent** with the `Required` and `Default` skills and rules. Choosing agent and skills per session is the next step. If the profile has no `Default` agent, Run stops with "Choose an agent with --agent or set a project default".
- **The verify, review and record phases** do not exist as separate phases yet. Review happens during the work, after each step.
- **Explorations, architecture proposals and multi-step plans** are created from the terminal.
- **The chat is read-only.** The "Edit" mode, where the agent changes files and you then review them as in a Run, is the next step. A chat cannot be linked to a requirement yet.
- **Codex tokens** are not measured ("tokens not measured"). Claude's plan usage is the last value seen during a run, not live data.
- **The workflow cannot be designed yet.** The graphical designer is planned (ADR-0003).
- **Ordo is not on the Marketplace yet:** it is installed from a `.vsix`. It has not been tested in Cursor and Windsurf yet.

---

## 15. Troubleshooting

| Message or symptom | Cause | What to do |
|---|---|---|
| *Open a project folder to use Ordo.* | No folder open | *File → Open Folder* on the project |
| The agent shows **Not found** | The CLI is not on VS Code's `PATH` | AI connections → **Set executable path** with the absolute path (for example the output of `which claude`) |
| **Not logged in** | No sign-in | In the terminal: `claude`, then `/login`; or `codex login`. Then **Recheck** |
| *Spec must be ready before agent execution* | The spec is `draft` | **Mark ready**, after approval |
| *Initialize the shared project profile before running a plan step* | `.ordo/profile.json` is missing | Team profile → **Create …** |
| *Choose an agent with --agent or set a project default* | No `Default` agent | Team profile → Agents → one agent to **Default** → **Save profile** |
| *Project profile needs review: Changed … catalog entry …* | The catalog changed | Team profile → read the "changed in catalog" entries → **Accept catalog update** → **Save profile** |
| *The shared project profile must enable the implement workflow* | `implement` workflow disabled | Team profile → Workflows → `implement` ≠ Disabled |
| *No shared project context is available…* | Empty `brain.md` and no context documents | Write in `.ordo/brain.md`, or `ordo context add <file>` |
| *Plan step is blocked or not pending* | The step is not ready (dependencies, already done, in review) | Check the pipeline: a review may be needed |
| *Another plan step is already running* | Another step of the same plan is `running` | Wait for it to finish, or stop it |
| Review: *Edited after the agent finished, nothing was undone: …* | You edited that file by hand after the run | Keep the file, or restore it yourself and try again |
| Review: *No diff for this run…* | The run happened outside Git or before snapshots existed | Record the decision anyway; check the files by hand |
| Claude usage empty | No Claude run started from Ordo on this machine yet | It appears after the first Run with Claude |
| "Pay-as-you-go on your API key" | Signed in with an API key or cloud | Expected: there are no plan windows |
| The page does not refresh | Missed event | **Refresh** at the top right, or *Ordo: Refresh Shared Project Data* |

---

## 16. Reference: commands, settings, files, CLI

### 16.1 Extension commands (Command Palette)

| Command | What it does |
|---|---|
| Ordo: Open Ordo | Opens the Ordo page (Overview) |
| Ordo: Open Chat | Opens the chat |
| Ordo: Open Workflow and Replay | Opens the Workflow tab |
| Ordo: Open Team Profile | Opens the team profile |
| Ordo: Open AI Connections | Opens the connections |
| Ordo: Refresh Shared Project Data | Reloads everything |
| Ordo: Create Business Requirement | Guided new spec |
| Ordo: Create Implementation Plan | Guided new plan |
| Ordo: Initialize Shared Project Context | Creates `brain.md` and the context index |
| Ordo: Set Agent Executable Path | Path of Claude Code or Codex |
| Ordo: Recheck AI Connections | Checks installation and sign-in again |
| Ordo: Use an API Key for an Agent | API key for Claude Code, or Codex sign-in with a key |
| Ordo: Remove Claude Code API Key | Removes the key from the keychain |

### 16.2 Settings

| Setting | Default | Meaning |
|---|---|---|
| `ordo.closeSidebarOnOpen` | `true` | Closes the side bar when you open Ordo from its icon |
| `ordo.claudeCode.path` | empty | Absolute path of `claude`; empty = search the `PATH` |
| `ordo.codex.path` | empty | Absolute path of `codex`; empty = search the `PATH` |

The last two apply to your machine only: a repository cannot change them.

### 16.3 Files and folders

| Path | Contents | In Git? |
|---|---|---|
| `.ordo/specs/<id>.md` | Specifications | Yes |
| `.ordo/explore/<id>.json` | Explorations | Yes |
| `.ordo/architectures/<id>.json` | Architecture proposals | Yes |
| `.ordo/plans/<id>.json` | Plans and steps | Yes |
| `.ordo/profile.json` | Team profile | Yes (through pull requests) |
| `.ordo/brain.md` | Project memory | Yes |
| `.ordo/context/index.json` | Registered context documents | Yes |
| `.ordo/context/snapshots/` | Context snapshots sent to agents | Yes (recommended, for the audit) |
| `.ordo/audit/<kind>/<id>.jsonl` | Log of decisions and status changes | Yes |
| `.ordo/sessions/<uuid>.json` / `.jsonl` | Agent sessions and events | Yes (recommended; see 12.4) |
| `refs/ordo/snapshots/*` (in the local Git repository) | File snapshots for code review | No, they stay local |
| `~/.local/state/ordo/usage.json` | Plan usage | No: personal |
| `~/.local/state/ordo/chats/` | Chats with agents | No: personal |
| System keychain | Claude Code API key | No: personal |

### 16.4 The CLI in short

```sh
ordo status                                   # pipeline of every requirement
ordo status --spec <id>                       # decision path of one requirement
ordo spec create --title … --objective … --acceptance …
ordo spec status <id> --status ready          # approval (same effect as Mark ready)
ordo brainstorm create|add|select|crystallize …
ordo architect create|approve …
ordo plan create --title … --spec … --step '<json>' [--step '<json>' …]
ordo agent claude|codex --spec <id> --plan <id> [--step <id>] [--prompt "…"]
ordo plan changes <plan> --step-id <step> [--diff]
ordo plan review <plan> --step-id <step> --decision approved|changes-requested|blocked \
     [--note "…"] [--reject <file>]… [--reject-all]
ordo profile init|show|validate|set …
ordo context init|add|hide|show|remove|preview|snapshot …
```

Add `--json` for script-friendly output. `ordo <command> --help` shows every option.

---

## 17. Glossary

- **Agent / harness:** Claude Code or Codex, the program that changes the code.
- **Audit:** the append-only log of who did what and when (`.ordo/audit/`).
- **Catalog:** available agents, skills, rules and workflows (`content/`).
- **Chat:** a personal, read-only conversation with Claude Code or Codex, outside Git.
- **Code review:** a person's decision on an agent's work, file by file.
- **Context:** what the agent receives besides the spec: `brain.md` and the registered documents.
- **Crystallize:** turn an exploration's selected alternative into a spec.
- **File snapshot:** the state of the files before and after a run, for the diff.
- **Pipeline:** the requirements × phases table in the Workflow tab.
- **Team profile:** the team's choices over the catalog (`.ordo/profile.json`).
- **Replay:** a requirement's history, event by event.
- **Session:** one agent run, with all its events.
- **Spec:** the written requirement, with its acceptance criteria.
- **Step:** a small, verifiable unit of work in a plan.
