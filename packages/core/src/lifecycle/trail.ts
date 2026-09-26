import { listArchitectureProposals } from '../architectures/store.js'
import {
  type ActorType,
  type AuditArtifactKind,
  type AuditEvent,
  readAuditEvents
} from '../audit/store.js'
import { listExplores } from '../explore/store.js'
import type { ExploreRecord } from '../explore/types.js'
import { listPlans } from '../plans/store.js'
import { readSpec } from '../specs/store.js'
import { planStepSessions, type TokenUsage } from './sessions.js'
import { WORKFLOW_PHASES, type WorkflowPhase } from './status.js'

/**
 * Where a trail entry comes from, always an Ordo record: the append-only audit log,
 * an artifact's own fields (exact unless `approximate`), or an agent session.
 */
export type TrailSource = 'audit' | 'artifact' | 'session'

/**
 * `decision`: a person decided (chose, approved, reviewed); `agent`: a coding agent
 * worked; `system`: Ordo moved something automatically; `activity`: work was recorded.
 */
export type TrailCategory = 'decision' | 'agent' | 'system' | 'activity'

export interface TrailEntry {
  readonly at: string
  readonly phase: WorkflowPhase
  readonly category: TrailCategory
  readonly event: string
  readonly title: string
  readonly detail?: string
  readonly actor?: string
  readonly actorType?: ActorType
  readonly source: TrailSource
  /** The time is the artifact's last update, not the moment of the event. */
  readonly approximate?: boolean
  readonly artifact: { readonly kind: string; readonly id: string; readonly path?: string }
  readonly stepId?: string
  /** For a chosen alternative: the options considered and not chosen. */
  readonly rejected?: readonly {
    readonly id: string
    readonly title: string
    readonly tradeoffs: readonly string[]
  }[]
  /** Agent sessions only; undefined when the harness reported no usage. */
  readonly tokens?: TokenUsage
  /** The agent session that used the most tokens in this trail. */
  readonly mostExpensive?: boolean
  /** For a code review: files the agent changed that were kept and undone. */
  readonly files?: { readonly accepted: readonly string[]; readonly rejected: readonly string[] }
}

export interface DecisionTrail {
  readonly specId: string
  readonly title: string
  readonly entries: readonly TrailEntry[]
  readonly tokens: { readonly total: number; readonly unmeasuredSessions: number }
}

const PHASE_OF: Readonly<Record<AuditArtifactKind, WorkflowPhase>> = {
  explore: 'brainstorm',
  spec: 'spec',
  architecture: 'architect',
  plan: 'plan'
}

const PATH_OF: Readonly<Record<AuditArtifactKind, (id: string) => string>> = {
  explore: id => `.ordo/explore/${id}.json`,
  spec: id => `.ordo/specs/${id}.md`,
  architecture: id => `.ordo/architectures/${id}.json`,
  plan: id => `.ordo/plans/${id}.json`
}

const DECISION_ACTIONS: readonly AuditEvent['action'][] = [
  'alternative-selected',
  'status-changed',
  'approved',
  'reviewed'
]

const REVIEW_TITLES: Readonly<Record<string, string>> = {
  approved: 'approved',
  'changes-requested': 'changes requested',
  blocked: 'blocked'
}

function artifactOf(kind: AuditArtifactKind, id: string) {
  return { kind, id, path: PATH_OF[kind](id) }
}

function categoryOf(event: AuditEvent): TrailCategory {
  if (event.actorType === 'system') {
    return 'system'
  }
  if (event.actorType === 'agent') {
    return 'agent'
  }
  return DECISION_ACTIONS.includes(event.action) ? 'decision' : 'activity'
}

function auditTitle(event: AuditEvent): string {
  switch (event.action) {
    case 'created':
      return event.kind === 'explore'
        ? 'Exploration created'
        : event.kind === 'spec'
          ? 'Specification created'
          : event.kind === 'architecture'
            ? 'Architecture proposed'
            : 'Plan created'
    case 'status-changed':
      return `Specification ${event.from ?? '?'} → ${event.to ?? '?'}`
    case 'alternative-selected':
      return 'Alternative chosen'
    case 'crystallized':
      return 'Turned into a specification'
    case 'approved':
      return 'Architecture approved'
    case 'step-started':
      return `Agent run started for "${event.stepId}"`
    case 'step-finished':
      return event.to === 'paused'
        ? `"${event.stepId}" waiting for review`
        : `"${event.stepId}" ${event.to ?? 'finished'}`
    case 'reviewed':
      return `Review of "${event.stepId}": ${REVIEW_TITLES[event.to ?? ''] ?? event.to}`
  }
}

