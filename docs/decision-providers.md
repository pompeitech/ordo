# Decision providers

Ordo's core exposes deterministic decision-provider contracts for future integrations. The 1.0 CLI does not call an external decision service and does not expose decision commands.

## JEV status

`@pompeitech/ordo-decision-jev` is currently a workspace placeholder reserved for a future JEV provider. Its source files are intentionally empty in 1.0; it is not bundled by `@pomepitech/ordo`, it is not published as part of the CLI artifact, and no runtime path imports it.

The architecture diagram shows the intended dependency direction only:

```text
optional provider package  ──depends on──>  @pompeitech/ordo-core
```

This direction keeps the core independent from a provider. A future implementation must live behind the existing provider contract, remain optional, document credentials and data handling, and add integration tests before it is described as supported.

## Current behavior

- Repository detection, catalog validation, installation planning, and safety decisions are deterministic and provider-free.
- The CLI supports `detect`, `doctor`, `init`, `install`, and catalog inspection only.
- `ordo run`, `ordo eval`, and JEV commands are not available in 1.0.
- Users do not need a JEV account, API key, model runtime, Docker, or network access to use the published CLI.
