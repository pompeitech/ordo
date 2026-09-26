import {
  type CreatePlanOptions,
  createPlan,
  findRepositoryRoot,
  finishPlanStep,
  listPlans,
  type PlanRecord,
  type PlanStepInput,
  type PlanStepStatus,
  type PlanValidationReport,
  previewPlanCreation,
  readPlan,
  readyPlanSteps,
  reviewAgentStep,
  type StepChanges,
  type StepReviewDecision,
  snapshotDiffText,
  startPlanStep,
  stepChanges,
  validatePlan
} from '@pompeitech/ordo-core'

export type PlanAction =
  | 'create'
  | 'list'
  | 'show'
  | 'validate'
  | 'run'
  | 'finish'
  | 'review'
  | 'changes'

export interface ManagePlanOptions {
  readonly directory: string
  readonly action: PlanAction
  readonly id?: string
  readonly title?: string
  readonly specId?: string
  readonly steps?: readonly PlanStepInput[]
  readonly stepId?: string
  readonly sessionId?: string
  readonly status?: Extract<
    PlanStepStatus,
    'completed' | 'error' | 'paused' | 'cancelled' | 'skipped'
  >
  readonly decision?: StepReviewDecision
  readonly note?: string
  readonly rejectFiles?: readonly string[]
  readonly rejectAll?: boolean
  readonly diff?: boolean
  readonly dryRun?: boolean
}

export type PlanCommandReport =
  | { readonly kind: 'plan'; readonly action: 'list'; readonly plans: readonly PlanRecord[] }
  | {
      readonly kind: 'plan'
      readonly action: 'create' | 'show' | 'run' | 'finish' | 'review'
      readonly dryRun: boolean
      readonly plan: PlanRecord
      readonly selectedStepId?: string
    }
  | {
      readonly kind: 'plan'
      readonly action: 'validate'
      readonly validation: PlanValidationReport
    }
  | {
      readonly kind: 'plan'
      readonly action: 'changes'
      readonly planId: string
      readonly stepId: string
      readonly changes: StepChanges
      readonly diff?: string
    }

export async function managePlan(options: ManagePlanOptions): Promise<PlanCommandReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.action === 'list') {
    return { kind: 'plan', action: 'list', plans: await listPlans(repositoryRoot) }
  }
  if (options.action === 'show') {
    return {
      kind: 'plan',
      action: 'show',
      dryRun: false,
      plan: await readPlan(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'validate') {
    return {
      kind: 'plan',
      action: 'validate',
      validation: await validatePlan(repositoryRoot, options.id ?? '')
    }
  }
  if (options.action === 'create') {
    const input: CreatePlanOptions = {
      title: options.title ?? '',
      specId: options.specId ?? '',
      id: options.id,
      steps: options.steps ?? []
    }
    return {
      kind: 'plan',
      action: 'create',
      dryRun: options.dryRun ?? false,
      plan: options.dryRun
        ? await previewPlanCreation(repositoryRoot, input)
        : await createPlan(repositoryRoot, input)
    }
  }
  if (options.action === 'run') {
    if (options.dryRun) {
      const plan = await readPlan(repositoryRoot, options.id ?? '')
      const selected = options.stepId
        ? readyPlanSteps(plan).find(step => step.id === options.stepId)
        : readyPlanSteps(plan)[0]
      if (!selected) {
        throw new Error('No requested plan step is ready')
      }
      return {
        kind: 'plan',
        action: 'run',
        dryRun: true,
        plan,
        selectedStepId: selected.id
      }
    }
    const plan = await startPlanStep(
      repositoryRoot,
      options.id ?? '',
      options.stepId,
      options.sessionId
    )
    return {
      kind: 'plan',
      action: 'run',
      dryRun: false,
      plan,
      selectedStepId: plan.steps.find(step => step.status === 'running')?.id
    }
  }
  if (options.action === 'changes') {
    const planId = options.id ?? ''
    const stepId = options.stepId ?? ''
    const changes = await stepChanges(
      repositoryRoot,
      await readPlan(repositoryRoot, planId),
      stepId
    )
    const diff =
      options.diff && changes.before && changes.after
        ? await snapshotDiffText(repositoryRoot, changes.before, changes.after)
        : undefined
    return { kind: 'plan', action: 'changes', planId, stepId, changes, diff }
  }
  if (options.action === 'review') {
    const planId = options.id ?? ''
    const stepId = options.stepId ?? ''
    const rejectFiles = options.rejectAll
      ? (
          await stepChanges(repositoryRoot, await readPlan(repositoryRoot, planId), stepId)
        ).files.map(file => file.path)
      : options.rejectFiles
    return {
      kind: 'plan',
      action: 'review',
      dryRun: false,
      plan: await reviewAgentStep(repositoryRoot, planId, stepId, options.decision ?? 'approved', {
        note: options.note,
        rejectFiles
      }),
      selectedStepId: stepId
    }
  }
  const plan = options.dryRun
    ? await readPlan(repositoryRoot, options.id ?? '')
    : await finishPlanStep(
        repositoryRoot,
        options.id ?? '',
        options.stepId ?? '',
        options.status ?? 'completed'
      )
  return {
    kind: 'plan',
    action: 'finish',
    dryRun: options.dryRun ?? false,
    plan,
    selectedStepId: options.stepId
  }
}