function auditEntry(event: AuditEvent): TrailEntry {
  const stepEvent =
    event.action === 'step-started' ||
    event.action === 'step-finished' ||
    event.action === 'reviewed'
  return {
    at: event.at,
    phase: stepEvent ? 'implement' : PHASE_OF[event.kind],
    category: categoryOf(event),
    event: `${event.kind}-${event.action}`,
    title: auditTitle(event),
    detail: event.reason,
    actor: event.actor,
    actorType: event.actorType,
    source: 'audit',
    artifact: artifactOf(event.kind, event.artifactId),
    stepId: event.stepId,
    files: event.files
  }
}

function explorationEntries(explore: ExploreRecord, audit: readonly AuditEvent[]): TrailEntry[] {
  const artifact = artifactOf('explore', explore.id)
  const selection = audit.find(event => event.action === 'alternative-selected')
  const entries: TrailEntry[] = audit
    .filter(event => event.action !== 'alternative-selected')
    .map(auditEntry)
  if (!audit.some(event => event.action === 'created')) {
    entries.push({
      at: explore.createdAt,
      phase: 'brainstorm',
      category: 'activity',
      event: 'explore-created',
      title: 'Exploration created',
      detail: explore.problem,
      source: 'artifact',
      artifact
    })
  }
  for (const alternative of explore.alternatives) {
    entries.push({
      at: alternative.createdAt,
      phase: 'brainstorm',
      category: 'activity',
      event: 'alternative-proposed',
      title: `Alternative proposed: ${alternative.title}`,
      detail: alternative.summary,
      source: 'artifact',
      artifact
    })
  }
  const selected = explore.alternatives.find(item => item.id === explore.selectedAlternativeId)
  if (selected) {
    entries.push({
      at: selection?.at ?? explore.updatedAt,
      phase: 'brainstorm',
      category: selection ? categoryOf(selection) : 'decision',
      event: 'alternative-selected',
      title: `Chosen: ${selected.title}`,
      detail: selected.summary,
      actor: selection?.actor,
      actorType: selection?.actorType,
      source: selection ? 'audit' : 'artifact',
      approximate: selection ? undefined : true,
      artifact,
      rejected: explore.alternatives
        .filter(item => item.id !== selected.id)
        .map(item => ({ id: item.id, title: item.title, tradeoffs: item.tradeoffs }))
    })
  }
  return entries
}

/**
 * The path one requirement followed through the Ordo workflow, oldest first. Every
 * entry says who acted (person, agent or Ordo) and where the record comes from.
 * Missing history is left out, never invented; Git history is not used.
 */
