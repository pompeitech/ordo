import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import {
  approveArchitectureProposal,
  createPlan,
  createSpec,
  findRepositoryRoot,
  initializeProjectContext,
  initializeProjectProfile,
  inspectProjectContext,
  isOrdoError,
  listArchitectureProposals,
  listExplores,
  listPlans,
  listSessions,
  listSpecs,
  loadCatalog,
  type ProfileSessionSelection,
  type ProfileSuggestion,
  type ProjectProfile,
  readPlan,
  readProjectProfile,
  reviewAgentStep,
  type StepReviewDecision,
  stepChanges,
  suggestProfileEntries,
  updateProjectProfileEntry,
  updateSpecStatus,
  validateProjectProfile,
  workflowStatus,
  workflowTrail
} from '@pompeitech/ordo-core'
import {
  type AgentAdapterId,
  type AgentApprovalDecision,
  type AgentApprovalRequest,
  type AgentUsage,
  type ChatThread,
  chatHandoff,
  checkAgentConnection,
  deleteChat,
  executePlanStepRun,
  listChats,
  loginCodexWithApiKey,
  type PlanStepRunOptions,
  preparePlanStepRun,
  readChat,
  readCodexUsage,
  readRecordedUsage,
  sendChatMessage
} from '@pompeitech/ordo-runtime'
import * as vscode from 'vscode'
import { openAgentDiff } from './code-review.js'
import {
  CLAUDE_API_KEY_SECRET,
  type ConnectionView,
  findHarness,
  HARNESSES,
  type HarnessDefinition,
  resolveExecutableSetting,
  toConnectionView,
  toUsageView,
  type UsageView
} from './connections.js'
import { buildImplementationPlanOptions } from './plan-input.js'
import {
  buildProfileView,
  type ProfileChange,
  parseProfileChange,
  resolveProfileContentRoot,
  summarizeProfile
} from './profile-model.js'
import { describeEstimate, runHarnesses } from './run-model.js'
import type {
  ChatView,
  HostMessage,
  RunSelection,
  TeamProfileState,
  WebviewMessage,
  WorkspaceSnapshot
} from './types.js'

export async function getWorkspaceRoot(): Promise<string> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    throw new Error('Open a project folder to use Ordo.')
  }
  return findRepositoryRoot(folder.uri.fsPath)
}

/** Reads the shared team profile, treating a missing file as "not set up yet". */
export async function readProfileIfPresent(
  repositoryRoot: string
): Promise<ProjectProfile | undefined> {
  try {
    return await readProjectProfile(repositoryRoot)
  } catch (error) {
    if (isOrdoError(error) && error.code === 'PROFILE_NOT_FOUND') {
      return undefined
    }
    throw error
  }
}

async function readProfileState(repositoryRoot: string): Promise<TeamProfileState> {
  try {
    const profile = await readProfileIfPresent(repositoryRoot)
    return profile ? { state: 'ok', summary: summarizeProfile(profile) } : { state: 'missing' }
  } catch (error) {
    return { state: 'invalid', message: messageOf(error) }
  }
}

async function readWorkspaceSnapshot(repositoryRoot: string): Promise<WorkspaceSnapshot> {
  const [context, specs, explorations, architectures, plans, sessions, profile] = await Promise.all(
    [
      inspectProjectContext(repositoryRoot),
      listSpecs(repositoryRoot),
      listExplores(repositoryRoot),
      listArchitectureProposals(repositoryRoot),
      listPlans(repositoryRoot),
      listSessions(repositoryRoot),
      readProfileState(repositoryRoot)
    ]
  )
  return {
    repositoryName: path.basename(repositoryRoot),
    repositoryRoot,
    context,
    specs,
    explorations,
    architectures,
    plans,
    sessions,
    profile
  }
}

/**
 * Everything the Ordo page can do, independent of where it is rendered. Results are
 * delivered through `attach`ed sinks; with no page open the workspace stays silent.
 */
