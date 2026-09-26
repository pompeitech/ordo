import {
  type DecisionTrail,
  findRepositoryRoot,
  type WorkflowItem,
  workflowStatus,
  workflowTrail
} from '@pompeitech/ordo-core'

export interface StatusOptions {
  readonly directory: string
  readonly specId?: string
}

export type StatusReport =
  | {
      readonly schemaVersion: 1
      readonly command: 'status'
      readonly repositoryRoot: string
      readonly items: readonly WorkflowItem[]
    }
  | {
      readonly schemaVersion: 1
      readonly command: 'status-trail'
      readonly repositoryRoot: string
      readonly trail: DecisionTrail
    }

export async function reportStatus(options: StatusOptions): Promise<StatusReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.specId) {
    return {
      schemaVersion: 1,
      command: 'status-trail',
      repositoryRoot,
      trail: await workflowTrail(repositoryRoot, options.specId)
    }
  }
  return {
    schemaVersion: 1,
    command: 'status',
    repositoryRoot,
    items: (await workflowStatus(repositoryRoot)).items
  }
}
