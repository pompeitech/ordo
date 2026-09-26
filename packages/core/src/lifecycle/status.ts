import { listArchitectureProposals } from '../architectures/store.js'
import type { ArchitectureProposal } from '../architectures/types.js'
import { listExplores } from '../explore/store.js'
import type { ExploreRecord } from '../explore/types.js'
import { listPlans, readyPlanSteps } from '../plans/store.js'
import type { PlanRecord } from '../plans/types.js'
import { listSpecs, validateSpec } from '../specs/store.js'
import type { SpecRecord } from '../specs/types.js'
import { planStepSessions } from './sessions.js'

/** The fixed Ordo workflow (roadmap §4); no surface may reorder or skip its gates. */
export const WORKFLOW_PHASES = [
  'brainstorm',
  'spec',
  'architect',
  'plan',
  'implement',
  'verify',
  'review',
  'record'
] as const

export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number]

/**
 * `skipped`: optional phase the team went past (e.g. a spec written without an
 * exploration). `unavailable`: the phase is not implemented by Ordo yet.
 */
export type PhaseState =
  | 'done'
  | 'in-progress'
  | 'blocked'
  | 'not-started'
  | 'skipped'
  | 'unavailable'

export type NextActionId =
  | 'add-alternative'
  | 'select-alternative'
  | 'crystallize-exploration'
  | 'mark-spec-ready'
  | 'propose-architecture'
  | 'approve-architecture'
  | 'create-plan'
  | 'run-step'
  | 'review-step'

export interface ArtifactRef {
  readonly kind: 'explore' | 'spec' | 'architecture' | 'plan'
  readonly id: string
  readonly path: string
  readonly status: string
}

export interface NextAction {
  readonly id: NextActionId
  readonly label: string
  /** The artifact the action applies to, e.g. the proposal to approve. */
  readonly target?: { readonly kind: ArtifactRef['kind']; readonly id: string }
  readonly stepId?: string
}

export interface PhaseStatus {
  readonly phase: WorkflowPhase
  readonly state: PhaseState
  readonly summary: string
  readonly blockedBy?: string
  readonly nextAction?: NextAction
  readonly artifacts: readonly ArtifactRef[]
}

export interface WorkflowItem {
  /** `spec:<id>` for requirements, `explore:<id>` for explorations not yet crystallized. */
  readonly key: string
  readonly title: string
  readonly specId?: string
  readonly lastActivity: string
  /** First phase that is neither done nor skipped, if any. */
  readonly currentPhase?: WorkflowPhase
  readonly phases: readonly PhaseStatus[]
  /** Tokens reported by agent sessions for this requirement; some harnesses report none. */
  readonly tokens?: { readonly total: number; readonly unmeasuredSessions: number }
}

export interface WorkflowOverview {
  readonly items: readonly WorkflowItem[]
}

const ref = {
  explore: (item: ExploreRecord): ArtifactRef => ({
    kind: 'explore',
    id: item.id,
    path: `.ordo/explore/${item.id}.json`,
    status: item.status
  }),
  spec: (item: SpecRecord): ArtifactRef => ({
    kind: 'spec',
    id: item.id,
    path: `.ordo/specs/${item.id}.md`,
    status: item.status
  }),
  architecture: (item: ArchitectureProposal): ArtifactRef => ({
    kind: 'architecture',
    id: item.id,
    path: `.ordo/architectures/${item.id}.json`,
    status: item.status
  }),
  plan: (item: PlanRecord): ArtifactRef => ({
    kind: 'plan',
    id: item.id,
    path: `.ordo/plans/${item.id}.json`,
    status: item.status
  })
}

function phase(
  name: WorkflowPhase,
  state: PhaseState,
  summary: string,
  extra: Partial<Omit<PhaseStatus, 'phase' | 'state' | 'summary'>> = {}
): PhaseStatus {
  return Object.freeze({ phase: name, state, summary, artifacts: [], ...extra })
}

const specIsApproved = (spec: SpecRecord) =>
  spec.status === 'ready' || spec.status === 'implemented' || spec.status === 'verified'

