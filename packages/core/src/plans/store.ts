import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendAuditEvent, type TransitionContext } from '../audit/store.js'
import { OrdoError } from '../errors/ordo-error.js'
import { readSpec } from '../specs/store.js'
import type {
  CreatePlanOptions,
  PlanRecord,
  PlanStatus,
  PlanStep,
  PlanStepStatus,
  PlanValidationReport
} from './types.js'

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PLAN_STATUSES: readonly PlanStatus[] = [
  'draft',
  'ready',
  'running',
  'paused',
  'completed',
  'cancelled',
  'error'
]
const STEP_STATUSES: readonly PlanStepStatus[] = [
  'pending',
  'running',
  'paused',
  'blocked',
  'completed',
  'cancelled',
  'skipped',
  'error'
]

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function plansDirectory(repositoryRoot: string): string {
  return path.join(repositoryRoot, '.ordo', 'plans')
}

function planPath(repositoryRoot: string, id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new OrdoError('PLAN_INVALID', `Invalid plan id: ${id}`)
  }
  return path.join(plansDirectory(repositoryRoot), `${id}.json`)
}

async function exists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

async function atomicWrite(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, target)
}

function validatePlanValue(value: unknown): PlanValidationReport {
  const errors: string[] = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Plan must be an object'] }
  }
  const plan = value as Record<string, unknown>
  if (plan.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (typeof plan.id !== 'string' || !ID_PATTERN.test(plan.id)) {
    errors.push('id is invalid')
  }
  if (typeof plan.title !== 'string' || !plan.title.trim()) {
    errors.push('title is required')
  }
  if (typeof plan.specId !== 'string' || !ID_PATTERN.test(plan.specId)) {
    errors.push('specId is invalid')
  }
  if (typeof plan.status !== 'string' || !PLAN_STATUSES.includes(plan.status as PlanStatus)) {
    errors.push('plan status is invalid')
  }
  if (typeof plan.createdAt !== 'string' || typeof plan.updatedAt !== 'string') {
    errors.push('createdAt and updatedAt are required')
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    errors.push('steps must not be empty')
  }
  const steps = Array.isArray(plan.steps) ? (plan.steps as Array<Record<string, unknown>>) : []
  const ids = new Set<string>()
  for (const [index, step] of steps.entries()) {
    const label = `steps[${index}]`
    if (typeof step.id !== 'string' || !ID_PATTERN.test(step.id)) {
      errors.push(`${label}.id is invalid`)
    } else if (ids.has(step.id)) {
      errors.push(`${label}.id is duplicated`)
    } else {
      ids.add(step.id)
    }
    if (typeof step.description !== 'string' || !step.description.trim()) {
      errors.push(`${label}.description is required`)
    }
    if (typeof step.expectedOutput !== 'string' || !step.expectedOutput.trim()) {
      errors.push(`${label}.expectedOutput is required`)
    }
    if (!Array.isArray(step.verification) || step.verification.length === 0) {
      errors.push(`${label}.verification must not be empty`)
    }
    if (!Array.isArray(step.dependsOn)) {
      errors.push(`${label}.dependsOn must be an array`)
    }
    if (!Array.isArray(step.inputs) || !Array.isArray(step.areas)) {
      errors.push(`${label}.inputs and areas must be arrays`)
    }
    if (typeof step.status !== 'string' || !STEP_STATUSES.includes(step.status as PlanStepStatus)) {
      errors.push(`${label}.status is invalid`)
    }
  }
  for (const [index, step] of steps.entries()) {
    for (const dependency of Array.isArray(step.dependsOn) ? step.dependsOn : []) {
      if (typeof dependency !== 'string' || !ids.has(dependency)) {
        errors.push(`steps[${index}] has unknown dependency: ${String(dependency)}`)
      }
      if (dependency === step.id) {
        errors.push(`steps[${index}] cannot depend on itself`)
      }
    }
  }
  const graph = new Map(steps.map(step => [String(step.id), (step.dependsOn as string[]) ?? []]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function visit(id: string): boolean {
    if (visiting.has(id)) {
      return true
    }
    if (visited.has(id)) {
      return false
    }
    visiting.add(id)
    for (const dependency of graph.get(id) ?? []) {
      if (visit(dependency)) {
        return true
      }
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  if ([...graph.keys()].some(visit)) {
    errors.push('step dependencies contain a cycle')
  }
  if (errors.length > 0) {
    return { valid: false, errors: Object.freeze(errors) }
  }
  return { valid: true, plan: Object.freeze(value as PlanRecord), errors: Object.freeze([]) }
}

export async function previewPlanCreation(
  repositoryRoot: string,
  options: CreatePlanOptions
): Promise<PlanRecord> {
  await readSpec(repositoryRoot, options.specId)
  const id = options.id ?? slug(options.title)
  const now = new Date().toISOString()
  const steps: PlanStep[] = options.steps.map((step, index) => ({
    id: step.id ?? `step-${index + 1}`,
    description: step.description.trim(),
    inputs: Object.freeze([...(step.inputs ?? [])]),
    expectedOutput: step.expectedOutput.trim(),
    areas: Object.freeze([...(step.areas ?? [])]),
    dependsOn: Object.freeze([...(step.dependsOn ?? [])]),
    verification: Object.freeze([...step.verification]),
    status: 'pending'
  }))
  const plan: PlanRecord = Object.freeze({
    schemaVersion: 1,
    id,
    title: options.title.trim(),
    specId: options.specId,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    steps: Object.freeze(steps)
  })
  const validation = validatePlanValue(plan)
  if (!validation.valid) {
    throw new OrdoError('PLAN_INVALID', 'Plan is invalid', {
      details: { errors: validation.errors }
    })
  }
  return plan
}

export async function createPlan(
  repositoryRoot: string,
  options: CreatePlanOptions
): Promise<PlanRecord> {
  const plan = await previewPlanCreation(repositoryRoot, options)
  const target = planPath(repositoryRoot, plan.id)
  if (await exists(target)) {
    throw new OrdoError('PLAN_INVALID', `Plan already exists: ${plan.id}`)
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
  await appendAuditEvent(repositoryRoot, {
    kind: 'plan',
    artifactId: plan.id,
    action: 'created',
    to: plan.status,
    ref: { kind: 'spec', id: plan.specId }
  })
  return plan
}

export async function validatePlan(
  repositoryRoot: string,
  id: string
): Promise<PlanValidationReport> {
  const target = planPath(repositoryRoot, id)
  if (!(await exists(target))) {
    throw new OrdoError('PLAN_NOT_FOUND', `Plan not found: ${id}`)
  }
  try {
    return validatePlanValue(JSON.parse(await readFile(target, 'utf8')))
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : error}`]
    }
  }
}

export async function readPlan(repositoryRoot: string, id: string): Promise<PlanRecord> {
  const report = await validatePlan(repositoryRoot, id)
  if (!report.valid || !report.plan) {
    throw new OrdoError('PLAN_INVALID', `Plan is invalid: ${id}`, {
      details: { errors: report.errors }
    })
  }
  return report.plan
}

export async function listPlans(repositoryRoot: string): Promise<readonly PlanRecord[]> {
  let names: string[]
  try {
    names = (await readdir(plansDirectory(repositoryRoot)))
      .filter(name => name.endsWith('.json'))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze([])
    }
    throw error
  }
  return Object.freeze(
    await Promise.all(names.map(name => readPlan(repositoryRoot, name.slice(0, -5))))
  )
}

export function readyPlanSteps(plan: PlanRecord): readonly PlanStep[] {
  const completed = new Set(
    plan.steps
      .filter(step => step.status === 'completed' || step.status === 'skipped')
      .map(step => step.id)
  )
  return Object.freeze(
    plan.steps.filter(
      step =>
        step.status === 'pending' && step.dependsOn.every(dependency => completed.has(dependency))
    )
  )
}

export async function startPlanStep(
  repositoryRoot: string,
  planId: string,
  stepId?: string,
  sessionId?: string,
  context: TransitionContext = {}
): Promise<PlanRecord> {
  const plan = await readPlan(repositoryRoot, planId)
  if (plan.status === 'paused' || plan.status === 'cancelled' || plan.status === 'completed') {
    throw new OrdoError('PLAN_TRANSITION_INVALID', `Plan cannot run from status: ${plan.status}`)
  }
  if (plan.steps.some(step => step.status === 'running')) {
    throw new OrdoError('PLAN_TRANSITION_INVALID', 'Another plan step is already running')
  }
  const ready = readyPlanSteps(plan)
  const selected = stepId ? ready.find(step => step.id === stepId) : ready[0]
  if (!selected) {
    throw new OrdoError(
      'PLAN_TRANSITION_INVALID',
      stepId ? `Step is blocked or not pending: ${stepId}` : 'No plan step is ready'
    )
  }
  const now = new Date().toISOString()
  const next: PlanRecord = Object.freeze({
    ...plan,
    status: 'running',
    updatedAt: now,
    steps: Object.freeze(
      plan.steps.map(step =>
        step.id === selected.id
          ? Object.freeze({ ...step, status: 'running' as const, sessionId, startedAt: now })
          : step
      )
    )
  })
  await atomicWrite(planPath(repositoryRoot, planId), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'plan',
    artifactId: planId,
    action: 'step-started',
    stepId: selected.id,
    from: selected.status,
    to: 'running',
    ref: sessionId ? { kind: 'session', id: sessionId } : undefined,
    ...context
  })
  return next
}

export async function finishPlanStep(
  repositoryRoot: string,
  planId: string,
  stepId: string,
  status: Extract<PlanStepStatus, 'completed' | 'error' | 'paused' | 'cancelled' | 'skipped'>,
  context: TransitionContext = {}
): Promise<PlanRecord> {
  const plan = await readPlan(repositoryRoot, planId)
  const current = plan.steps.find(step => step.id === stepId)
  if (
    !current ||
    (current.status !== 'running' && current.status !== 'paused' && status !== 'skipped')
  ) {
    throw new OrdoError('PLAN_TRANSITION_INVALID', `Step cannot transition to ${status}: ${stepId}`)
  }
  const now = new Date().toISOString()
  const steps = plan.steps.map(step =>
    step.id === stepId
      ? Object.freeze({
          ...step,
          status,
          completedAt: status === 'completed' || status === 'skipped' ? now : undefined
        })
      : step
  )
  const completed = steps.every(step => step.status === 'completed' || step.status === 'skipped')
  const next: PlanRecord = Object.freeze({
    ...plan,
    status: completed
      ? 'completed'
      : status === 'error'
        ? 'error'
        : status === 'paused'
          ? 'paused'
          : 'ready',
    updatedAt: now,
    steps: Object.freeze(steps)
  })
  await atomicWrite(planPath(repositoryRoot, planId), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'plan',
    artifactId: planId,
    action: 'step-finished',
    stepId,
    from: current.status,
    to: status,
    ref: current.sessionId ? { kind: 'session', id: current.sessionId } : undefined,
    ...context
  })
  return next
}

export type StepReviewDecision = 'approved' | 'changes-requested' | 'blocked'

export interface StepReviewOptions {
  /** Required when changes are requested or the step is blocked. */
  readonly note?: string
  readonly actorType?: TransitionContext['actorType']
  /** Files the agent changed that the reviewer kept or undid, for the audit log. */
  readonly files?: { readonly accepted: readonly string[]; readonly rejected: readonly string[] }
}

const REVIEW_OUTCOME: Readonly<Record<StepReviewDecision, PlanStepStatus>> = {
  approved: 'completed',
  'changes-requested': 'pending',
  blocked: 'blocked'
}

/**
 * A person's review of a step an agent finished: approve it, send it back for
 * changes (the step becomes runnable again), or block it. Only a human can decide.
 */
/** Throws unless a person may record this review now; returns the step under review. */
export function assertStepReviewable(
  plan: PlanRecord,
  stepId: string,
  decision: StepReviewDecision,
  options: StepReviewOptions = {}
): PlanStep {
  if (!(decision in REVIEW_OUTCOME)) {
    throw new OrdoError('PLAN_TRANSITION_INVALID', `Unknown review decision: ${decision}`)
  }
  if ((options.actorType ?? 'human') !== 'human') {
    throw new OrdoError('PLAN_TRANSITION_INVALID', 'Only a person can review a plan step')
  }
  if (decision !== 'approved' && !options.note?.trim()) {
    throw new OrdoError(
      'PLAN_TRANSITION_INVALID',
      'Explain what has to change or why the step is blocked'
    )
  }
  const current = plan.steps.find(step => step.id === stepId)
  if (!current || current.status !== 'paused') {
    throw new OrdoError(
      'PLAN_TRANSITION_INVALID',
      `Only a step paused for review can be reviewed: ${stepId}`
    )
  }
  return current
}

export async function reviewPlanStep(
  repositoryRoot: string,
  planId: string,
  stepId: string,
  decision: StepReviewDecision,
  options: StepReviewOptions = {}
): Promise<PlanRecord> {
  const plan = await readPlan(repositoryRoot, planId)
  const current = assertStepReviewable(plan, stepId, decision, options)
  const actorType = 'human' as const
  const note = options.note?.trim()
  const now = new Date().toISOString()
  const outcome = REVIEW_OUTCOME[decision]
  const steps = plan.steps.map(step =>
    step.id === stepId
      ? Object.freeze({
          ...step,
          status: outcome,
          completedAt: outcome === 'completed' ? now : undefined
        })
      : step
  )
  const completed = steps.every(step => step.status === 'completed' || step.status === 'skipped')
  const next: PlanRecord = Object.freeze({
    ...plan,
    status: completed ? 'completed' : 'ready',
    updatedAt: now,
    steps: Object.freeze(steps)
  })
  await atomicWrite(planPath(repositoryRoot, planId), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'plan',
    artifactId: planId,
    action: 'reviewed',
    stepId,
    from: current.status,
    to: decision,
    reason: note,
    actorType,
    ref: current.sessionId ? { kind: 'session', id: current.sessionId } : undefined,
    files: options.files
  })
  return next
}
