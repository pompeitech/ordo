import { readAuditEvents } from '../audit/store.js'
import type { PlanRecord } from '../plans/types.js'
import { readSession } from '../sessions/store.js'
import type { SessionDetail } from '../sessions/types.js'

export interface TokenUsage {
  readonly input?: number
  readonly output?: number
  readonly total: number
}

export interface StepSession {
  readonly stepId: string
  readonly detail: SessionDetail
  /** Undefined when the harness reported no token usage for the run. */
  readonly tokens?: TokenUsage
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** Token usage reported by the harness during a session, or undefined if none was. */
export function sessionTokens(detail: SessionDetail): TokenUsage | undefined {
  const usage = detail.events.filter(event => event.type === 'usage')
  if (usage.length === 0) {
    return undefined
  }
  let input = 0
  let output = 0
  let total = 0
  for (const event of usage) {
    input += count(event.data.inputTokens)
    output += count(event.data.outputTokens)
    total +=
      count(event.data.totalTokens) ||
      count(event.data.inputTokens) + count(event.data.outputTokens)
  }
  return Object.freeze({ input, output, total })
}

/**
 * Every agent session that ran a step of the plan, including earlier runs of a step
 * sent back for changes: the audit log keeps each start, the plan only the latest.
 */
export async function planStepSessions(
  repositoryRoot: string,
  plan: PlanRecord
): Promise<readonly StepSession[]> {
  const pairs = new Map<string, string>()
  for (const event of await readAuditEvents(repositoryRoot, 'plan', plan.id)) {
    if (event.action === 'step-started' && event.stepId && event.ref?.kind === 'session') {
      pairs.set(event.ref.id, event.stepId)
    }
  }
  for (const step of plan.steps) {
    if (step.sessionId && !pairs.has(step.sessionId)) {
      pairs.set(step.sessionId, step.id)
    }
  }
  const sessions: StepSession[] = []
  for (const [sessionId, stepId] of pairs) {
    const detail = await readSession(repositoryRoot, sessionId).catch(() => undefined)
    if (detail) {
      sessions.push(Object.freeze({ stepId, detail, tokens: sessionTokens(detail) }))
    }
  }
  return Object.freeze(sessions)
}