function latest<T extends { readonly updatedAt: string }>(items: readonly T[]): T | undefined {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function brainstormPhase(explores: readonly ExploreRecord[]): PhaseStatus {
  if (explores.length === 0) {
    return phase('brainstorm', 'skipped', 'Specified directly, without an exploration')
  }
  const titles = explores.map(item => `"${item.title}"`).join(', ')
  return phase('brainstorm', 'done', `Crystallized from ${titles}`, {
    artifacts: explores.map(ref.explore)
  })
}

function specPhase(spec: SpecRecord, errors: readonly string[]): PhaseStatus {
  const artifacts = [ref.spec(spec)]
  if (errors.length > 0) {
    return phase('spec', 'blocked', 'The specification is invalid', {
      blockedBy: errors[0],
      artifacts
    })
  }
  if (spec.status === 'draft') {
    return phase('spec', 'in-progress', 'Draft', {
      blockedBy: 'Waiting for business approval to mark it ready',
      nextAction: {
        id: 'mark-spec-ready',
        label: 'Mark ready',
        target: { kind: 'spec', id: spec.id }
      },
      artifacts
    })
  }
  if (spec.status === 'superseded') {
    return phase('spec', 'skipped', 'Superseded', { artifacts })
  }
  return phase('spec', 'done', `Status: ${spec.status}`, { artifacts })
}

function architectPhase(
  spec: SpecRecord,
  proposals: readonly ArchitectureProposal[],
  plans: readonly PlanRecord[]
): PhaseStatus {
  const artifacts = proposals.map(ref.architecture)
  const approved = proposals.find(item => item.status === 'approved')
  if (approved) {
    return phase('architect', 'done', `"${approved.title}" approved`, { artifacts })
  }
  const proposed = latest(proposals.filter(item => item.status === 'proposed'))
  if (proposed) {
    return phase('architect', 'in-progress', `"${proposed.title}" proposed`, {
      blockedBy: 'Waiting for human approval',
      nextAction: {
        id: 'approve-architecture',
        label: 'Approve architecture',
        target: { kind: 'architecture', id: proposed.id }
      },
      artifacts
    })
  }
  if (plans.length > 0) {
    return phase('architect', 'skipped', 'Planned without an architecture proposal', {
      artifacts
    })
  }
  if (!specIsApproved(spec)) {
    return phase('architect', 'blocked', 'Not started', {
      blockedBy: 'The specification must be ready first',
      artifacts
    })
  }
  return phase('architect', 'not-started', 'No architecture proposal yet', {
    nextAction: {
      id: 'propose-architecture',
      label: 'Propose architecture',
      target: { kind: 'spec', id: spec.id }
    },
    artifacts
  })
}

function planPhase(spec: SpecRecord, plans: readonly PlanRecord[]): PhaseStatus {
  const current = latest(plans.filter(item => item.status !== 'cancelled'))
  if (!current) {
    return phase('plan', 'not-started', 'No implementation plan yet', {
      nextAction: {
        id: 'create-plan',
        label: 'Create plan',
        target: { kind: 'spec', id: spec.id }
      },
      artifacts: plans.map(ref.plan)
    })
  }
  const steps = `${current.steps.length} step${current.steps.length === 1 ? '' : 's'}`
  if (current.status === 'draft') {
    return phase('plan', 'in-progress', `"${current.title}" · ${steps} · draft`, {
      artifacts: plans.map(ref.plan)
    })
  }
  return phase('plan', 'done', `"${current.title}" · ${steps}`, {
    artifacts: plans.map(ref.plan)
  })
}

function implementPhase(spec: SpecRecord, plans: readonly PlanRecord[]): PhaseStatus {
  const plan = latest(plans.filter(item => item.status !== 'cancelled'))
  if (!plan) {
    return phase('implement', 'blocked', 'Not started', {
      blockedBy: 'Needs an implementation plan'
    })
  }
  const artifacts = [ref.plan(plan)]
  const total = plan.steps.length
  const finished = plan.steps.filter(
    step => step.status === 'completed' || step.status === 'skipped'
  ).length
  const progress = `${finished}/${total} steps`
  if (total > 0 && finished === total) {
    return phase('implement', 'done', progress, { artifacts })
  }
  const failed = plan.steps.find(step => step.status === 'error')
  if (failed) {
    return phase('implement', 'blocked', progress, {
      blockedBy: `Step "${failed.id}" failed`,
      artifacts
    })
  }
  const blocked = plan.steps.find(step => step.status === 'blocked')
  if (blocked) {
    return phase('implement', 'blocked', progress, {
      blockedBy: `Step "${blocked.id}" was blocked in review`,
      artifacts
    })
  }
  const running = plan.steps.find(step => step.status === 'running')
  if (running) {
    return phase('implement', 'in-progress', `${progress} · "${running.id}" running`, {
      artifacts
    })
  }
  const paused = plan.steps.find(step => step.status === 'paused')
  if (paused) {
    return phase('implement', 'in-progress', progress, {
      blockedBy: `Step "${paused.id}" is paused for human review`,
      nextAction: {
        id: 'review-step',
        label: 'Review step',
        target: { kind: 'plan', id: plan.id },
        stepId: paused.id
      },
      artifacts
    })
  }
  if (!specIsApproved(spec)) {
    return phase('implement', 'blocked', progress, {
      blockedBy: 'The specification must be ready before agents can run',
      artifacts
    })
  }
  const next = readyPlanSteps(plan)[0]
  if (!next) {
    return phase('implement', 'blocked', progress, {
      blockedBy: 'No step is ready: check step dependencies',
      artifacts
    })
  }
  return phase('implement', finished > 0 ? 'in-progress' : 'not-started', progress, {
    nextAction: {
      id: 'run-step',
      label: `Run "${next.id}"`,
      target: { kind: 'plan', id: plan.id },
      stepId: next.id
    },
    artifacts
  })
}

const notYet = (name: WorkflowPhase) => phase(name, 'unavailable', 'Not available in Ordo yet')

function currentPhaseOf(phases: readonly PhaseStatus[]): WorkflowPhase | undefined {
  return phases.find(
    item => item.state !== 'done' && item.state !== 'skipped' && item.state !== 'unavailable'
  )?.phase
}

function explorationItem(explore: ExploreRecord): WorkflowItem {
  const nextAction: NextAction =
    explore.alternatives.length === 0
      ? { id: 'add-alternative', label: 'Add an alternative' }
      : !explore.selectedAlternativeId
        ? { id: 'select-alternative', label: 'Select an alternative' }
        : { id: 'crystallize-exploration', label: 'Crystallize into a spec' }
  const phases = [
    phase(
      'brainstorm',
      'in-progress',
      `${explore.alternatives.length} alternatives · ${explore.status}`,
      {
        nextAction: { ...nextAction, target: { kind: 'explore', id: explore.id } },
        artifacts: [ref.explore(explore)]
      }
    ),
    ...WORKFLOW_PHASES.slice(1).map(name =>
      ['verify', 'review', 'record'].includes(name)
        ? notYet(name)
        : phase(name, 'not-started', 'Waiting for the exploration')
    )
  ]
  return Object.freeze({
    key: `explore:${explore.id}`,
    title: explore.title,
    lastActivity: explore.updatedAt,
    currentPhase: 'brainstorm',
    phases: Object.freeze(phases)
  })
}

/**
 * Where every requirement stands in the Ordo workflow, computed from the shared
 * artifacts only. The same result backs the CLI and the editor.
 */
export async function workflowStatus(repositoryRoot: string): Promise<WorkflowOverview> {
  const [specs, explores, proposals, plans] = await Promise.all([
    listSpecs(repositoryRoot),
    listExplores(repositoryRoot),
    listArchitectureProposals(repositoryRoot),
    listPlans(repositoryRoot)
  ])
  const items: WorkflowItem[] = []
  for (const spec of specs) {
    const validation = await validateSpec(repositoryRoot, spec.id)
    const specExplores = explores.filter(item => item.specId === spec.id)
    const specProposals = proposals.filter(item => item.specId === spec.id)
    const specPlans = plans.filter(item => item.specId === spec.id)
    const phases = [
      brainstormPhase(specExplores),
      specPhase(spec, validation.valid ? [] : validation.errors),
      architectPhase(spec, specProposals, specPlans),
      planPhase(spec, specPlans),
      implementPhase(spec, specPlans),
      spec.status === 'verified' ? phase('verify', 'done', 'Marked verified') : notYet('verify'),
      notYet('review'),
      notYet('record')
    ]
    let total = 0
    let unmeasuredSessions = 0
    for (const plan of specPlans) {
      for (const run of await planStepSessions(repositoryRoot, plan)) {
        if (run.tokens) {
          total += run.tokens.total
        } else {
          unmeasuredSessions += 1
        }
      }
    }
    const lastActivity = [spec, ...specExplores, ...specProposals, ...specPlans]
      .map(item => item.updatedAt)
      .sort()
      .at(-1) as string
    items.push(
      Object.freeze({
        key: `spec:${spec.id}`,
        title: spec.title,
        specId: spec.id,
        lastActivity,
        currentPhase: currentPhaseOf(phases),
        phases: Object.freeze(phases),
        tokens: total > 0 || unmeasuredSessions > 0 ? { total, unmeasuredSessions } : undefined
      })
    )
  }
  for (const explore of explores) {
    if (!explore.specId && explore.status !== 'archived') {
      items.push(explorationItem(explore))
    }
  }
  items.sort((left, right) => right.lastActivity.localeCompare(left.lastActivity))
  return Object.freeze({ items: Object.freeze(items) })
}
