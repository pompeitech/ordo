export type PlanStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error'
export type PlanStepStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'skipped'
  | 'error'

export interface PlanStepInput {
  readonly id?: string
  readonly description: string
  readonly inputs?: readonly string[]
  readonly expectedOutput: string
  readonly areas?: readonly string[]
  readonly dependsOn?: readonly string[]
  readonly verification: readonly string[]
}

export interface PlanStep extends PlanStepInput {
  readonly id: string
  readonly inputs: readonly string[]
  readonly areas: readonly string[]
  readonly dependsOn: readonly string[]
  readonly status: PlanStepStatus
  readonly sessionId?: string
  readonly startedAt?: string
  readonly completedAt?: string
}

export interface PlanRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly specId: string
  readonly status: PlanStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly steps: readonly PlanStep[]
}

export interface CreatePlanOptions {
  readonly id?: string
  readonly title: string
  readonly specId: string
  readonly steps: readonly PlanStepInput[]
}

export interface PlanValidationReport {
  readonly valid: boolean
  readonly plan?: PlanRecord
  readonly errors: readonly string[]
}
