import type { CreatePlanOptions } from '@pompeitech/ordo-core'

export interface PlanSpecReference {
  readonly id: string
  readonly title: string
}

export interface ImplementationPlanInput {
  readonly title: string
  readonly firstStep: string
  readonly expectedOutput: string
  readonly verification: string
}

export function buildImplementationPlanOptions(
  spec: PlanSpecReference,
  input: ImplementationPlanInput
): CreatePlanOptions {
  const title = input.title.trim()
  const firstStep = input.firstStep.trim()
  const expectedOutput = input.expectedOutput.trim()
  const verification = input.verification
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)

  if (!title || !firstStep || !expectedOutput || verification.length === 0) {
    throw new Error('Plan title, first step, expected output, and verification are required.')
  }

  return {
    title,
    specId: spec.id,
    steps: [
      {
        id: 'step-1',
        description: firstStep,
        inputs: [`.ordo/specs/${spec.id}.md`],
        expectedOutput,
        verification
      }
    ]
  }
}
