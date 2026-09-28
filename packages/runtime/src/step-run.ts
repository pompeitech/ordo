import { createHash } from 'node:crypto'
import path from 'node:path'
import {
  appendSessionEvent,
  type CatalogEntry,
  createSession,
  diffSnapshots,
  type FileChange,
  findRepositoryRoot,
  finishPlanStep,
  isOrdoError,
  loadCatalog,
  type PlanRecord,
  type PlanStep,
  type ProfileSessionSelection,
  projectProfileSha256,
  readProjectProfile,
  readSpec,
  readyPlanSteps,
  recordRunSnapshot,
  resolveProfileSessionSelection,
  type SpecRecord,
  snapshotProjectContext,
  startPlanStep,
  updateSessionStatus,
  validatePlan,
  validateProjectProfile,
  validateSpec,
  type WorkspaceSnapshot
} from '@pompeitech/ordo-core'
import {
  type AgentAdapterId,
  type AgentApprovalDecision,
  type AgentApprovalRequest,
  type AgentEvent,
  type AgentInstallation,
  createAgentAdapterRegistry
} from './agent-adapter.js'
import { claudeCodeAgentAdapter } from './claude-code.js'
import { codexAgentAdapter } from './codex-app-server.js'
import { checkAgentConnection } from './connection.js'
import { recordAgentUsage } from './usage.js'

export interface PlanStepRunOptions {
  readonly harness: AgentAdapterId
  readonly directory: string
  readonly specId: string
  readonly planId: string
  readonly stepId?: string
  readonly agentId?: string
  readonly skillIds?: readonly string[]
  readonly ruleIds?: readonly string[]
  /** The shared catalog the team profile refers to, resolved by the caller. */
  readonly contentRoot: string
  /** Extra instruction from the person starting the run. */
  readonly prompt?: string
  readonly command?: string
  /** Claude Code only: the user's API key, used when the CLI is not logged in. */
  readonly apiKey?: string
  /** Where observed plan usage is kept; defaults to the per-user Ordo state directory. */
  readonly usageStatePath?: string
  readonly now?: () => Date
}

/** A rough size of what Ordo sends to the agent, before the agent reads any code. */
export interface PromptEstimate {
  readonly characters: number
  /** Approximation at ~4 characters per token; the harness reports the real usage. */
  readonly estimatedTokens: number
  readonly parts: readonly { readonly name: string; readonly estimatedTokens: number }[]
}

export interface PreparedPlanStepRun {
  readonly repositoryRoot: string
  readonly adapterId: AgentAdapterId
  readonly installation: AgentInstallation
  readonly usesApiKey: boolean
  readonly spec: SpecRecord
  readonly plan: PlanRecord
  readonly step: PlanStep
  readonly profileSelection?: ProfileSessionSelection
  readonly contextSnapshotId: string
  readonly estimate: PromptEstimate
  /** Builds the final prompt once the session exists. */
  readonly buildPrompt: (sessionId: string) => string
  readonly manifestBase: Readonly<Record<string, unknown>>
}

export interface PlanStepRunHooks {
  readonly signal?: AbortSignal
  readonly onText?: (text: string) => void
  readonly onEvent?: (event: AgentEvent) => void | Promise<void>
  readonly onApprovalRequest?: (
    request: AgentApprovalRequest
  ) => AgentApprovalDecision | Promise<AgentApprovalDecision>
}

export interface PlanStepRunReport {
  readonly schemaVersion: 1
  readonly command: 'agent-claude' | 'agent-codex'
  readonly repositoryRoot: string
  readonly agent: AgentAdapterId
  readonly version: string
  readonly nativeSessionId?: string
  readonly capabilities: AgentInstallation['capabilities']
  readonly ordoSessionId: string
  readonly contextSnapshotId: string
  readonly specId: string
  readonly planId: string
  readonly planStepId: string
  readonly text: string
  readonly exitCode: number
  readonly reviewRequired: true
  /** Undefined when the repository is not a Git work tree and no diff exists. */
  readonly changedFiles?: readonly FileChange[]
}

const tokensOf = (text: string) => Math.ceil(text.length / 4)

