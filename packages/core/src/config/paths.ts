import path from 'node:path'

export function resolveContentRoot(
  repositoryRoot: string,
  configuredContentRoot?: string,
  overrideContentRoot?: string
): string {
  return path.resolve(repositoryRoot, overrideContentRoot ?? configuredContentRoot ?? 'content')
}