export async function workflowTrail(
  repositoryRoot: string,
  specId: string
): Promise<DecisionTrail> {
  const spec = await readSpec(repositoryRoot, specId)
  const [explores, proposals, plans] = await Promise.all([
    listExplores(repositoryRoot),
    listArchitectureProposals(repositoryRoot),
    listPlans(repositoryRoot)
  ])
  const entries: TrailEntry[] = []

  for (const explore of explores.filter(item => item.specId === specId)) {
    entries.push(
      ...explorationEntries(explore, await readAuditEvents(repositoryRoot, 'explore', explore.id))
    )
  }

  const specAudit = await readAuditEvents(repositoryRoot, 'spec', spec.id)
  entries.push(...specAudit.map(auditEntry))
  if (!specAudit.some(event => event.action === 'created')) {
    entries.push({
      at: spec.createdAt,
      phase: 'spec',
      category: 'activity',
      event: 'spec-created',
      title: 'Specification created',
      detail: spec.objective,
      source: 'artifact',
      artifact: artifactOf('spec', spec.id)
    })
  }
  if (spec.status !== 'draft' && !specAudit.some(event => event.action === 'status-changed')) {
    entries.push({
      at: spec.updatedAt,
      phase: 'spec',
      category: 'decision',
      event: 'spec-status',
      title: `Specification is ${spec.status}`,
      source: 'artifact',
      approximate: true,
      artifact: artifactOf('spec', spec.id)
    })
  }

  for (const proposal of proposals.filter(item => item.specId === specId)) {
    const audit = await readAuditEvents(repositoryRoot, 'architecture', proposal.id)
    const artifact = artifactOf('architecture', proposal.id)
    const decisions = proposal.decisions.length
      ? `Decisions: ${proposal.decisions.join('; ')}`
      : undefined
    entries.push(
      ...audit.map(event => ({ ...auditEntry(event), detail: event.reason ?? decisions }))
    )
    if (!audit.some(event => event.action === 'created')) {
      entries.push({
        at: proposal.createdAt,
        phase: 'architect',
        category: 'activity',
        event: 'architecture-created',
        title: `Architecture proposed: ${proposal.title}`,
        detail: decisions,
        source: 'artifact',
        artifact
      })
    }
    if (proposal.approvedAt && !audit.some(event => event.action === 'approved')) {
      entries.push({
        at: proposal.approvedAt,
        phase: 'architect',
        category: 'decision',
        event: 'architecture-approved',
        title: `Architecture approved: ${proposal.title}`,
        detail: decisions,
        source: 'artifact',
        artifact
      })
    }
  }

  let unmeasuredSessions = 0
  let totalTokens = 0
  for (const plan of plans.filter(item => item.specId === specId)) {
    const audit = await readAuditEvents(repositoryRoot, 'plan', plan.id)
    const artifact = artifactOf('plan', plan.id)
    entries.push(...audit.map(auditEntry))
    if (!audit.some(event => event.action === 'created')) {
      entries.push({
        at: plan.createdAt,
        phase: 'plan',
        category: 'activity',
        event: 'plan-created',
        title: `Plan created: ${plan.title}`,
        detail: `${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}`,
        source: 'artifact',
        artifact
      })
    }
    for (const step of plan.steps) {
      const stepAudit = audit.filter(event => event.stepId === step.id)
      if (
        step.completedAt &&
        !stepAudit.some(event => event.action === 'reviewed' || event.action === 'step-finished')
      ) {
        entries.push({
          at: step.completedAt,
          phase: 'implement',
          category: 'activity',
          event: 'plan-step-finished',
          title: `"${step.id}" ${step.status}`,
          source: 'artifact',
          artifact,
          stepId: step.id
        })
      }
    }
    const startedAt = new Map(
      audit
        .filter(event => event.action === 'step-started' && event.ref?.kind === 'session')
        .map(event => [event.ref?.id, event.at])
    )
    for (const run of await planStepSessions(repositoryRoot, plan)) {
      const harness = run.detail.events.find(event => event.data.type === 'harness')?.data
      const agent = typeof harness?.id === 'string' ? harness.id : 'agent'
      const version = typeof harness?.version === 'string' ? ` ${harness.version}` : ''
      const approvals = run.detail.events.filter(
        event => event.type === 'approval' && event.data.status !== 'requested'
      )
      const approved = approvals.filter(event => event.data.status === 'approved').length
      if (run.tokens) {
        totalTokens += run.tokens.total
      } else {
        unmeasuredSessions += 1
      }
      entries.push({
        // The session is created just before its step starts; show it when the run began.
        at: startedAt.get(run.detail.session.id) ?? run.detail.session.createdAt,
        phase: 'implement',
        category: 'agent',
        event: 'agent-session',
        title: `${agent}${version} worked on "${run.stepId}"`,
        detail: `${run.detail.session.status} · ${approvals.length} tool approval${approvals.length === 1 ? '' : 's'} (${approved} granted)`,
        actor: agent,
        actorType: 'agent',
        source: 'session',
        artifact: { kind: 'session', id: run.detail.session.id },
        stepId: run.stepId,
        tokens: run.tokens
      })
    }
  }

  const sessions = entries.filter(entry => entry.tokens && entry.tokens.total > 0)
  const top = sessions.reduce<TrailEntry | undefined>(
    (best, entry) =>
      !best || (entry.tokens?.total ?? 0) > (best.tokens?.total ?? 0) ? entry : best,
    undefined
  )
  const order = (phase: WorkflowPhase) => WORKFLOW_PHASES.indexOf(phase)
  const sorted = entries
    .map(entry => (entry === top ? { ...entry, mostExpensive: true } : entry))
    .sort(
      (left, right) =>
        new Date(left.at).getTime() - new Date(right.at).getTime() ||
        order(left.phase) - order(right.phase)
    )
  return Object.freeze({
    specId,
    title: spec.title,
    entries: Object.freeze(sorted.map(entry => Object.freeze(entry))),
    tokens: Object.freeze({ total: totalTokens, unmeasuredSessions })
  })
}
