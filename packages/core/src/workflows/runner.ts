import { WorkflowStateMachine } from './state-machine.js'
import type { WorkflowDefinition, WorkflowRunState, WorkflowStepExecutor } from './types.js'

export interface RunWorkflowOptions {
  readonly input?: unknown
  readonly signal?: AbortSignal
  readonly onTransition?: (state: WorkflowRunState) => void
}

export async function runWorkflow(
  workflow: WorkflowDefinition,
  executeStep: WorkflowStepExecutor,
  options: RunWorkflowOptions = {}
): Promise<WorkflowRunState> {
  const machine = new WorkflowStateMachine(workflow)
  const transition = (state: WorkflowRunState): void => options.onTransition?.(state)
  transition(machine.start())

  for (const step of workflow.steps) {
    if (options.signal?.aborted) {
      transition(machine.cancel('Aborted'))
      return machine.state
    }

    transition(machine.startStep(step.index))
    try {
      const value = await executeStep({
        workflow,
        step,
        previousResults: machine.state.results,
        input: options.input
      })
      transition(machine.completeStep(value))
    } catch (error) {
      transition(machine.fail(error))
      return machine.state
    }
  }

  return machine.state
}
