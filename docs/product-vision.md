# Ordo product vision

Ordo is evolving from a deterministic catalog installer into a governed AI engineering workspace for teams. The existing catalog, adapter, ownership, and safety layers remain the foundation; project memory, context assembly, sessions, planning, execution, and operational visibility become first-class capabilities.

The product direction is inspired by the operating model of tools such as Knotic, but Ordo keeps its own terminology, architecture, implementation, and visual identity.

## Product promise

Before an AI model acts on a repository, a team should be able to answer:

1. What durable project knowledge is available?
2. What exact context will be sent for this request?
3. Which execution harness (Claude Code or Codex), tools, and approvals will be used?
4. What plan is being executed and what is the state of every step?
5. What changed, why did it change, and how much did the run cost?

For team use, the project repository is the shared source of truth for business requirements, domain rules, decisions, specifications, and traceability. Ordo makes these artifacts discoverable and reviewable beside the code. Teams can review updates through their existing Git workflow; a hosted Ordo account is not required for the local collaboration model.

## Product surfaces

| Ordo surface | Responsibility | Repository artifacts |
| --- | --- | --- |
| Sessions | Daily conversation, attachments, tool activity, diffs, and resumable work | `.ordo/sessions/` |
| Context | Durable memory, tracked knowledge, visibility controls, payload preview, and token budget | `.ordo/brain.md`, `.ordo/context/` |
| Explore | Read-only divergence, comparison, convergence, and spec approval | `.ordo/specs/` |
| Architect | Reviewable plans, phased execution, per-step sessions, status, and diffs | `.ordo/plans/`, `.ordo/runs/` |
| Control Center | Team skills, Claude Code/Codex availability, MCP servers, policies, usage, and audit events | `.ordo/settings.json`, `.ordo/audit/` |
| Team Workspace | Shared business requirements, specifications, decisions, and links between them | `.ordo/specs/`, `.ordo/explore/`, `.ordo/architectures/` |
| Team Profile | Shared allowed/default agents, skills, and applicable rules, with per-session choices constrained by policy | `.ordo/profile.json` |
| Issue Tracker | Optional Jira issue links/import and approved status/link updates; Ordo remains authoritative for its context, specs, plans, sessions, and audit | `.ordo/specs/`, `.ordo/plans/`, `.ordo/sessions/` |

The CLI is the automation and recovery interface for every surface. A desktop workspace or VS Code-compatible extension will provide the primary interactive experience after the runtime contracts stabilize.

## Repository model

```text
.ordo/
├── brain.md
├── context/
│   ├── index.json
│   └── snapshots/
├── sessions/
│   ├── <session-id>.json
│   └── <session-id>.jsonl
├── specs/
│   └── <slug>.md
├── explore/
│   └── <slug>.json
├── architectures/
│   └── <slug>.json
├── plans/
│   └── <plan-id>.json
├── profile.json              # shared agent/skill/rule IDs, defaults, required items, and policy references
├── integrations/
│   └── issues.json           # optional external issue references and sync metadata; no credentials
├── runs/
│   └── <run-id>/
├── audit/
│   └── <date>.jsonl
├── settings.json
└── state.json
```

Large or sensitive runtime artifacts should be referenced by checksum rather than committed automatically. Teams explicitly choose which `.ordo/` artifacts belong in version control.

Business rules, acceptance criteria, assumptions, and open questions are written into reviewable requirement specifications. A specification becomes the stable handoff contract: implementation work can refer to its identifier, and the team can inspect its status and history before approving downstream plans.

The repository's Ordo profile defines the agent, skill, and rule catalog entries the team allows, recommends, defaults, or requires. A contributor can choose among permitted agents, activate permitted skills and rules per session, while Ordo records the effective choices and prevents personal preferences from weakening shared policy. Common rules are required by default and other rules are recommended. The first project setup creates or imports that reviewed profile instead of asking each team member to configure a different private set.