function selectedCatalogInstructions(
  selection: ProfileSessionSelection | undefined,
  entries: readonly CatalogEntry[]
): string {
  if (!selection) {
    return ''
  }
  const implementationWorkflow = selection.workflows.find(entry => entry.id === 'implement')
  if (!implementationWorkflow) {
    throw new Error('The shared project profile must enable the implement workflow')
  }
  const selected = [
    ...(selection.agent ? [{ kind: 'agents' as const, ...selection.agent }] : []),
    ...selection.skills.map(entry => ({ kind: 'skills' as const, ...entry })),
    ...selection.rules.map(entry => ({ kind: 'rules' as const, ...entry })),
    { kind: 'workflows' as const, ...implementationWorkflow }
  ]
  const sections = selected.map(reference => {
    const entry = entries.find(
      candidate => candidate.kind === reference.kind && candidate.id === reference.id
    )
    if (!entry) {
      throw new Error(`Selected ${reference.kind} entry is missing: ${reference.id}`)
    }
    const digest = createHash('sha256').update(entry.content).digest('hex')
    if (digest !== reference.contentSha256) {
      throw new Error(
        `Selected ${reference.kind} entry changed since profile validation: ${reference.id}`
      )
    }
    return `## ${reference.kind.slice(0, -1)}: ${reference.id}\n\n${entry.content.trim()}`
  })
  return sections.length
    ? `## Profile-selected shared instructions\n\n${sections.join('\n\n---\n\n')}`
    : ''
}

/**
 * Checks every gate for running an approved plan step with an agent and builds what
 * will be sent, without starting anything: the caller can show the estimate first.
 */
export async function preparePlanStepRun(
  options: PlanStepRunOptions
): Promise<PreparedPlanStepRun> {
  const adapterId = options.harness
  const repositoryRoot = await findRepositoryRoot(path.resolve(options.directory))
  const specId = options.specId.trim()
  const planId = options.planId.trim()
  if (!specId || !planId) {
    throw new Error('Agent plan execution requires both an Ordo specification and plan')
  }
  const spec = await readSpec(repositoryRoot, specId)
  if (spec.status !== 'ready') {
    throw new Error(`Spec must be ready before agent execution: ${specId} (${spec.status})`)
  }
  const specValidation = await validateSpec(repositoryRoot, specId)
  if (!specValidation.valid) {
    throw new Error(`Spec is invalid: ${specValidation.errors.join('; ')}`)
  }
  const validation = await validatePlan(repositoryRoot, planId)
  if (!validation.valid || !validation.plan) {
    throw new Error(`Plan is invalid: ${validation.errors.join('; ')}`)
  }
  const plan = validation.plan
  if (plan.specId !== spec.id) {
    throw new Error(`Plan ${planId} is linked to spec ${plan.specId}, not ${spec.id}`)
  }
  const step = options.stepId
    ? readyPlanSteps(plan).find(candidate => candidate.id === options.stepId)
    : readyPlanSteps(plan)[0]
  if (!step) {
    throw new Error(
      options.stepId
        ? `Plan step is blocked or not pending: ${options.stepId}`
        : 'Plan has no ready step to execute'
    )
  }
  // The harness must be installed and logged in through its own CLI; Ordo never falls back.
  const connection = await checkAgentConnection(adapterId, {
    command: options.command,
    cwd: repositoryRoot,
    apiKey: options.apiKey
  })
  if (connection.status !== 'connected' || !connection.installation) {
    throw new Error(connection.message)
  }
  const installation = connection.installation

  let profileSelection: ProfileSessionSelection | undefined
  let catalogEntries: readonly CatalogEntry[] = []
  try {
    const profile = await readProjectProfile(repositoryRoot)
    const profileValidation = await validateProjectProfile(repositoryRoot, options.contentRoot)
    if (!profileValidation.valid || !profileValidation.profile) {
      throw new Error(`Project profile needs review: ${profileValidation.errors.join('; ')}`)
    }
    if (projectProfileSha256(profile) !== projectProfileSha256(profileValidation.profile)) {
      throw new Error('Project profile changed during validation; retry after review')
    }
    profileSelection = resolveProfileSessionSelection(
      profile,
      options.agentId,
      options.skillIds,
      options.ruleIds
    )
    catalogEntries = (await loadCatalog(options.contentRoot)).entries
  } catch (error) {
    if (isOrdoError(error) && error.code === 'PROFILE_NOT_FOUND') {
      throw new Error(
        'Initialize the shared project profile before running a plan step: ordo profile init'
      )
    }
    throw error
  }

  const contextSnapshot = await snapshotProjectContext(repositoryRoot)
  if (contextSnapshot.snapshot.blocks.length === 0) {
    throw new Error(
      'No shared project context is available; add business context with ordo context init/add before agent execution'
    )
  }
  const instructions = selectedCatalogInstructions(profileSelection, catalogEntries)
  const task = [
    '# Ordo task context',
    'Work only on the approved implementation step below. Do not redefine requirements or expand the task scope.',
    '{{session}}',
    `Specification: ${spec.id} — ${spec.title}`,
    `Specification objective: ${spec.objective}`,
    `Non-goals: ${spec.nonGoals || 'none specified'}`,
    `Actors: ${spec.actors || 'none specified'}`,
    `Requirements:\n${spec.requirements || 'none specified'}`,
    `Constraints:\n${spec.constraints || 'none specified'}`,
    `Acceptance criteria:\n${spec.acceptanceCriteria}`,
    `Risks:\n${spec.risks || 'none specified'}`,
    `Plan: ${plan.id} — ${plan.title}`,
    `Plan step: ${step.id} — ${step.description}`,
    `Expected output: ${step.expectedOutput}`,
    `Inputs: ${step.inputs.join('; ') || 'none specified'}`,
    `Areas: ${step.areas.join(', ') || 'not restricted by path metadata'}`,
    `Verification commands: ${step.verification.join('; ') || 'none specified'}`
  ].join('\n\n')
  const context = `Immutable Ordo business/project context snapshot ${contextSnapshot.snapshot.id} (SHA-256 ${contextSnapshot.snapshot.payloadSha256}):\n${contextSnapshot.payload || '(empty snapshot)'}`
  const extra = options.prompt ? `## Additional developer instruction\n${options.prompt}` : ''
  const buildPrompt = (sessionId: string) =>
    [task.replace('{{session}}', `Ordo session: ${sessionId}`), context, instructions, extra]
      .filter(Boolean)
      .join('\n\n')
  const preview = buildPrompt('00000000-0000-0000-0000-000000000000')
  const estimate: PromptEstimate = Object.freeze({
    characters: preview.length,
    estimatedTokens: tokensOf(preview),
    parts: Object.freeze(
      [
        { name: 'Specification and plan step', estimatedTokens: tokensOf(task) },
        { name: 'Project context', estimatedTokens: tokensOf(context) },
        { name: 'Profile instructions', estimatedTokens: tokensOf(instructions) },
        { name: 'Additional instruction', estimatedTokens: tokensOf(extra) }
      ].filter(part => part.estimatedTokens > 0)
    )
  })
  return Object.freeze({
    repositoryRoot,
    adapterId,
    installation,
    usesApiKey: connection.usesApiKey,
    spec,
    plan,
    step,
    profileSelection,
    contextSnapshotId: contextSnapshot.snapshot.id,
    estimate,
    buildPrompt,
    manifestBase: Object.freeze({
      agent: adapterId,
      detectedVersion: installation.version,
      capabilities: installation.capabilities,
      specId: spec.id,
      planId: plan.id,
      planStepId: step.id,
      contextSnapshotId: contextSnapshot.snapshot.id,
      contextPayloadSha256: contextSnapshot.snapshot.payloadSha256,
      profileSha256: profileSelection?.profileSha256,
      profileSelection,
      selectedWorkflowIds: ['implement']
    })
  })
}