export class OrdoWorkspace {
  private root?: string
  private connectionCheck = 0
  private usageCheck = 0
  private lastConnections: readonly ConnectionView[] = []
  private activeRun?: AbortController
  private activeChat?: { readonly controller: AbortController; chatId?: string }
  private readonly pendingApprovals = new Map<string, (decision: AgentApprovalDecision) => void>()
  private savingProfile = false
  private sink?: (message: HostMessage) => void

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly secrets: vscode.SecretStorage,
    private readonly bundledContentRoot: string
  ) {}

  attach(sink: ((message: HostMessage) => void) | undefined): void {
    this.sink = sink
    if (!sink) {
      // Nobody can answer a permission request without the page: decline, never guess.
      this.declinePendingApprovals()
    }
  }

  async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          await Promise.all([
            this.refresh(),
            this.refreshConnections().then(() =>
              Promise.all([this.refreshUsage(), this.refreshChats()])
            ),
            this.refreshProfile(),
            this.refreshWorkflow()
          ])
          break
        case 'checkConnections':
          await this.refreshConnections()
          await Promise.all([this.refreshUsage(), this.refreshChats()])
          break
        case 'loadChats':
          await this.refreshChats()
          break
        case 'openChat':
          if (typeof message.id === 'string') {
            await this.openChat(message.id)
          }
          break
        case 'deleteChat':
          if (typeof message.id === 'string') {
            await this.removeChat(message.id)
          }
          break
        case 'sendChat': {
          const harness = findHarness(message.harness)?.id
          const chatId = typeof message.chatId === 'string' ? message.chatId : undefined
          if (harness && typeof message.text === 'string') {
            await this.sendChat(chatId, harness, message.text)
          }
          break
        }
        case 'stopChat':
          this.activeChat?.controller.abort()
          break
        case 'setExecutablePath':
          await this.setExecutablePath(message.id)
          break
        case 'setApiKey':
          await this.setApiKey(message.id)
          break
        case 'clearApiKey':
          await this.clearApiKey(message.id)
          break
        case 'initializeContext':
          await this.initializeContext()
          break
        case 'createRequirement':
          await this.createRequirement()
          break
        case 'createPlan':
          await this.createImplementationPlan()
          break
        case 'openFile':
          await this.openFile(message.path)
          break
        case 'createProfile':
          await this.createProfile()
          break
        case 'saveProfile':
          await this.saveProfile(message.changes)
          break
        case 'openCatalogEntry':
          await this.openCatalogEntry(message.kind, message.id)
          break
        case 'loadWorkflow':
          await this.refreshWorkflow()
          break
        case 'loadTrail':
          await this.loadTrail(message.specId)
          break
        case 'workflowAction':
          await this.runWorkflowAction(message)
          break
        case 'openReview': {
          const ids = stepIds(message)
          if (ids) {
            await this.openReviewPanel(ids.planId, ids.stepId, ids.specId)
          }
          break
        }
        case 'openDiff': {
          const ids = stepIds(message)
          if (ids && typeof message.path === 'string') {
            await this.openReviewDiff(ids.planId, ids.stepId, message.path)
          }
          break
        }
        case 'submitReview': {
          const ids = stepIds(message)
          const decision = REVIEW_DECISIONS.find(value => value === message.decision)
          const rejectFiles = Array.isArray(message.rejectFiles)
            ? message.rejectFiles.filter((file): file is string => typeof file === 'string')
            : []
          if (ids && decision) {
            const note =
              typeof message.note === 'string' ? message.note.trim() || undefined : undefined
            await this.submitReview(ids.planId, ids.stepId, ids.specId, decision, note, rejectFiles)
          }
          break
        }
        case 'openRun': {
          const ids = stepIds(message)
          if (ids) {
            await this.openRunPanel(ids.planId, ids.stepId, ids.specId)
          }
          break
        }
        case 'prepareRun':
        case 'startRun': {
          const ids = stepIds(message)
          const harness = findHarness(message.harness)?.id
          if (!ids || !harness) {
            break
          }
          if (message.type === 'prepareRun') {
            await this.previewRun(harness, ids.specId, ids.planId, ids.stepId)
          } else {
            const prompt =
              typeof message.prompt === 'string' ? message.prompt.slice(0, 4000) : undefined
            await this.startRun(harness, ids.specId, ids.planId, ids.stepId, prompt)
          }
          break
        }
        case 'stopRun':
          this.activeRun?.abort()
          this.declinePendingApprovals()
          break
        case 'approvalDecision': {
          const id = typeof message.id === 'string' ? message.id : undefined
          const resolve = id ? this.pendingApprovals.get(id) : undefined
          if (id && resolve) {
            this.pendingApprovals.delete(id)
            resolve(message.decision === 'accept' ? 'accept' : 'decline')
          }
          break
        }
      }
    } catch (error) {
      const text = messageOf(error)
      this.log.error(`Command ${message.type} failed: ${text}`)
      const profileCommand = message.type === 'createProfile' || message.type === 'saveProfile'
      this.post(
        profileCommand ? { type: 'profileError', message: text } : { type: 'error', message: text }
      )
      if (!profileCommand) {
        await vscode.window.showErrorMessage(`Ordo: ${text}`)
      }
    }
  }

  async refresh(): Promise<void> {
    try {
      this.root = await getWorkspaceRoot()
      const snapshot = await readWorkspaceSnapshot(this.root)
      this.post({ type: 'snapshot', snapshot })
      this.log.info(`Project snapshot loaded: ${describeSnapshot(snapshot)}`)
    } catch (error) {
      this.post({ type: 'error', message: messageOf(error) })
      this.log.error(`Unable to load project snapshot: ${messageOf(error)}`)
    }
  }

  async refreshConnections(): Promise<void> {
    const check = ++this.connectionCheck
    const config = vscode.workspace.getConfiguration('ordo')
    const cwd = this.connectionCwd()
    const claudeApiKey = await this.secrets.get(CLAUDE_API_KEY_SECRET)
    const connections = await Promise.all(
      HARNESSES.map(async (harness): Promise<ConnectionView> => {
        const configuredPath = config.get<string>(harness.pathSetting, '').trim()
        const hasStoredApiKey = harness.id === 'claude-code' && Boolean(claudeApiKey)
        const resolved = resolveExecutableSetting(configuredPath)
        if (resolved.error) {
          return {
            id: harness.id,
            name: harness.name,
            status: 'not-found',
            command: configuredPath,
            configuredPath,
            message: resolved.error,
            apiKeyProvider: harness.apiKeyProvider,
            apiKeyStorage: harness.apiKeyStorage,
            hasStoredApiKey,
            billing: 'unknown'
          }
        }
        const connection = await checkAgentConnection(harness.id, {
          command: resolved.command,
          cwd,
          apiKey: harness.id === 'claude-code' ? claudeApiKey : undefined
        })
        return toConnectionView(harness, configuredPath, connection, hasStoredApiKey)
      })
    )
    if (check !== this.connectionCheck) {
      return
    }
    this.lastConnections = connections
    this.post({ type: 'connections', connections })
    this.log.info(
      `AI connections checked: ${connections
        .map(connection => `${connection.id}=${connection.status}`)
        .join(' ')}`
    )
  }

  /**
   * Plan usage per agent: Codex is read live from its app-server; Claude Code only
   * reports it during runs, so the last value observed on this machine is shown.
   */
  async refreshUsage(): Promise<void> {
    const check = ++this.usageCheck
    const config = vscode.workspace.getConfiguration('ordo')
    const usage = await Promise.all(
      HARNESSES.map(async (harness): Promise<UsageView> => {
        const connection = this.lastConnections.find(candidate => candidate.id === harness.id)
        const billing = connection?.billing ?? 'unknown'
        let observed: AgentUsage | undefined
        if (harness.id === 'codex' && connection?.status === 'connected' && billing !== 'api-key') {
          const resolved = resolveExecutableSetting(config.get<string>(harness.pathSetting, ''))
          if (!resolved.error) {
            observed = await readCodexUsage({
              command: resolved.command,
              cwd: this.connectionCwd()
            })
          }
        }
        observed ??= await readRecordedUsage(harness.id).catch(() => undefined)
        return toUsageView(harness, billing, observed)
      })
    )
    if (check === this.usageCheck) {
      this.post({ type: 'usage', usage })
    }
  }

  async refreshProfile(): Promise<void> {
    try {
      const root = await getWorkspaceRoot()
      const content = await resolveProfileContentRoot(root, this.bundledContentRoot)
      const catalog = await loadCatalog(content.root)
      const profile = await readProfileIfPresent(root)
      const errors = profile ? (await validateProjectProfile(root, content.root)).errors : []
      const suggestions: readonly ProfileSuggestion[] = await suggestProfileEntries(
        root,
        catalog.entries,
        profile
      ).catch(() => [])
      this.post({
        type: 'profile',
        view: buildProfileView(catalog.entries, profile, errors, content, suggestions)
      })
    } catch (error) {
      this.post({ type: 'profileError', message: messageOf(error) })
    }
  }

  async setExecutablePath(id?: AgentAdapterId): Promise<void> {
    const harness = await this.pickHarness(id, 'Choose the agent executable to configure')
    if (!harness) {
      return
    }
    const config = vscode.workspace.getConfiguration('ordo')
    const value = await vscode.window.showInputBox({
      title: `${harness.name} executable`,
      prompt: 'Absolute path to the executable. Leave empty to detect the installed CLI from PATH.',
      value: config.get<string>(harness.pathSetting, ''),
      validateInput: candidate => resolveExecutableSetting(candidate).error
    })
    if (value === undefined) {
      return
    }
    await config.update(harness.pathSetting, value.trim(), vscode.ConfigurationTarget.Global)
  }

  async setApiKey(id?: AgentAdapterId): Promise<void> {
    const harness = await this.pickHarness(id, 'Choose the agent that should use your API key')
    if (!harness) {
      return
    }
    const key = await vscode.window.showInputBox({
      title: `${harness.apiKeyProvider} API key for ${harness.name}`,
      prompt:
        harness.apiKeyStorage === 'ordo-keychain'
          ? 'Used only when Claude Code is not logged in. Stored in the system keychain and billed to the owner of this key.'
          : 'Handed once to the official `codex login --with-api-key`. Codex stores it; Ordo keeps no copy.',
      password: true,
      ignoreFocusOut: true,
      validateInput: candidate => (candidate.trim() ? undefined : 'API key cannot be empty.')
    })
    if (!key?.trim()) {
      return
    }
    if (harness.apiKeyStorage === 'ordo-keychain') {
      await this.secrets.store(CLAUDE_API_KEY_SECRET, key.trim())
      this.log.info('Anthropic API key for Claude Code stored in the system keychain')
      return
    }
    const resolved = resolveExecutableSetting(
      vscode.workspace.getConfiguration('ordo').get<string>(harness.pathSetting, '')
    )
    if (resolved.error) {
      throw new Error(resolved.error)
    }
    await loginCodexWithApiKey({
      command: resolved.command,
      cwd: this.connectionCwd(),
      apiKey: key
    })
    this.log.info('Codex logged in with an API key; the key is stored by Codex, not Ordo')
    await this.refreshConnections()
  }

  async clearApiKey(id?: AgentAdapterId): Promise<void> {
    const harness = id ? findHarness(id) : HARNESSES[0]
    if (!harness) {
      return
    }
    if (harness.apiKeyStorage === 'harness') {
      await vscode.window.showInformationMessage(
        'Ordo keeps no Codex credentials. To sign out of Codex, run `codex logout` in a terminal.'
      )
      return
    }
    await this.secrets.delete(CLAUDE_API_KEY_SECRET)
    this.log.info('Anthropic API key for Claude Code removed from the system keychain')
  }

  async createRequirement(): Promise<void> {
    const root = await getWorkspaceRoot()
    const title = await vscode.window.showInputBox({
      prompt: 'Requirement title',
      placeHolder: 'Allow operators to...'
    })
    if (!title) {
      return
    }
    const objective = await vscode.window.showInputBox({
      prompt: 'Business outcome',
      placeHolder: 'What should improve for the business or customer?'
    })
    if (!objective) {
      return
    }
    const actors = await vscode.window.showInputBox({
      prompt: 'Actors (optional)',
      placeHolder: 'One or more users or systems'
    })
    const businessRules = await vscode.window.showInputBox({
      prompt: 'Business rules (optional)',
      placeHolder: 'Separate rules with semicolons'
    })
    const functionalRequirements = await vscode.window.showInputBox({
      prompt: 'Functional requirements (optional)',
      placeHolder: 'Separate requirements with semicolons'
    })
    const acceptanceCriteria = await vscode.window.showInputBox({
      prompt: 'Acceptance criteria',
      placeHolder: 'Separate observable outcomes with semicolons'
    })
    if (!acceptanceCriteria) {
      return
    }
    const openQuestions = await vscode.window.showInputBox({
      prompt: 'Open questions (optional)',
      placeHolder: 'Record uncertainties for team clarification'
    })
    const constraints = await vscode.window.showInputBox({
      prompt: 'Constraints (optional)',
      placeHolder: 'Technical, legal, or operational limits'
    })
    const requirements = [
      businessRules ? `### Business rules\n\n${bulletList(businessRules)}` : '',
      functionalRequirements
        ? `### Functional requirements\n\n${bulletList(functionalRequirements)}`
        : ''
    ]
      .filter(Boolean)
      .join('\n\n')
    const spec = await createSpec(root, {
      title,
      objective,
      actors,
      requirements,
      constraints,
      acceptanceCriteria: bulletList(acceptanceCriteria),
      risks: openQuestions ? `Open questions:\n\n${bulletList(openQuestions)}` : undefined
    })
    await vscode.window.showTextDocument(vscode.Uri.file(spec.path), {
      viewColumn: vscode.ViewColumn.Beside
    })
    await this.refresh()
  }

  async createImplementationPlan(): Promise<void> {
    const root = await getWorkspaceRoot()
    const specs = await listSpecs(root)
    if (specs.length === 0) {
      throw new Error('Create a business requirement before planning its implementation.')
    }
    const selected = await vscode.window.showQuickPick(
      specs.map(spec => ({
        label: spec.title,
        description: `${spec.status} · ${spec.id}`,
        detail: spec.objective,
        spec
      })),
      { title: 'Choose the shared requirement for this plan' }
    )
    if (!selected) {
      return
    }
    const title = await vscode.window.showInputBox({
      title: 'Implementation plan',
      prompt: 'Plan title',
      value: `${selected.spec.title} implementation`
    })
    if (!title?.trim()) {
      return
    }
    const firstStep = await vscode.window.showInputBox({
      title: 'Implementation plan · first step',
      prompt: 'What is the first bounded piece of work?'
    })
    if (!firstStep?.trim()) {
      return
    }
    const expectedOutput = await vscode.window.showInputBox({
      title: 'Implementation plan · first step',
      prompt: 'What concrete output should this step produce?'
    })
    if (!expectedOutput?.trim()) {
      return
    }
    const verification = await vscode.window.showInputBox({
      title: 'Implementation plan · verification',
      prompt: 'How should the result be checked? Separate checks with semicolons.'
    })
    if (!verification?.trim()) {
      return
    }

    const plan = await createPlan(
      root,
      buildImplementationPlanOptions(selected.spec, {
        title,
        firstStep,
        expectedOutput,
        verification
      })
    )
    await vscode.window.showTextDocument(
      vscode.Uri.file(path.join(root, '.ordo', 'plans', `${plan.id}.json`)),
      { viewColumn: vscode.ViewColumn.Beside }
    )
    await this.refresh()
  }

  async initializeContext(): Promise<void> {
    const root = await getWorkspaceRoot()
    await initializeProjectContext(root)
    await vscode.window.showTextDocument(vscode.Uri.file(path.join(root, '.ordo', 'brain.md')), {
      viewColumn: vscode.ViewColumn.Beside
    })
    await this.refresh()
  }

  async openFile(candidate: string): Promise<void> {
    const root = this.root ?? (await getWorkspaceRoot())
    const absolute = path.resolve(root, candidate)
    const relative = path.relative(root, absolute)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Ordo can only open files inside the current project.')
    }
    await vscode.window.showTextDocument(vscode.Uri.file(absolute), {
      viewColumn: vscode.ViewColumn.Beside
    })
  }

  async refreshWorkflow(): Promise<void> {
    try {
      const root = await getWorkspaceRoot()
      this.post({ type: 'workflow', items: (await workflowStatus(root)).items })
    } catch (error) {
      this.post({ type: 'workflowError', message: messageOf(error) })
    }
  }

  private async loadTrail(specId: unknown): Promise<void> {
    if (typeof specId !== 'string' || !ID.test(specId)) {
      return
    }
    try {
      const root = await getWorkspaceRoot()
      this.post({ type: 'trail', trail: await workflowTrail(root, specId) })
    } catch (error) {
      this.post({ type: 'workflowError', message: messageOf(error) })
    }
  }

  /**
   * Human decisions run here, each behind an explicit confirmation, and are recorded
   * with the person's name. Actions the editor cannot perform yet hand over the CLI command.
   */
  private async runWorkflowAction(message: Extract<WebviewMessage, { type: 'workflowAction' }>) {
    const text = (value: unknown) =>
      typeof value === 'string' && ID.test(value) ? value : undefined
    const targetId = text(message.targetId)
    const stepId = text(message.stepId)
    const specId = text(message.specId)
    const root = await getWorkspaceRoot()
    switch (message.action) {
      case 'mark-spec-ready': {
        if (!targetId) {
          return
        }
        const confirm = await vscode.window.showWarningMessage(
          `Mark "${targetId}" ready? This is the business approval of the specification and is recorded with your name.`,
          { modal: true },
          'Mark ready'
        )
        if (confirm === 'Mark ready') {
          await updateSpecStatus(root, targetId, 'ready', { actorType: 'human' })
        }
        break
      }
      case 'approve-architecture': {
        if (!targetId) {
          return
        }
        const confirm = await vscode.window.showWarningMessage(
          `Approve the architecture "${targetId}"? The approval is recorded with your name.`,
          { modal: true },
          'Approve'
        )
        if (confirm === 'Approve') {
          await approveArchitectureProposal(root, targetId, { actorType: 'human' })
        }
        break
      }
      case 'review-step': {
        if (!targetId || !stepId || !specId) {
          return
        }
        await this.openReviewPanel(targetId, stepId, specId)
        return
      }
      case 'create-plan':
        await this.createImplementationPlan()
        break
      case 'run-step': {
        if (!targetId || !stepId || !specId) {
          return
        }
        await this.openRunPanel(targetId, stepId, specId)
        return
      }
      default: {
        const command = cliCommandFor(String(message.action), targetId)
        if (command) {
          const copy = await vscode.window.showInformationMessage(
            `This step runs from the terminal for now: ${command}`,
            'Copy command'
          )
          if (copy === 'Copy command') {
            await vscode.env.clipboard.writeText(command)
          }
        }
        return
      }
    }
    await Promise.all([this.refresh(), this.refreshWorkflow()])
    if (specId) {
      await this.loadTrail(specId)
    }
  }

  // ---------- inline code review and run panels ----------

  async openReviewPanel(planId: string, stepId: string, specId: string): Promise<void> {
    const root = await getWorkspaceRoot()
    const changes = await stepChanges(root, await readPlan(root, planId), stepId)
    this.post({
      type: 'review',
      review: {
        planId,
        stepId,
        specId,
        available: changes.available,
        reason: changes.reason,
        files: changes.files
      }
    })
  }

  private async openReviewDiff(planId: string, stepId: string, file: string): Promise<void> {
    const root = await getWorkspaceRoot()
    const changes = await stepChanges(root, await readPlan(root, planId), stepId)
    if (changes.files.some(change => change.path === file)) {
      await openAgentDiff(root, changes, file)
    }
  }

  private async submitReview(
    planId: string,
    stepId: string,
    specId: string,
    decision: StepReviewDecision,
    note: string | undefined,
    rejectFiles: readonly string[]
  ): Promise<void> {
    try {
      const root = await getWorkspaceRoot()
      await reviewAgentStep(root, planId, stepId, decision, {
        note,
        rejectFiles,
        actorType: 'human'
      })
      this.log.info(
        `Review recorded: ${planId}/${stepId} ${decision}, ${rejectFiles.length} file(s) undone`
      )
      this.post({ type: 'reviewResult', planId, stepId, ok: true })
      await Promise.all([this.refresh(), this.refreshWorkflow(), this.loadTrail(specId)])
    } catch (error) {
      this.post({ type: 'reviewResult', planId, stepId, ok: false, message: messageOf(error) })
    }
  }

  async openRunPanel(planId: string, stepId: string, specId: string): Promise<void> {
    if (this.lastConnections.length === 0) {
      await this.refreshConnections()
    }
    this.post({
      type: 'runSetup',
      run: {
        planId,
        stepId,
        specId,
        harnesses: runHarnesses(this.lastConnections),
        running: Boolean(this.activeRun)
      }
    })
  }

  private async runOptions(
    harness: AgentAdapterId,
    specId: string,
    planId: string,
    stepId: string,
    prompt?: string
  ): Promise<{ options: PlanStepRunOptions; apiKey?: string }> {
    const root = await getWorkspaceRoot()
    const definition = findHarness(harness) as HarnessDefinition
    const executable = resolveExecutableSetting(
      vscode.workspace.getConfiguration('ordo').get<string>(definition.pathSetting, '')
    )
    const apiKey =
      harness === 'claude-code' ? await this.secrets.get(CLAUDE_API_KEY_SECRET) : undefined
    const content = await resolveProfileContentRoot(root, this.bundledContentRoot)
    return {
      apiKey,
      options: {
        harness,
        directory: root,
        specId,
        planId,
        stepId,
        contentRoot: content.root,
        command: executable.command,
        apiKey,
        prompt: prompt?.trim() || undefined
      }
    }
  }

  private async previewRun(
    harness: AgentAdapterId,
    specId: string,
    planId: string,
    stepId: string
  ): Promise<void> {
    try {
      const { options } = await this.runOptions(harness, specId, planId, stepId)
      const prepared = await preparePlanStepRun(options)
      this.post({
        type: 'runPreview',
        planId,
        stepId,
        harness,
        estimate: prepared.estimate,
        selection: selectionOf(prepared.profileSelection)
      })
    } catch (error) {
      this.post({ type: 'runPreview', planId, stepId, harness, error: messageOf(error) })
    }
  }

  /**
   * Runs a ready plan step with the chosen agent through the same runtime as
   * `ordo agent`. Output and permission requests go to the page; when the agent
   * finishes, the page switches to the code review of what it changed.
   */
  private async startRun(
    harness: AgentAdapterId,
    specId: string,
    planId: string,
    stepId: string,
    prompt: string | undefined
  ): Promise<void> {
    if (this.activeRun) {
      this.post({
        type: 'runFailed',
        message: 'An agent run is already in progress.',
        stopped: false
      })
      return
    }
    const controller = new AbortController()
    this.activeRun = controller
    try {
      const { options, apiKey } = await this.runOptions(harness, specId, planId, stepId, prompt)
      const prepared = await preparePlanStepRun(options)
      this.post({ type: 'runStarted', harness })
      this.log.info(
        `Agent run started: ${harness} on ${planId}/${stepId}, prompt ${describeEstimate(prepared.estimate)}`
      )
      const report = await executePlanStepRun(
        prepared,
        { apiKey },
        {
          signal: controller.signal,
          onText: text => this.post({ type: 'runOutput', text }),
          onApprovalRequest: request => this.askApprovalInPage(request)
        }
      )
      this.post({ type: 'runFinished', changedFiles: report.changedFiles?.length })
      this.log.info(`Agent run finished: ${harness} on ${planId}/${stepId}`)
      await this.openReviewPanel(planId, stepId, specId)
    } catch (error) {
      this.post({
        type: 'runFailed',
        message: messageOf(error),
        stopped: controller.signal.aborted
      })
    } finally {
      this.activeRun = undefined
      this.declinePendingApprovals()
      await Promise.all([this.refresh(), this.refreshWorkflow(), this.refreshUsage()])
    }
  }

  private chatView(thread: ChatThread): ChatView {
    return {
      thread,
      handoff: {
        'claude-code': chatHandoff(thread, 'claude-code'),
        codex: chatHandoff(thread, 'codex')
      }
    }
  }

  async refreshChats(): Promise<void> {
    const root = await getWorkspaceRoot()
    this.post({
      type: 'chats',
      chats: await listChats(root),
      harnesses: runHarnesses(this.lastConnections),
      running: this.activeChat?.chatId
    })
  }

  private async openChat(id: string): Promise<void> {
    const root = await getWorkspaceRoot()
    this.post({ type: 'chat', chat: this.chatView(await readChat(root, id)) })
  }

  private async removeChat(id: string): Promise<void> {
    if (this.activeChat?.chatId === id) {
      this.post({ type: 'chatError', message: 'Stop the agent before deleting this chat.' })
      return
    }
    await deleteChat(await getWorkspaceRoot(), id)
    await this.refreshChats()
  }

  /**
   * One message of a personal chat, read-only: the agent can read the project but not
   * change it, and permission requests are declined without asking.
   */
  private async sendChat(
    chatId: string | undefined,
    harness: AgentAdapterId,
    text: string
  ): Promise<void> {
    if (this.activeChat) {
      this.post({
        type: 'chatError',
        message: 'An agent is still answering. Wait for it or stop it first.'
      })
      return
    }
    const active: { readonly controller: AbortController; chatId?: string } = {
      controller: new AbortController(),
      chatId
    }
    this.activeChat = active
    try {
      const root = await getWorkspaceRoot()
      const definition = findHarness(harness) as HarnessDefinition
      const executable = resolveExecutableSetting(
        vscode.workspace.getConfiguration('ordo').get<string>(definition.pathSetting, '')
      )
      const apiKey =
        harness === 'claude-code' ? await this.secrets.get(CLAUDE_API_KEY_SECRET) : undefined
      const result = await sendChatMessage({
        projectRoot: root,
        chatId,
        agent: harness,
        text,
        command: executable.command,
        apiKey,
        access: 'read-only',
        signal: active.controller.signal,
        onStarted: chat => {
          active.chatId = chat.id
          this.post({ type: 'chatStarted', chat: this.chatView(chat) })
        },
        onText: output => {
          if (active.chatId) {
            this.post({ type: 'chatOutput', chatId: active.chatId, text: output })
          }
        },
        onApprovalRequest: () => 'decline'
      })
      this.post({ type: 'chatReply', chat: this.chatView(result.chat) })
      this.log.info(
        `Chat reply from ${harness}${result.reply.error ? `: ${result.reply.error}` : ''}`
      )
    } catch (error) {
      this.post({ type: 'chatError', message: messageOf(error) })
    } finally {
      this.activeChat = undefined
      await Promise.all([this.refreshChats(), this.refreshUsage()])
    }
  }

  private askApprovalInPage(request: AgentApprovalRequest): Promise<AgentApprovalDecision> {
    if (!this.sink) {
      return Promise.resolve('decline')
    }
    return new Promise(resolve => {
      const id = randomUUID()
      this.pendingApprovals.set(id, resolve)
      this.post({
        type: 'runApproval',
        approval: {
          id,
          summary: request.summary,
          command: request.command,
          cwd: request.cwd,
          reason: request.reason
        }
      })
    })
  }

  private declinePendingApprovals(): void {
    for (const resolve of this.pendingApprovals.values()) {
      resolve('decline')
    }
    this.pendingApprovals.clear()
  }

  private async createProfile(): Promise<void> {
    const root = await getWorkspaceRoot()
    const content = await resolveProfileContentRoot(root, this.bundledContentRoot)
    await initializeProjectProfile(root, content.root)
    this.log.info(`Team profile created from the ${content.source} catalog`)
    await Promise.all([this.refreshProfile(), this.refresh()])
  }

  private async saveProfile(rawChanges: unknown): Promise<void> {
    if (this.savingProfile) {
      return
    }
    const changes = Array.isArray(rawChanges) ? rawChanges.map(parseProfileChange) : []
    if (changes.length === 0 || changes.some(change => change === undefined)) {
      throw new Error('The profile changes were not valid; nothing was saved.')
    }
    this.savingProfile = true
    const root = await getWorkspaceRoot()
    const content = await resolveProfileContentRoot(root, this.bundledContentRoot)
    const applied: ProfileChange[] = []
    try {
      for (const change of changes as ProfileChange[]) {
        await updateProjectProfileEntry(root, content.root, change.kind, change.id, change.mode)
        applied.push(change)
      }
      this.log.info(`Team profile updated: ${applied.length} change(s)`)
    } catch (error) {
      const done = applied.length ? `${applied.length} change(s) were saved before this one. ` : ''
      throw new Error(`${done}${messageOf(error)}`)
    } finally {
      this.savingProfile = false
      await Promise.all([this.refreshProfile(), this.refresh()])
    }
  }

  private async openCatalogEntry(kind: unknown, id: unknown): Promise<void> {
    const root = await getWorkspaceRoot()
    const content = await resolveProfileContentRoot(root, this.bundledContentRoot)
    const entry = (await loadCatalog(content.root)).entries.find(
      candidate => candidate.kind === kind && candidate.id === id
    )
    if (entry) {
      await vscode.commands.executeCommand(
        'markdown.showPreviewToSide',
        vscode.Uri.file(entry.sourcePath)
      )
    }
  }

  private connectionCwd(): string {
    return this.root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir()
  }

  private async pickHarness(
    id: AgentAdapterId | undefined,
    title: string
  ): Promise<HarnessDefinition | undefined> {
    if (id) {
      return findHarness(id)
    }
    return (
      await vscode.window.showQuickPick(
        HARNESSES.map(harness => ({ label: harness.name, harness })),
        { title }
      )
    )?.harness
  }

  private post(message: HostMessage): void {
    this.sink?.(message)
  }
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REVIEW_DECISIONS: readonly StepReviewDecision[] = ['approved', 'changes-requested', 'blocked']

