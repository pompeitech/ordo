import {
  type AddExploreAlternativeOptions,
  addExploreAlternative,
  createExplore,
  createSpec,
  type ExploreRecord,
  findRepositoryRoot,
  linkExploreSpec,
  listExplores,
  previewExploreCreation,
  previewSpecCreation,
  readExplore,
  type SpecRecord,
  selectExploreAlternative
} from '@pompeitech/ordo-core'

export type BrainstormAction = 'create' | 'list' | 'show' | 'add' | 'select' | 'crystallize'

export interface ManageBrainstormOptions {
  readonly directory: string
  readonly action: BrainstormAction
  readonly id?: string
  readonly title?: string
  readonly problem?: string
  readonly assumptions?: readonly string[]
  readonly openQuestions?: readonly string[]
  readonly alternative?: AddExploreAlternativeOptions
  readonly alternativeId?: string
  readonly specId?: string
  readonly acceptanceCriteria?: string
  readonly dryRun?: boolean
}

export type BrainstormReport =
  | {
      readonly kind: 'brainstorm'
      readonly action: 'list'
      readonly explorations: readonly ExploreRecord[]
    }
  | {
      readonly kind: 'brainstorm'
      readonly action: Exclude<BrainstormAction, 'list'>
      readonly dryRun: boolean
      readonly exploration: ExploreRecord
      readonly spec?: SpecRecord
      readonly specContent?: string
    }

export async function manageBrainstorm(
  options: ManageBrainstormOptions
): Promise<BrainstormReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.action === 'list') {
    return { kind: 'brainstorm', action: 'list', explorations: await listExplores(repositoryRoot) }
  }
  if (options.action === 'show') {
    return {
      kind: 'brainstorm',
      action: 'show',
      dryRun: false,
      exploration: await readExplore(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'create') {
    const input = {
      id: options.id,
      title: options.title ?? '',
      problem: options.problem ?? '',
      assumptions: options.assumptions,
      openQuestions: options.openQuestions
    }
    return {
      kind: 'brainstorm',
      action: 'create',
      dryRun: options.dryRun ?? false,
      exploration: options.dryRun
        ? previewExploreCreation(input)
        : await createExplore(repositoryRoot, input)
    }
  }
  if (options.action === 'add') {
    const current = await readExplore(repositoryRoot, options.id ?? '')
    if (options.dryRun) {
      const now = new Date().toISOString()
      const alternative = options.alternative as AddExploreAlternativeOptions
      const alternativeId =
        alternative.id ??
        alternative.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      return {
        kind: 'brainstorm',
        action: 'add',
        dryRun: true,
        exploration: Object.freeze({
          ...current,
          status: 'diverging',
          updatedAt: now,
          alternatives: Object.freeze([
            ...current.alternatives,
            Object.freeze({
              id: alternativeId,
              title: alternative.title,
              summary: alternative.summary,
              benefits: Object.freeze([...(alternative.benefits ?? [])]),
              tradeoffs: Object.freeze([...alternative.tradeoffs]),
              risks: Object.freeze([...(alternative.risks ?? [])]),
              createdAt: now
            })
          ])
        })
      }
    }
    return {
      kind: 'brainstorm',
      action: 'add',
      dryRun: false,
      exploration: await addExploreAlternative(
        repositoryRoot,
        options.id ?? '',
        options.alternative as AddExploreAlternativeOptions
      )
    }
  }
  if (options.action === 'select') {
    const current = await readExplore(repositoryRoot, options.id ?? '')
    const selected = current.alternatives.find(item => item.id === options.alternativeId)
    if (!selected) {
      throw new Error(`Alternative not found: ${options.alternativeId}`)
    }
    return {
      kind: 'brainstorm',
      action: 'select',
      dryRun: options.dryRun ?? false,
      exploration: options.dryRun
        ? Object.freeze({
            ...current,
            status: 'converging',
            selectedAlternativeId: selected.id
          })
        : await selectExploreAlternative(repositoryRoot, current.id, selected.id)
    }
  }
  const current = await readExplore(repositoryRoot, options.id ?? '')
  const selected = current.alternatives.find(item => item.id === current.selectedAlternativeId)
  if (!selected) {
    throw new Error('Select an alternative before crystallizing')
  }
  const createOptions = {
    id: options.specId,
    title: current.title,
    objective: `${current.problem}\n\nSelected approach: ${selected.summary}`,
    nonGoals: 'Alternatives not selected during Explore.',
    requirements:
      selected.benefits.map(value => `- ${value}`).join('\n') ||
      '- Preserve the selected approach.',
    constraints: selected.tradeoffs.map(value => `- ${value}`).join('\n'),
    acceptanceCriteria: options.acceptanceCriteria ?? '',
    risks: selected.risks.map(value => `- ${value}`).join('\n')
  }
  if (options.dryRun) {
    const preview = previewSpecCreation(repositoryRoot, createOptions)
    return {
      kind: 'brainstorm',
      action: 'crystallize',
      dryRun: true,
      exploration: current,
      spec: preview.spec,
      specContent: preview.content
    }
  }
  const spec = await createSpec(repositoryRoot, createOptions)
  return {
    kind: 'brainstorm',
    action: 'crystallize',
    dryRun: false,
    exploration: await linkExploreSpec(repositoryRoot, current.id, spec.id),
    spec
  }
}
