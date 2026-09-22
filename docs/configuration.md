# Configuration reference

Ordo recognizes `ordo.config.json` and `.ordorc.json`. Starting from the requested directory, it searches upward until it finds one of these files or reaches the repository boundary.

Unknown properties are rejected. This is intentional: a misspelled safety option must fail visibly instead of being ignored.

## Complete example

```json
{
  "schemaVersion": 1,
  "targets": [
    { "adapter": "claude" },
    { "adapter": "codex" },
  ],
  "contentRoot": "/opt/ordo/content",
  "content": {
    "agents": {
      "include": ["planner", "tdd-guide", "code-reviewer"]
    },
    "rules": {
      "exclude": ["mongodb-indexes"]
    },
    "skills": {
      "include": ["testing", "security-review", "verification-loop"]
    },
    "workflows": {
      "include": ["implement", "review"]
    }
  },
  "installation": {
    "conflictStrategy": "error",
    "prune": false
  }
}
```

## Top-level properties

| Property | Required | Meaning |
| --- | --- | --- |
| `schemaVersion` | Yes | Must be the integer `1` |
| `targets` | Yes | One or both supported harness targets |
| `contentRoot` | No | Absolute path or path relative to the repository root |
| `content` | No | Per-category include or exclude filters |
| `installation` | No | Conflict and stale-file policy |

## Targets

Each target accepts:

```json
{
  "adapter": "codex",
  "outputDirectory": "tools/ai"
}
```

`adapter` must be `claude` or `codex`. Each adapter may appear at most once.

`outputDirectory` is optional. It must be relative, non-empty, and remain inside the repository. Absolute paths and `..` traversal are rejected. When omitted, the adapter uses its native repository layout.

An installation requires at least one target. The parser accepts an empty array so configuration diagnostics can report it, but `ordo install` rejects it.

## Content root

Resolution uses this precedence:

1. command-level `--content-root` override;
2. configured `contentRoot`;
3. the `content` directory under the repository root.

`ordo init` stores paths inside the target repository relatively and external paths absolutely. The standalone package normally records its bundled catalog as an absolute path.

## Content filters

Supported category keys are `agents`, `rules`, `skills`, and `workflows`. Each category accepts `include` and `exclude` arrays:

```json
{
  "content": {
    "skills": {
      "include": ["testing", "verification-loop"],
      "exclude": []
    }
  }
}
```

Rules:

- IDs must be non-empty strings.
- Arrays must not contain duplicates.
- The same ID cannot appear in both `include` and `exclude` for one category.
- Every referenced ID must exist in the loaded catalog.
- `include` limits the category to listed IDs.
- `exclude` removes listed IDs from the otherwise selected category.
- Omitting a category selects all entries in that category.
- Omitting `content` selects the entire catalog.

## Installation policy

Defaults are equivalent to:

```json
{
  "installation": {
    "conflictStrategy": "error",
    "prune": false
  }
}
```

| Strategy | Unmanaged or modified destination |
| --- | --- |
| `error` | Record a conflict and block the complete plan |
| `skip` | Preserve the destination and continue safe actions |
| `overwrite` | Replace the destination and track the installed result |

`prune: true` allows Ordo to remove stale files only when they remain identical to the checksums in `.ordo/state.json`. Modified stale files are conflicts and are preserved.

Read [installation safety](installation-safety.md) before changing either default.

## Validated examples

Machine-readable examples live under [`examples/configs/`](../examples/README.md). The test suite parses every JSON example with the production configuration parser.