function stepIds(message: {
  readonly planId: unknown
  readonly stepId: unknown
  readonly specId?: unknown
}): { planId: string; stepId: string; specId: string } | undefined {
  const { planId, stepId, specId } = message
  return typeof planId === 'string' &&
    ID.test(planId) &&
    typeof stepId === 'string' &&
    ID.test(stepId) &&
    (specId === undefined || (typeof specId === 'string' && ID.test(specId)))
    ? { planId, stepId, specId: (specId as string | undefined) ?? '' }
    : undefined
}

function selectionOf(selection: ProfileSessionSelection | undefined): RunSelection | undefined {
  return selection
    ? {
        agent: selection.agent?.id,
        skills: selection.skills.map(entry => entry.id),
        rules: selection.rules.map(entry => entry.id)
      }
    : undefined
}

function cliCommandFor(action: string, targetId: string | undefined): string | undefined {
  switch (action) {
    case 'propose-architecture':
      return targetId ? `ordo architect create --spec ${targetId} --title "<title>" ...` : undefined
    case 'add-alternative':
      return targetId
        ? `ordo brainstorm add ${targetId} --title "<title>" --summary "<text>" --tradeoff "<text>"`
        : undefined
    case 'select-alternative':
      return targetId ? `ordo brainstorm select ${targetId} --alternative <id>` : undefined
    case 'crystallize-exploration':
      return targetId
        ? `ordo brainstorm crystallize ${targetId} --acceptance "<criteria>"`
        : undefined
    default:
      return undefined
  }
}

function bulletList(value: string): string {
  return value
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => `- ${item}`)
    .join('\n')
}

// Counts and status only: project contents must never reach the log.
function describeSnapshot(snapshot: WorkspaceSnapshot): string {
  return [
    `context=${snapshot.context.initialized ? 'initialized' : 'missing'}`,
    `specs=${snapshot.specs.length}`,
    `explorations=${snapshot.explorations.length}`,
    `architectures=${snapshot.architectures.length}`,
    `plans=${snapshot.plans.length}`,
    `sessions=${snapshot.sessions.length}`
  ].join(' ')
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