Ordo is the shared place where the team records product purpose, business vocabulary, rules, decisions, functionality, specifications, and acceptance criteria. An optional Jira integration can import issue details with provenance and connect an issue to the Ordo specification and execution trail. Jira remains the issue tracker; Ordo remains authoritative for the exact context supplied to agents, Ordo artifacts, execution policy, and audit. Initial synchronization is explicit and previewable; conflicts are resolved by a person.

## Architecture

```text
@pompeitech/ordo-core
  deterministic schemas, context assembly, state machines, policies, audit events

@pompeitech/ordo-runtime
  sessions, harness orchestration, tool/policy mapping, approvals, streaming, compaction

@pompeitech/ordo-agent-claude / @pompeitech/ordo-agent-codex
  supported execution adapters; delegate inference and coding tools to native harnesses

@pompeitech/ordo-tools
  repository tools and MCP bridge behind a uniform permission contract

@pompeitech/ordo
  CLI automation, diagnostics, JSON output, and headless operation

Ordo Desktop / VS Code extension
  Sessions, Context, Explore, Architect, Team Profile, Issue Tracker, and Control Center user interfaces
```

Ordo supports exactly two AI execution harnesses: Claude Code and Codex. Ordo owns workflow, shared context, policy, approvals, and audit; each harness owns model inference, credentials, and native coding-agent loop. Ordo does not call model APIs directly, offer arbitrary provider/local-model routing, or require an Artiforge account or license. Credentials remain in the harness's supported secure configuration and never belong in repository files. Each run receives a frozen Ordo context/step manifest and records the capabilities and usage the harness exposes. Every mutating operation is bounded by Ordo policy and harness permissions.

## Programmer-configurable settings

The desktop UI should expose practical controls inspired by the Knotic Settings/HQ/Context Lens screenshots supplied on 2026-09-25, while adapting them to Ordo's two-harness boundary. Treat these as product requirements, not a commitment to copy Knotic's layout or branding. Separate per-user machine preferences from Git-shared project policy; secrets and login tokens stay in Claude Code/Codex or the OS credential store.

- **AI connections:** detect installed Claude Code and Codex executables, show availability/version/authentication state, allow an optional executable path override, and provide a recheck action. Explain that credentials belong to the official harness and are not copied into Ordo.
- **Run controls:** configure safe maximum agent/tool turns; optional auto-continue when the harness reaches the limit and a maximum continuation count; bounded concurrency for independent Architect planning, ready plan steps, and background runs; connection/startup, first-event, and overall timeouts. Show actual effective values and capability limits per harness; do not expose generic provider-request settings.
- **Context and learning:** enable/disable proposing reusable project knowledge from completed work, choose when to offer the proposal (session end or background processing), and always show a reviewable diff before changing shared `.ordo/brain.md` or profile artifacts. No silent auto-promotion to team truth.
- **Context Lens:** configure total input budget and reserved output budget using the chosen harness/model limits when available; inspect categorized knowledge sources and indexed repository/wiki sources; search, add/remove, hide/show, and distinguish auto-discovered sources from manually selected files. Configure eligible-source policy (all approved sources, auto-discovered only, manual files only, or index/metadata only). Show counts, provenance, token estimate, included/excluded reasons, and the exact Ordo snapshot before run.
- **Skills and agents:** browse/create/refresh repository skills, select a permitted agent and skill set per session, and display team-required/default/recommended status and content hashes. The project profile remains the shared authority.
- **Monitoring:** show runs/sessions, harness/model where exposed, tool activity, token usage, latency and cost only when Claude Code/Codex supplies reliable values; missing fields remain unknown. Keep audit local by default and make export explicit.
- **MCP servers:** inspect configured servers and connection/tool status; offer a reviewed path to edit project MCP configuration and refresh status. Any configuration write is previewed, scoped and auditable.
- **Harness model choice:** offer only the model choices Claude Code or Codex report/support. Do not configure unrelated provider endpoints or maintain a separate provider catalog.