/**
 * Runs a prepared step: session, workspace snapshots before and after for the code
 * review, the agent itself, and every event in the session log. The step ends paused
 * for human review; agent completion is never approval.
 */
export async function executePlanStepRun(
  prepared: PreparedPlanStepRun,
  options: Pick<PlanStepRunOptions, 'apiKey' | 'usageStatePath' | 'now'>,
  hooks: PlanStepRunHooks = {}
): Promise<PlanStepRunReport> {
  const { repositoryRoot, adapterId, installation, plan, step, spec } = prepared
  const adapter = createAgentAdapterRegistry([claudeCodeAgentAdapter, codexAgentAdapter]).get(
    adapterId
  )
  const now = options.now?.() ?? new Date()
  const session = await createSession(repositoryRoot, {
    title: `${plan.title}: ${step.id}`,
    profileSelection: prepared.profileSelection,
    contextSnapshotId: prepared.contextSnapshotId,
    branch: undefined,
    headCommit: undefined
  })
  try {
    await startPlanStep(repositoryRoot, plan.id, step.id, session.id)
  } catch (error) {
    await updateSessionStatus(repositoryRoot, session.id, 'error')
    throw error
  }
  const taskPrompt = prepared.buildPrompt(session.id)
  const manifest = Object.freeze({
    ...prepared.manifestBase,
    promptSha256: createHash('sha256').update(taskPrompt).digest('hex'),
    promptEstimatedTokens: prepared.estimate.estimatedTokens,
    startedAt: now.toISOString()
  })
  let before: WorkspaceSnapshot | undefined
  try {
    // What the working tree looked like before the agent touched it, for the code review.
    before = await recordRunSnapshot(repositoryRoot, session.id, 'before')
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'note',
      data: { type: 'task-manifest', ...manifest }
    })
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'message',
      data: { role: 'user', content: taskPrompt, promptSha256: manifest.promptSha256 }
    })
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'note',
      data: { type: 'harness', id: adapterId, version: installation.version }
    })
    const result = await adapter.run({
      command: installation.command,
      cwd: repositoryRoot,
      prompt: taskPrompt,
      apiKey: prepared.usesApiKey ? options.apiKey : undefined,
      signal: hooks.signal,
      onApprovalRequest: hooks.onApprovalRequest,
      async onEvent(event) {
        await hooks.onEvent?.(event)
        if (event.type === 'text-delta') {
          hooks.onText?.(event.text)
        } else if (event.type === 'usage-limits') {
          // Personal plan usage: machine-local state only, never the shared session log.
          await recordAgentUsage(event.usage, { filePath: options.usageStatePath }).catch(
            () => undefined
          )
        } else if (event.type === 'native-session') {
          await appendSessionEvent(repositoryRoot, session.id, {
            type: 'note',
            data: { type: 'native-session', id: event.nativeSessionId }
          })
        } else if (event.type === 'usage') {
          await appendSessionEvent(repositoryRoot, session.id, {
            type: 'usage',
            data: {
              inputTokens: event.inputTokens,
              outputTokens: event.outputTokens,
              totalTokens:
                event.inputTokens !== undefined && event.outputTokens !== undefined
                  ? event.inputTokens + event.outputTokens
                  : undefined
            }
          })
        } else if (event.type === 'approval-request') {
          const approval = event.input as {
            readonly kind: 'command-execution' | 'file-change' | 'permission-escalation'
            readonly summary: string
            readonly command?: string
            readonly cwd?: string
            readonly reason?: string
            readonly details: Readonly<Record<string, unknown>>
          }
          await appendSessionEvent(repositoryRoot, session.id, {
            type: 'approval',
            data: {
              provider: adapterId,
              status: 'requested',
              requestId: event.id,
              kind: approval.kind,
              summary: approval.summary,
              commandSha256: approval.command
                ? createHash('sha256').update(approval.command).digest('hex')
                : undefined,
              cwd: approval.cwd,
              requestedPermissions:
                approval.kind === 'permission-escalation' ? approval.details.permissions : undefined
            }
          })
        } else if (event.type === 'approval-decision') {
          await appendSessionEvent(repositoryRoot, session.id, {
            type: 'approval',
            data: {
              provider: adapterId,
              status: event.decision === 'accept' ? 'approved' : 'denied',
              requestId: event.id,
              decision: event.decision
            }
          })
        }
      }
    })
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'message',
      data: { role: 'assistant', content: result.text }
    })
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'note',
      data: { type: 'agent-capabilities', capabilities: installation.capabilities }
    })
    const afterRun = await recordRunSnapshot(repositoryRoot, session.id, 'after')
    const changedFiles =
      before && afterRun
        ? await diffSnapshots(repositoryRoot, before.tree, afterRun.tree)
        : undefined
    await updateSessionStatus(repositoryRoot, session.id, 'completed')
    await finishPlanStep(repositoryRoot, plan.id, step.id, 'paused', {
      actorType: 'system',
      reason: 'Agent run finished; waiting for human review'
    })
    return Object.freeze({
      schemaVersion: 1,
      command: adapterId === 'codex' ? 'agent-codex' : 'agent-claude',
      repositoryRoot,
      agent: adapterId,
      version: installation.version,
      nativeSessionId: result.nativeSessionId,
      capabilities: installation.capabilities,
      ordoSessionId: session.id,
      contextSnapshotId: prepared.contextSnapshotId,
      specId: spec.id,
      planId: plan.id,
      planStepId: step.id,
      text: result.text,
      exitCode: result.exitCode,
      reviewRequired: true,
      changedFiles
    })
  } catch (error) {
    const cancelled = hooks.signal?.aborted === true
    await appendSessionEvent(repositoryRoot, session.id, {
      type: 'status',
      data: {
        status: cancelled ? 'paused' : 'error',
        message: error instanceof Error ? error.message : String(error)
      }
    })
    if (before) {
      // Keep whatever the agent changed reviewable even when the run stopped early.
      await recordRunSnapshot(repositoryRoot, session.id, 'after').catch(() => undefined)
    }
    await updateSessionStatus(repositoryRoot, session.id, cancelled ? 'paused' : 'error')
    await finishPlanStep(repositoryRoot, plan.id, step.id, cancelled ? 'paused' : 'error', {
      actorType: 'system',
      reason: cancelled ? 'Agent run interrupted' : 'Agent run failed'
    })
    throw error
  }
}

/** Prepares and runs a plan step in one call (the CLI path). */
export async function runPlanStep(
  options: PlanStepRunOptions,
  hooks: PlanStepRunHooks = {}
): Promise<PlanStepRunReport> {
  return executePlanStepRun(await preparePlanStepRun(options), options, hooks)
}
