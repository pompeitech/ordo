import { OrdoError } from '../errors/ordo-error.js'
import {
  assertStepReviewable,
  readPlan,
  reviewPlanStep,
  type StepReviewDecision,
  type StepReviewOptions
} from '../plans/store.js'
import type { PlanRecord } from '../plans/types.js'
import { appendSessionEvent, readSession } from '../sessions/store.js'
import {
  canSnapshotWorkspace,
  diffSnapshots,
  type FileChange,
  rejectSnapshotChanges,
  snapshotWorkspace,
  type WorkspaceSnapshot
} from './snapshot.js'

const SNAPSHOT_NOTE = 'workspace-snapshot'

export type SnapshotMoment = 'before' | 'after'

/**
 * Snapshots the working tree around an agent run and notes it in the session.
 * Returns undefined outside a Git work tree: the run still happens, without a diff.
 */
export async function recordRunSnapshot(
  repositoryRoot: string,
  sessionId: string,
  moment: SnapshotMoment
): Promise<WorkspaceSnapshot | undefined> {
  if (!(await canSnapshotWorkspace(repositoryRoot))) {
    return undefined
  }
  const snapshot = await snapshotWorkspace(repositoryRoot, `${sessionId}-${moment}`)
  await appendSessionEvent(repositoryRoot, sessionId, {
    type: 'note',
    data: { type: SNAPSHOT_NOTE, moment, tree: snapshot.tree, ref: snapshot.ref }
  })
  return snapshot
}

export interface StepChanges {
  readonly available: boolean
  /** Why no diff exists, e.g. the run happened outside Git or before snapshots existed. */
  readonly reason?: string
  readonly sessionId?: string
  readonly before?: string
  readonly after?: string
  readonly files: readonly FileChange[]
}

/** The files the latest agent run of a step changed, from its before/after snapshots. */
export async function stepChanges(
  repositoryRoot: string,
  plan: PlanRecord,
  stepId: string
): Promise<StepChanges> {
  const step = plan.steps.find(candidate => candidate.id === stepId)
  if (!step?.sessionId) {
    return { available: false, reason: 'No agent run is linked to this step', files: [] }
  }
  const detail = await readSession(repositoryRoot, step.sessionId).catch(() => undefined)
  const snapshot = (moment: SnapshotMoment) =>
    detail?.events.find(event => event.data.type === SNAPSHOT_NOTE && event.data.moment === moment)
      ?.data.tree
  const before = snapshot('before')
  const after = snapshot('after')
  if (typeof before !== 'string' || typeof after !== 'string') {
    return {
      available: false,
      reason:
        'This run has no workspace snapshots (outside Git, or recorded before Ordo took them)',
      sessionId: step.sessionId,
      files: []
    }
  }
  return {
    available: true,
    sessionId: step.sessionId,
    before,
    after,
    files: await diffSnapshots(repositoryRoot, before, after)
  }
}

export interface AgentStepReviewOptions extends Omit<StepReviewOptions, 'files'> {
  /** Changed files to undo, restoring the version from before the agent run. */
  readonly rejectFiles?: readonly string[]
}

/**
 * A person's code review of an agent step: undo the rejected files, then record the
 * decision with the accepted and rejected files. If any rejected file was edited after
 * the agent finished, nothing is undone and nothing is recorded.
 */
export async function reviewAgentStep(
  repositoryRoot: string,
  planId: string,
  stepId: string,
  decision: StepReviewDecision,
  options: AgentStepReviewOptions = {}
): Promise<PlanRecord> {
  const plan = await readPlan(repositoryRoot, planId)
  assertStepReviewable(plan, stepId, decision, options)
  const changes = await stepChanges(repositoryRoot, plan, stepId)
  let rejected: readonly string[] = []
  if (options.rejectFiles && options.rejectFiles.length > 0) {
    if (!changes.available || !changes.before || !changes.after) {
      throw new OrdoError(
        'WORKSPACE_SNAPSHOT_FAILED',
        `Cannot undo files for this step: ${changes.reason ?? 'no snapshots'}`
      )
    }
    const result = await rejectSnapshotChanges(
      repositoryRoot,
      changes.before,
      changes.after,
      options.rejectFiles
    )
    if (result.conflicts.length > 0) {
      throw new OrdoError(
        'WORKSPACE_SNAPSHOT_FAILED',
        `Edited after the agent finished, nothing was undone: ${result.conflicts.join(', ')}`,
        { details: { conflicts: result.conflicts } }
      )
    }
    rejected = result.restored
  }
  return reviewPlanStep(repositoryRoot, planId, stepId, decision, {
    note: options.note,
    actorType: options.actorType,
    files: changes.available
      ? {
          accepted: changes.files.map(file => file.path).filter(file => !rejected.includes(file)),
          rejected
        }
      : undefined
  })
}
