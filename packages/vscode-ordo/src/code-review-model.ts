import type { FileChange } from '@pompeitech/ordo-core'

export function describeFileChange(file: FileChange): string {
  const counts =
    file.additions === undefined ? 'binary' : `+${file.additions} −${file.deletions ?? 0}`
  return `${file.change} · ${counts}`
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
