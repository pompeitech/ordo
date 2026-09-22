import { OrdoError } from '../errors/ordo-error.js'
import type { WorkflowDefinition, WorkflowRunState } from './types.js'

export function createWorkflowRun(workflow: WorkflowDefinition): WorkflowRunState {
  if (workflow.steps.length === 0) {
    invalid('Workflow must contain at least one step')
  }

  return Object.freeze({
    workflowId: workflow.id,
    status: 'pending',
    currentStepIndex: null,
    completedSteps: Object.freeze([]),
    results: Object.freeze([])
  })
}

function invalid(message: string): never {
  throw new OrdoError('WORKFLOW_TRANSITION_INVALID', message)
}

export class WorkflowStateMachine {
  readonly workflow: WorkflowDefinition
  #state: WorkflowRunState

  constructor(workflow: WorkflowDefinition) {
    this.workflow = workflow
    this.#state = createWorkflowRun(workflow)
  }

  get state(): WorkflowRunState {
    return this.#state
  }

  start(): WorkflowRunState {
    if (this.#state.status !== 'pending') {
      invalid('Only a pending workflow can start')
    }

    this.#state = Object.freeze({ ...this.#state, status: 'running' })
    return this.#state
  }

  startStep(index: number): WorkflowRunState {
    if (this.#state.status !== 'running') {
      invalid('Workflow is not running')
    }

    if (this.#state.currentStepIndex !== null) {
      invalid('Another workflow step is already running')
    }

    if (index !== this.#state.completedSteps.length || !this.workflow.steps[index]) {
      invalid(`Workflow step cannot start out of order: ${index}`)
    }

    this.#state = Object.freeze({ ...this.#state, currentStepIndex: index })
    return this.#state
  }

  completeStep(value: unknown): WorkflowRunState {
    if (this.#state.status !== 'running' || this.#state.currentStepIndex === null) {
      invalid('No workflow step is running')
    }

    const step = this.workflow.steps[this.#state.currentStepIndex]
    if (!step) {
      invalid('Current workflow step does not exist')
    }

    const completedSteps = Object.freeze([...this.#state.completedSteps, step.id])
    const results = Object.freeze([...this.#state.results, { stepId: step.id, value }])
    this.#state = Object.freeze({
      ...this.#state,
      status: completedSteps.length === this.workflow.steps.length ? 'succeeded' : 'running',
      currentStepIndex: null,
      completedSteps,
      results
    })
    return this.#state
  }

  fail(error: unknown): WorkflowRunState {
    if (this.#state.status !== 'running') {
      invalid('Only a running workflow can fail')
    }

    this.#state = Object.freeze({
      ...this.#state,
      status: 'failed',
      currentStepIndex: null,
      failure: error instanceof Error ? error.message : String(error)
    })
    return this.#state
  }

  cancel(reason = 'Cancelled'): WorkflowRunState {
    if (this.#state.status !== 'pending' && this.#state.status !== 'running') {
      invalid('Completed workflows cannot be cancelled')
    }

    this.#state = Object.freeze({
      ...this.#state,
      status: 'cancelled',
      currentStepIndex: null,
      failure: reason
    })
    return this.#state
  }
}
