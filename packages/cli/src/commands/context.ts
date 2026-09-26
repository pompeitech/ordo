import {
  addContextEntry,
  type ContextPreviewReport,
  type ContextReport,
  type ContextSnapshotReport,
  findRepositoryRoot,
  initializeProjectContext,
  inspectProjectContext,
  previewProjectContext,
  removeContextEntry,
  setContextEntryVisibility,
  snapshotProjectContext
} from '@pompeitech/ordo-core'

export type ContextAction =
  | 'inspect'
  | 'init'
  | 'preview'
  | 'snapshot'
  | 'add'
  | 'hide'
  | 'show'
  | 'remove'

export interface ManageContextOptions {
  readonly directory: string
  readonly action: ContextAction
  readonly value?: string
}

export async function manageContext(
  options: ManageContextOptions
): Promise<ContextReport | ContextPreviewReport | ContextSnapshotReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)

  switch (options.action) {
    case 'init':
      return initializeProjectContext(repositoryRoot)
    case 'preview':
      return previewProjectContext(repositoryRoot)
    case 'snapshot':
      return snapshotProjectContext(repositoryRoot)
    case 'add':
      return addContextEntry(repositoryRoot, options.value ?? '')
    case 'hide':
      return setContextEntryVisibility(repositoryRoot, options.value ?? '', 'hidden')
    case 'show':
      return setContextEntryVisibility(repositoryRoot, options.value ?? '', 'visible')
    case 'remove':
      return removeContextEntry(repositoryRoot, options.value ?? '')
    default:
      return inspectProjectContext(repositoryRoot)
  }
}
