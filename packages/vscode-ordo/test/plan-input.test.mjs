import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildImplementationPlanOptions } from '../dist/plan-input.js'

test('maps a shared requirement and guided input into the core plan contract', () => {
  const options = buildImplementationPlanOptions(
    { id: 'safe-checkout', title: 'Safe checkout' },
    {
      title: 'Safe checkout implementation',
      firstStep: 'Add payment validation',
      expectedOutput: 'Invalid payment is rejected before persistence',
      verification: 'pnpm test; pnpm typecheck'
    }
  )

  assert.deepEqual(options, {
    title: 'Safe checkout implementation',
    specId: 'safe-checkout',
    steps: [
      {
        id: 'step-1',
        description: 'Add payment validation',
        inputs: ['.ordo/specs/safe-checkout.md'],
        expectedOutput: 'Invalid payment is rejected before persistence',
        verification: ['pnpm test', 'pnpm typecheck']
      }
    ]
  })
})

test('rejects an implementation plan without a verifiable first step', () => {
  assert.throws(
    () =>
      buildImplementationPlanOptions(
        { id: 'safe-checkout', title: 'Safe checkout' },
        {
          title: 'Plan',
          firstStep: 'Implement checkout',
          expectedOutput: 'A working checkout',
          verification: ' ; '
        }
      ),
    /verification are required/
  )
})
