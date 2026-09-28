import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

/** A few milliseconds between events keeps the replay in a readable order. */
const pause = () => new Promise(resolve => setTimeout(resolve, 20))

/**
 * Builds the demo repository content through the real Ordo core, so it always
 * matches the current product. Agent runs are simulated: sessions with made-up
 * token counts, because a real run would spend the presenter's Claude or Codex plan.
 */
export async function createDemoScenario(projectDirectory) {
  const core = await import(
    pathToFileURL(path.join(repositoryRoot, 'packages/core/dist/index.js')).href
  )
  const root = projectDirectory
  const write = async (file, content) => {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }

  // The application code the agents work on.
  await write('README.md', '# Checkout service\n\nOrders and payments for the web shop.\n')
  await write(
    'src/checkout.ts',
    'export async function checkout(order) {\n  return saveOrder(order)\n}\n'
  )
  await write(
    'src/legacy-validation.ts',
    'export const isValidCard = (card: string) => card.length === 16\n'
  )

  // A simulated agent run: Ordo photographs the files before and after, exactly as
  // `ordo agent` does, and `edit` plays the agent's changes.
  async function simulatedRun(planId, stepId, agent, tokens, edit) {
    const session = await core.createSession(root, {
      title: `Simulated ${agent} run on ${stepId}`
    })
    await core.startPlanStep(root, planId, stepId, session.id)
    await core.recordRunSnapshot(root, session.id, 'before')
    await edit()
    await core.recordRunSnapshot(root, session.id, 'after')
    await core.appendSessionEvent(root, session.id, {
      type: 'note',
      data: { type: 'harness', id: agent, version: agent === 'codex' ? '0.157.0' : '2.1.282' }
    })
    if (tokens) {
      await core.appendSessionEvent(root, session.id, {
        type: 'usage',
        data: { inputTokens: tokens - 2000, outputTokens: 2000, totalTokens: tokens }
      })
    }
    await core.appendSessionEvent(root, session.id, {
      type: 'approval',
      data: { provider: agent, status: 'approved', requestId: '1', decision: 'accept' }
    })
    await core.finishPlanStep(root, planId, stepId, 'paused', {
      actorType: 'system',
      reason: 'Agent run finished; waiting for human review'
    })
    await pause()
  }

  await core.initializeProjectContext(root)
  // Business context the agents receive, and the team profile they run with.
  await write(
    'docs/business.md',
    '# Checkout service\n\nOnline shop checkout. Rejected payments must never create an order; customers must see why a payment failed.\n'
  )
  await core.addContextEntry(root, 'docs/business.md')
  await core.initializeProjectProfile(root, path.join(repositoryRoot, 'content'), {
    defaultAgentId: 'tdd-guide'
  })

  // A requirement that went through most of the workflow.
  const exploration = await core.createExplore(root, {
    title: 'Payment safety',
    problem: 'Invalid payments reach the order store.'
  })
  await pause()
  await core.addExploreAlternative(root, exploration.id, {
    title: 'Validate before persistence',
    summary: 'Reject invalid payments before the order is saved.',
    tradeoffs: ['Adds latency to checkout']
  })
  await core.addExploreAlternative(root, exploration.id, {
    title: 'Reconcile afterwards',
    summary: 'Save first, clean up invalid orders in a nightly job.',
    tradeoffs: ['Invalid orders are visible for hours']
  })
  await pause()
  await core.selectExploreAlternative(root, exploration.id, 'validate-before-persistence')
  await pause()
  const checkout = await core.createSpec(root, {
    title: 'Safe checkout',
    objective: 'Reject invalid payments before an order is persisted.',
    actors: 'Customer; Payment provider',
    acceptanceCriteria:
      '- Invalid cards are rejected with a clear message.\n- No order is stored for a rejected payment.'
  })
  await core.linkExploreSpec(root, exploration.id, checkout.id)
  await pause()
  await core.updateSpecStatus(root, checkout.id, 'ready')
  await pause()
  const architecture = await core.createArchitectureProposal(root, {
    title: 'Synchronous payment validation',
    specId: checkout.id,
    impact: ['checkout API'],
    components: [
      { name: 'checkout', responsibility: 'Validate payments', changes: ['add PaymentValidator'] }
    ],
    contracts: ['POST /orders returns 422 for invalid payments'],
    decisions: ['Validate synchronously before persistence', 'Keep provider errors out of logs']
  })
  await pause()
  await core.approveArchitectureProposal(root, architecture.id)
  await pause()
  const plan = await core.createPlan(root, {
    title: 'Safe checkout implementation',
    specId: checkout.id,
    steps: [
      {
        id: 'validate',
        description: 'Add PaymentValidator',
        expectedOutput: 'Invalid payments rejected',
        verification: ['pnpm test']
      },
      {
        id: 'persist',
        description: 'Persist only validated orders',
        expectedOutput: 'No order for rejected payments',
        dependsOn: ['validate'],
        verification: ['pnpm test']
      },
      {
        id: 'errors',
        description: 'Clear error messages',
        expectedOutput: '422 with a reason',
        dependsOn: ['persist'],
        verification: ['pnpm test']
      },
      {
        id: 'logging',
        description: 'Log every rejected payment with its reason, without card data',
        expectedOutput: 'One log line per rejected payment',
        dependsOn: ['errors'],
        verification: ['pnpm test']
      }
    ]
  })
  await pause()
  await simulatedRun(plan.id, 'validate', 'claude-code', 42000, async () => {
    await write(
      'src/payment-validator.ts',
      'export function validatePayment(card: string): boolean {\n  return /^\\d{16}$/.test(card)\n}\n'
    )
    await write(
      'src/checkout.ts',
      "import { validatePayment } from './payment-validator'\n\nexport async function checkout(order) {\n  if (!validatePayment(order.card)) throw new Error('Invalid payment')\n  return saveOrder(order)\n}\n"
    )
    await unlink(path.join(root, 'src/legacy-validation.ts'))
  })
  // The reviewer keeps the new validator but undoes the deletion of the legacy module.
  await core.reviewAgentStep(root, plan.id, 'validate', 'changes-requested', {
    note: 'Keep the legacy validation until the migration; add the CVV length test',
    rejectFiles: ['src/legacy-validation.ts']
  })
  await pause()
  await simulatedRun(plan.id, 'validate', 'claude-code', 18000, async () => {
    await write(
      'src/payment-validator.ts',
      'export function validatePayment(card: string, cvv: string): boolean {\n  return /^\\d{16}$/.test(card) && /^\\d{3,4}$/.test(cvv)\n}\n'
    )
    await write(
      'src/payment-validator.test.ts',
      "import { validatePayment } from './payment-validator'\n\ntest('rejects a short CVV', () => {\n  expect(validatePayment('4111111111111111', '1')).toBe(false)\n})\n"
    )
  })
  await core.reviewAgentStep(root, plan.id, 'validate', 'approved')
  await pause()
  await simulatedRun(plan.id, 'persist', 'codex', undefined, async () => {
    await write(
      'src/checkout.ts',
      "import { validatePayment } from './payment-validator'\n\nexport async function checkout(order) {\n  if (!validatePayment(order.card, order.cvv)) return { status: 422 }\n  return saveOrder(order)\n}\n"
    )
  })
  await core.reviewAgentStep(root, plan.id, 'persist', 'approved', {
    note: 'Checked the rollback path'
  })
  await pause()
  // Left waiting for review: the agent also rewrote the README, which the presenter
  // can undo live by unchecking it.
  await simulatedRun(plan.id, 'errors', 'claude-code', 9000, async () => {
    await write(
      'src/errors.ts',
      'export const paymentError = (reason: string) => ({ status: 422, reason })\n'
    )
    await write(
      'src/checkout.ts',
      "import { paymentError } from './errors'\nimport { validatePayment } from './payment-validator'\n\nexport async function checkout(order) {\n  if (!validatePayment(order.card, order.cvv)) return paymentError('Card or CVV is not valid')\n  return saveOrder(order)\n}\n"
    )
    await write('README.md', '# Checkout service\n\nNow with AI-powered payments!\n')
  })

  // A requirement still waiting for business approval.
  await core.createSpec(root, {
    title: 'Order audit trail',
    objective: 'Every order state change is traceable for support and compliance.',
    acceptanceCriteria: '- Each state change records actor and timestamp.'
  })

  // An exploration that has not become a requirement yet.
  const search = await core.createExplore(root, {
    title: 'Faster product search',
    problem: 'Search takes several seconds on large catalogs.'
  })
  await core.addExploreAlternative(root, search.id, {
    title: 'MongoDB text index',
    summary: 'Use a text index on name and description.',
    tradeoffs: ['Limited relevance tuning']
  })

  return { specId: checkout.id, planId: plan.id }
}
