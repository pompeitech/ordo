# Decision providers

Ordo's core exposes deterministic decision contracts. AI-assisted decision support is part of Ordo's project workflow, not a separate inference provider: when analysis or alternatives need an agent, Ordo delegates the work to the user's selected Claude Code or Codex harness. Ordo remains responsible for the shared business context, evidence, approval gates, and recording the human decision.

## Current behavior

- Repository detection, catalog validation, installation planning, and safety decisions are deterministic and provider-free.
- Repository detection, catalog validation, installation planning, and safety decisions are deterministic and provider-free.
- The CLI also contains local context, profile, spec, explore, architecture, plan, and session commands; direct-provider `session run` is transitional and not the target AI execution path.
- AI-assisted decision workflows require a configured Claude Code or Codex harness and use that harness's local authentication; Ordo does not ask for a separate inference-service account or API key.
