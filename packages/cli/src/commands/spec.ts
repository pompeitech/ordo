import {
  type CreateSpecOptions,
  createSpec,
  findRepositoryRoot,
  listSpecs,
  previewSpecCreation,
  readSpec,
  type SpecRecord,
  type SpecStatus,
  type SpecValidationReport,
  updateSpecStatus,
  validateSpec
} from '@pompeitech/ordo-core'

export type SpecAction = 'create' | 'list' | 'show' | 'validate' | 'status'

export interface ManageSpecOptions {
  readonly directory: string
  readonly action: SpecAction
  readonly id?: string
  readonly title?: string
  readonly objective?: string
  readonly acceptanceCriteria?: string
  readonly status?: SpecStatus
  readonly dryRun?: boolean
}

export type SpecCommandReport =
  | { readonly kind: 'spec'; readonly action: 'list'; readonly specs: readonly SpecRecord[] }
  | {
      readonly kind: 'spec'
      readonly action: 'create' | 'show' | 'status'
      readonly dryRun: boolean
      readonly spec: SpecRecord
      readonly content?: string
    }
  | {
      readonly kind: 'spec'
      readonly action: 'validate'
      readonly validation: SpecValidationReport
    }

export async function manageSpec(options: ManageSpecOptions): Promise<SpecCommandReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.action === 'list') {
    return { kind: 'spec', action: 'list', specs: await listSpecs(repositoryRoot) }
  }
  if (options.action === 'show') {
    return {
      kind: 'spec',
      action: 'show',
      dryRun: false,
      spec: await readSpec(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'validate') {
    return {
      kind: 'spec',
      action: 'validate',
      validation: await validateSpec(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'status') {
    if (options.dryRun) {
      const current = await readSpec(repositoryRoot, options.id ?? '')
      return {
        kind: 'spec',
        action: 'status',
        dryRun: true,
        spec: Object.freeze({ ...current, status: options.status as SpecStatus })
      }
    }
    return {
      kind: 'spec',
      action: 'status',
      dryRun: false,
      spec: await updateSpecStatus(repositoryRoot, options.id ?? '', options.status as SpecStatus)
    }
  }
  const createOptions: CreateSpecOptions = {
    id: options.id,
    title: options.title ?? '',
    objective: options.objective ?? '',
    acceptanceCriteria: options.acceptanceCriteria ?? ''
  }
  if (options.dryRun) {
    const preview = previewSpecCreation(repositoryRoot, createOptions)
    return {
      kind: 'spec',
      action: 'create',
      dryRun: true,
      spec: preview.spec,
      content: preview.content
    }
  }
  return {
    kind: 'spec',
    action: 'create',
    dryRun: false,
    spec: await createSpec(repositoryRoot, createOptions)
  }
}
