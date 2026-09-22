# Ordo fixtures

Fixtures are stable, hand-authored inputs used to verify Ordo's deterministic behavior. They are test data rather than user-facing templates; see [`examples/`](../examples/README.md) for copyable configurations and catalogs.

## Inventory

```text
fixtures/
├── catalogs/
│   ├── invalid-missing-defense/
│   └── valid/
├── decisions/
│   └── safety-gate.jsonl
└── repositories/
    ├── ambiguous-lockfiles/
    ├── fastify-typescript/
    └── react-mongodb/
```

## Repository fixtures

Each directory below `repositories/` is a minimal standalone repository. Its `expected.json` records the package-manager and technology IDs that the core must report.

| Fixture | Expected behavior |
| --- | --- |
| `fastify-typescript` | Select pnpm from matching manifest and lockfile evidence; detect Node.js, TypeScript, Fastify, MongoDB, and Vitest |
| `react-mongodb` | Select npm from `package-lock.json`; infer JavaScript and detect React, MongoDB through Mongoose, Jest, and Vite |
| `ambiguous-lockfiles` | Report package-manager status `ambiguous`, select no manager, and preserve pnpm and Yarn as conflicts |

Fixture manifests use illustrative dependency versions. Tests never install those dependencies or access the network.

## Catalog fixtures

`catalogs/valid` contains one fully valid skill. `catalogs/invalid-missing-defense` intentionally violates one invariant: its skill omits `## Prompt Defense Baseline`. The invalid file must remain invalid because the test asserts the exact `missing-prompt-defense` diagnostic.

## Decision eval fixture

[`decisions/safety-gate.jsonl`](decisions/safety-gate.jsonl) is the initial labeled dataset for a future decision-provider evaluation command. Each non-empty line is independent JSON with this shape:

```json
{
  "id": "unique-case-id",
  "input": {
    "tool": "tool-name",
    "arguments": {}
  },
  "expected": {
    "allow": true,
    "severity": "low"
  },
  "tags": ["read-only"]
}
```

Allowed severity labels are `low`, `medium`, `high`, and `critical`. The current core does not consume this dataset at runtime. Tests enforce its structural integrity now so a later `ordo eval` implementation starts from version-controlled, reviewable cases.

The expected labels express policy:

- read-only repository inspection is allowed;
- bounded writes inside a workspace may be allowed;
- recursive deletion, credential transmission, force pushes, and destructive database operations are denied;
- ambiguous commands should escalate conservatively in a future provider rather than invent certainty.

## Fixture rules

When adding or changing a fixture:

1. Keep it minimal; include only evidence needed for the behavior under test.
2. Store expected outcomes beside the input instead of embedding path-specific assertions in tests.
3. Use relative, platform-neutral data and never include real credentials or personal paths.
4. Add a regression assertion before relying on a new fixture.
5. Do not make fixture tests depend on package installation, network access, wall-clock time, or test order.

Run all fixture checks with:

```bash
pnpm --filter @pompeitech/ordo-core test
```