Explicitly outside Ordo settings: OpenAI/Anthropic/OpenRouter/GitHub/Google/Regolo API keys and endpoints; arbitrary OpenAI-compatible provider URLs; local inference endpoint/API key/main/system model; Artiforge license key, inference endpoint, credit balance and remote-session service settings; and AI autocomplete backed by a third inference provider. Native editor/language-server completions are a separate IDE capability, not a reason to add a model provider.

## Context contract

Context is assembled from independently visible blocks:

- durable project memory;
- tracked domain and architecture documents;
- applicable rules and skills;
- current session state and recent messages;
- explicit attachments;
- task- or plan-step-specific evidence.
- the approved business context and the exact feature/specification being implemented;
- Jira issue data when explicitly linked and imported, with source and sync timestamp.

The preview must be deterministic for a given snapshot, show source attribution, expose an estimated token count, and exclude hidden blocks. Ordo passes that exact snapshot to Claude Code or Codex and records its hash. Because a harness may add its own system instructions or runtime context, Ordo must distinguish its inspectable payload from any final provider-side prompt it cannot observe; it must never claim to display hidden harness context.

The first implemented vertical slice is available through:

```bash
ordo context init
ordo context add docs/domain/business-rules.md
ordo context
ordo context preview
ordo context hide docs/domain/business-rules.md
ordo context show docs/domain/business-rules.md
ordo context remove docs/domain/business-rules.md
```

Use `--json` for automation. Token estimates are approximate; Ordo may use harness-reported usage when available but does not implement provider-specific model APIs/tokenizers.

## Execution and safety invariants

- Analysis is read-only until an execution step starts.
- Plans are reviewable before their first mutating step.
- Each step has its own linked session and diff.
- State transitions are explicit and persisted.
- Tool permissions are deny-by-default for writes and shell execution.
- “Approve for session” is scoped to the current session and policy class.
- Secrets are loaded from the OS or secure credential storage, never `.ordo/settings.json`.
- Claude Code and Codex use the same Ordo session, context, tool-policy, and audit contracts, with declared harness capability differences.
- Telemetry is local by default and export is opt-in.
- A model cannot silently expand its own tool permissions or context visibility.

## Delivery sequence

1. Context foundation: project memory, tracked sources, visibility, preview, budgets, snapshots.
2. Session runtime: event log, Claude Code/Codex adapters, streaming, permissions, diffs, resume.
3. Explore and specs: structured decision workflow and approved handoff artifact.
4. Architect: persistent plans, phase and step state, linked sessions, reruns, review gates.
5. Control Center: shared agent/skill profile, harness availability/configuration, MCP, usage, audit, and policy management.
6. Optional Jira tracker connector: attributed issue import, links to Ordo specs/runs, and explicit conflict-aware updates.
7. Desktop workspace: integrated UI over the stable headless APIs, including team profile and business feature context.

This ordering avoids building an attractive chat shell on top of an undefined context and execution model.

## Current 2.0 development status

- Context index, visibility controls, payload preview, token estimate, and immutable snapshots are implemented.
- Persistent session metadata and append-only typed event logs are implemented.
- An initial direct-provider streaming runner and tool loop exist as transitional infrastructure; they are not the target execution path and must not be expanded into additional provider integrations.
- The first VS Code team workspace reads shared `.ordo/` specifications, explorations, architecture proposals, plans, sessions, and context, and can create a reviewable business requirement specification.
- A first CLI-managed `.ordo/profile.json` can share catalog agent/skill/rule/workflow selections; new sessions validate the catalog and record the effective selections by content hash. The current generic session runner injects those selections into a direct-provider prompt, but this must be migrated to Claude Code/Codex adapter inputs.
- Real Claude Code and Codex execution adapters, workflow/UI integration, policy parity, audit normalization, Control Center, and the broader desktop workspace remain in progress.
