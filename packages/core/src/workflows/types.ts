export interface WorkflowStep {
  readonly id: string
  readonly index: number
  readonly instruction: string
}

export interface WorkflowDefinition {
  readonly id: string
  readonly title: string
  readonly sourcePath: string
  readonly objective: string
  readonly inputs: readonly string[]
  readonly preconditions: readonly string[]
  readonly steps: readonly WorkflowStep[]
  readonly safetyRules: readonly string[]
  readonly successCriteria: string
}

export type WorkflowRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface WorkflowStepResult {
  readonly stepId: string
  readonly value: unknown
}

export interface WorkflowRunState {
  readonly workflowId: string
  readonly status: WorkflowRunStatus
  readonly currentStepIndex: number | null
  readonly completedSteps: readonly string[]
  readonly results: readonly WorkflowStepResult[]
  readonly failure?: string
}

export interface WorkflowExecutionContext {
  readonly workflow: WorkflowDefinition
  readonly step: WorkflowStep
  readonly previousResults: readonly WorkflowStepResult[]
  readonly input: unknown
}

export type WorkflowStepExecutor = (context: WorkflowExecutionContext) => Promise<unknown>
