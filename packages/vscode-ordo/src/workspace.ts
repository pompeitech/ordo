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
  type AgentUsage,
  checkAgentConnection,
  loginCodexWithApiKey,
  readCodexUsage,
  readRecordedUsage
} from '@pompeitech/ordo-runtime'
import * as vscode from 'vscode'
import { chooseFilesToKeep } from './code-review.js'
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
import type { HostMessage, TeamProfileState, WebviewMessage, WorkspaceSnapshot } from './types.js'

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
  private savingProfile = false
  private sink?: (message: HostMessage) => void

  constructor(
    private readonly log: vscode.LogOutputChannel,
    private readonly secrets: vscode.SecretStorage,
    private readonly bundledContentRoot: string
  ) {}

  attach(sink: ((message: HostMessage) => void) | undefined): void {
    this.sink = sink
  }

  async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
        case 'refresh':
          await Promise.all([
            this.refresh(),
            this.refreshConnections().then(() => this.refreshUsage()),
            this.refreshProfile(),
            this.refreshWorkflow()
          ])
          break
        case 'checkConnections':
          await this.refreshConnections()
          await this.refreshUsage()
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
        if (!targetId || !stepId) {
          return
        }
        await this.reviewStep(root, targetId, stepId)
        break
      }
      case 'create-plan':
        await this.createImplementationPlan()
        break
      default: {
        const command = cliCommandFor(String(message.action), targetId, stepId, specId)
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

  /**
   * Code review of an agent step: inspect each changed file in the diff editor, uncheck
   * the ones to undo, then decide. Files are undone before the decision is recorded.
   */
  private async reviewStep(root: string, planId: string, stepId: string): Promise<void> {
    const changes = await stepChanges(root, await readPlan(root, planId), stepId)
    let rejectFiles: readonly string[] = []
    if (changes.available && changes.files.length > 0) {
      const picked = await chooseFilesToKeep(root, changes, stepId)
      if (!picked) {
        return
      }
      rejectFiles = picked.rejected
    } else if (!changes.available) {
      void vscode.window.showInformationMessage(
        `No diff for this run (${changes.reason}). You can still record the decision.`
      )
    }
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: '$(check) Approve',
          description: 'The step is done',
          decision: 'approved' as StepReviewDecision
        },
        {
          label: '$(discard) Request changes',
          description: 'The step becomes runnable again',
          decision: 'changes-requested' as StepReviewDecision
        },
        {
          label: '$(circle-slash) Block',
          description: 'Stop the step until the problem is solved',
          decision: 'blocked' as StepReviewDecision
        }
      ],
      {
        title: `Review of step "${stepId}"`,
        placeHolder: 'Your decision is recorded with your name'
      }
    )
    if (!choice) {
      return
    }
    let note: string | undefined
    if (choice.decision !== 'approved') {
      note = await vscode.window.showInputBox({
        title: `Review of step "${stepId}"`,
        prompt:
          choice.decision === 'blocked'
            ? 'Why is the step blocked?'
            : 'What has to change? The next run should address it.',
        ignoreFocusOut: true,
        validateInput: value => (value.trim() ? undefined : 'A note is required.')
      })
      if (!note?.trim()) {
        return
      }
    } else {
      note =
        (
          await vscode.window.showInputBox({
            title: `Review of step "${stepId}"`,
            prompt: 'Optional note for the record',
            ignoreFocusOut: true
          })
        )?.trim() || undefined
    }
    if (rejectFiles.length > 0) {
      const confirm = await vscode.window.showWarningMessage(
        `Undo ${rejectFiles.length} file(s)? They go back to their version from before the agent run: ${rejectFiles.join(', ')}`,
        { modal: true },
        'Undo and record the review'
      )
      if (confirm !== 'Undo and record the review') {
        return
      }
    }
    await reviewAgentStep(root, planId, stepId, choice.decision, {
      note,
      rejectFiles,
      actorType: 'human'
    })
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

function cliCommandFor(
  action: string,
  targetId: string | undefined,
  stepId: string | undefined,
  specId: string | undefined
): string | undefined {
  switch (action) {
    case 'run-step':
      return specId && targetId && stepId
        ? `ordo agent claude --spec ${specId} --plan ${targetId} --step ${stepId}`
        : undefined
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
