import {
  type ArchitectureComponent,
  type ArchitectureProposal,
  approveArchitectureProposal,
  type CreateArchitectureOptions,
  createArchitectureProposal,
  findRepositoryRoot,
  listArchitectureProposals,
  previewArchitectureApproval,
  previewArchitectureProposal,
  readArchitectureProposal
} from '@pompeitech/ordo-core'

export type ArchitectAction = 'create' | 'list' | 'show' | 'approve'

export interface ManageArchitectOptions {
  readonly directory: string
  readonly action: ArchitectAction
  readonly id?: string
  readonly title?: string
  readonly specId?: string
  readonly impact?: readonly string[]
  readonly components?: readonly ArchitectureComponent[]
  readonly contracts?: readonly string[]
  readonly decisions?: readonly string[]
  readonly risks?: readonly string[]
  readonly dryRun?: boolean
}

export type ArchitectReport =
  | {
      readonly kind: 'architect'
      readonly action: 'list'
      readonly proposals: readonly ArchitectureProposal[]
    }
  | {
      readonly kind: 'architect'
      readonly action: Exclude<ArchitectAction, 'list'>
      readonly dryRun: boolean
      readonly proposal: ArchitectureProposal
    }

export async function manageArchitect(options: ManageArchitectOptions): Promise<ArchitectReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.action === 'list') {
    return {
      kind: 'architect',
      action: 'list',
      proposals: await listArchitectureProposals(repositoryRoot)
    }
  }
  if (options.action === 'show') {
    return {
      kind: 'architect',
      action: 'show',
      dryRun: false,
      proposal: await readArchitectureProposal(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'approve') {
    return {
      kind: 'architect',
      action: 'approve',
      dryRun: options.dryRun ?? false,
      proposal: options.dryRun
        ? await previewArchitectureApproval(repositoryRoot, options.id ?? '')
        : await approveArchitectureProposal(repositoryRoot, options.id ?? '')
    }
  }
  const input: CreateArchitectureOptions = {
    id: options.id,
    title: options.title ?? '',
    specId: options.specId ?? '',
    impact: options.impact ?? [],
    components: options.components ?? [],
    contracts: options.contracts ?? [],
    decisions: options.decisions ?? [],
    risks: options.risks
  }
  return {
    kind: 'architect',
    action: 'create',
    dryRun: options.dryRun ?? false,
    proposal: options.dryRun
      ? await previewArchitectureProposal(repositoryRoot, input)
      : await createArchitectureProposal(repositoryRoot, input)
  }
}
