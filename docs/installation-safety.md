# Installation safety

Ordo treats installation as an ownership-aware transaction. Matching a destination path does not prove ownership; only `.ordo/state.json` does.

## Planning inputs

One installation plan is derived from:

1. the resolved repository root;
2. validated configuration;
3. the validated and filtered canonical catalog;
4. adapter-generated destination files;
5. the previous installation state;
6. current filesystem checksums;
7. conflict and pruning policy.

The planner sorts destination paths and state records. Given the same inputs and filesystem state, it produces the same actions and conflicts.

## Ownership state

`.ordo/state.json` has schema version `1`. Each record contains:

| Field | Meaning |
| --- | --- |
| `adapter` | `claude` or `codex` |
| `targetRoot` | Adapter root relative to the repository |
| `path` | Installed file path relative to the target root |
| `sourceId` | Canonical entry or generated source identifier |
| `kind` | `agents`, `rules`, `skills`, or `workflows` |
| `checksum` | SHA-256 of the content Ordo installed |

State paths are normalized and must remain inside the repository. Duplicate state records, unknown adapters or kinds, invalid checksums, and unsupported state versions are rejected.

## Action model

| Action | Typical reason | Effect |
| --- | --- | --- |
| `create` | Destination is missing | Write a new managed file |
| `update` | Canonical source changed | Replace an owned, unmodified file |
| `update` | Overwrite is enabled | Replace an unmanaged or modified destination |
| `skip` | Installed content is unchanged | Preserve the existing file |
| `skip` | Existing identical file is adopted | Add matching content to ownership state |
| `skip` | Skip strategy protects a conflict | Preserve the existing destination |
| `remove` | Owned content is stale and pruning is enabled | Delete an unmodified managed file |

## Conflict model

Blocking conflict codes include:

| Code | Condition |
| --- | --- |
| `duplicate-destination` | Multiple mapped entries target the same path |
| `unmanaged-file` | A destination exists without an ownership record |
| `modified-owned-file` | A managed destination no longer matches its recorded checksum |
| `modified-stale-file` | A stale managed file was changed before pruning |
| `invalid-destination` | A destination cannot be safely inspected as a file |

With strategy `error`, any conflict blocks the complete plan. Ordo does not apply the safe subset around a conflict.

With strategy `skip`, conflicting destinations are preserved while independent safe actions may continue. Skipped modified files retain their previous ownership record.

With strategy `overwrite`, conflicting destinations may be replaced and the new checksum becomes owned state. Use this only when replacing local content is intentional.

## Pruning

Pruning is disabled by default. When enabled, Ordo considers records that no longer have installation candidates.

- A missing stale file is removed from state without a filesystem action.
- An unchanged stale file receives a `remove` action.
- A modified stale file is preserved and reported as a conflict.

Pruning never searches directories for “Ordo-looking” files. It acts only on explicit ownership records.

## Path and symlink defenses

Target paths, output directories, generated relative paths, and state paths must remain inside the repository. Ordo rejects absolute target output paths, traversal segments, and resolved paths outside the repository.

Before writing or removing, Ordo checks existing path components for symbolic-link traversal. Canonical catalogs also reject symlinks while loading Markdown.

## Atomic writes and rollback

Installation snapshots affected paths before mutation. Writes use temporary files followed by renames. If an action fails, Ordo restores prior content or removes files created by the failed transaction, then reports `INSTALLATION_FAILED`.

Installation state is saved only after the plan succeeds. The state file itself is written with mode `0600` through a temporary file and rename.

## Dry runs

```bash
ordo install --dry-run
```

A dry run performs catalog validation, adapter validation, ownership loading, filesystem inspection, checksum comparison, conflict handling, and complete planning. It writes no destination and no state.

Use a dry run before enabling `overwrite`, enabling `prune`, changing adapters, changing output directories, or applying a new shared catalog.

## Recovery guidance

- If a plan reports `unmanaged-file`, inspect the destination before changing policy.
- If it reports `modified-owned-file`, preserve or commit the local change before deciding whether to overwrite.
- If state is corrupt, do not delete it reflexively; it is the evidence Ordo uses to distinguish managed files.
- If an installation fails, run `ordo doctor`, inspect the reported cause, and run a new dry run after correction.
