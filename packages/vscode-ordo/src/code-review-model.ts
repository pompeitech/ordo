import type { FileChange } from '@pompeitech/ordo-core'

export interface ReviewFileItem {
  readonly path: string
  readonly change: FileChange['change']
  /** Codicon-prefixed label for the quick pick. */
  readonly label: string
  readonly description: string
}

const ICONS: Readonly<Record<FileChange['change'], string>> = {
  added: '$(diff-added)',
  modified: '$(diff-modified)',
  deleted: '$(diff-removed)'
}

export function describeFileChange(file: FileChange): string {
  const counts =
    file.additions === undefined ? 'binary' : `+${file.additions} −${file.deletions ?? 0}`
  return `${file.change} · ${counts}`
}

/** One entry per changed file; every file starts as kept. */
export function reviewFileItems(files: readonly FileChange[]): readonly ReviewFileItem[] {
  return files.map(file => ({
    path: file.path,
    change: file.change,
    label: `${ICONS[file.change]} ${file.path}`,
    description: describeFileChange(file)
  }))
}

/** Files the reviewer unchecked, in the order the agent's changes were listed. */
export function rejectedFiles(
  files: readonly FileChange[],
  kept: readonly string[]
): readonly string[] {
  const keep = new Set(kept)
  return files.map(file => file.path).filter(file => !keep.has(file))
}

export const SNAPSHOT_SCHEME = 'ordo-snapshot'

/** `ordo-snapshot:/<path>?tree=<sha>` identifies a file inside a workspace snapshot. */
export function parseSnapshotLocation(
  uriPath: string,
  query: string
): { readonly tree: string; readonly file: string } | undefined {
  const tree = new URLSearchParams(query).get('tree') ?? ''
  const file = uriPath.replace(/^\/+/, '')
  if (!/^[0-9a-f]{40,64}$/.test(tree) || !file || file.split('/').includes('..')) {
    return undefined
  }
  return { tree, file }
}
