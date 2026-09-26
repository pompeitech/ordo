import { createHash } from 'node:crypto'
import {
  createSession,
  findRepositoryRoot,
  isOrdoError,
  listSessions,
  loadCatalog,
  loadConfig,
  projectProfileSha256,
  readProjectProfile,
  readSession,
  resolveContentRoot,
  resolveProfileSessionSelection,
  type SessionEvent,
  type SessionRecord,
  setSessionContextSnapshot,
  snapshotProjectContext,
  validateProjectProfile
} from '@pompeitech/ordo-core'
import { createAnthropicProvider } from '@pompeitech/ordo-provider-anthropic'
import {
  createOpenAICompatibleProvider,
  createOpenAIResponsesProvider
} from '@pompeitech/ordo-provider-openai'
import { type ModelProvider, runSessionTurn } from '@pompeitech/ordo-runtime'
import { createRepositoryTools } from '@pompeitech/ordo-tools'
import { discoverDefaultContentRoot } from '../prompts/init.js'

export type SessionAction = 'create' | 'list' | 'show' | 'export' | 'run'

export interface ManageSessionOptions {
  readonly directory: string
  readonly action: SessionAction
  readonly sessionId?: string
  readonly title?: string
  readonly provider?: string
  readonly model?: string
  readonly contextSnapshotId?: string
  readonly agentId?: string
  readonly ruleIds?: readonly string[]
  readonly skillIds?: readonly string[]
  readonly contentRoot?: string
  readonly prompt?: string
  readonly baseUrl?: string
  readonly allowTools?: readonly string[]
  readonly maxOutputTokens?: number
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly fetch?: typeof globalThis.fetch
}

export interface SessionCreateReport {
  readonly schemaVersion: 1
  readonly command: 'session-create'
  readonly repositoryRoot: string
  readonly session: SessionRecord
}

export interface SessionListReport {
  readonly schemaVersion: 1
  readonly command: 'session-list'
  readonly repositoryRoot: string
  readonly sessions: readonly SessionRecord[]
}

export interface SessionDetailReport {
  readonly schemaVersion: 1
  readonly command: 'session-show' | 'session-export'
  readonly repositoryRoot: string
  readonly session: SessionRecord
  readonly events: readonly SessionEvent[]
}

export interface SessionRunReport {
  readonly schemaVersion: 1
  readonly command: 'session-run'
  readonly repositoryRoot: string
  readonly session: SessionRecord
  readonly contextSnapshotId: string
  readonly text: string
  readonly toolIterations: number
  readonly usage: {
    readonly inputTokens?: number
    readonly outputTokens?: number
    readonly totalTokens?: number
    readonly cost?: number
    readonly currency?: string
  }
  readonly finishReason?: string
}

export type SessionCommandReport =
  | SessionCreateReport
  | SessionListReport
  | SessionDetailReport
  | SessionRunReport

function selectedCatalogPrompt(
  selection: SessionRecord['profileSelection'],
  entries: Awaited<ReturnType<typeof loadCatalog>>['entries']
): string | undefined {
  if (!selection) {
    return undefined
  }
  const selected = [
    ...(selection.agent ? [{ kind: 'agents' as const, ...selection.agent }] : []),
    ...selection.skills.map(entry => ({ kind: 'skills' as const, ...entry })),
    ...selection.rules.map(entry => ({ kind: 'rules' as const, ...entry }))
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
        `Selected ${reference.kind} entry changed since session creation: ${reference.id}`
      )
    }
    return `## ${reference.kind.slice(0, -1)}: ${reference.id}\n\n${entry.content.trim()}`
  })
  return sections.length
    ? `Project-approved Ordo catalog instructions (profile ${selection.profileSha256}):\n\n${sections.join('\n\n---\n\n')}`
    : undefined
}

function requiredSecret(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim()
  if (!value) {
    throw new Error(`Missing provider credential: ${name}`)
  }
  return value
}

function createProvider(
  providerId: string,
  baseUrl: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
  fetch?: typeof globalThis.fetch
): ModelProvider {
  if (providerId === 'openai') {
    return createOpenAIResponsesProvider({
      apiKey: requiredSecret(env, 'OPENAI_API_KEY'),
      baseUrl,
      fetch
    })
  }
  if (providerId === 'anthropic') {
    return createAnthropicProvider({
      apiKey: requiredSecret(env, 'ANTHROPIC_API_KEY'),
      baseUrl,
      fetch
    })
  }
  if (!baseUrl) {
    throw new Error(`Provider ${providerId} requires --base-url for its OpenAI-compatible API`)
  }
  const credentialNames: Record<string, string> = {
    openrouter: 'OPENROUTER_API_KEY',
    github: 'GITHUB_TOKEN'
  }
  const credentialName = credentialNames[providerId]
  return createOpenAICompatibleProvider({
    id: providerId,
    baseUrl,
    apiKey: credentialName ? requiredSecret(env, credentialName) : undefined,
    fetch
  })
}

export async function manageSession(options: ManageSessionOptions): Promise<SessionCommandReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  if (options.action === 'create') {
    let profileSelection
    try {
      const profile = await readProjectProfile(repositoryRoot)
      const configured = await loadConfig({ cwd: repositoryRoot, optional: true })
      const contentRoot = options.contentRoot
        ? resolveContentRoot(repositoryRoot, configured.config.contentRoot, options.contentRoot)
        : await discoverDefaultContentRoot(repositoryRoot, configured.config.contentRoot)
      const validation = await validateProjectProfile(repositoryRoot, contentRoot)
      if (!validation.valid) {
        throw new Error(`Project profile needs review: ${validation.errors.join('; ')}`)
      }
      profileSelection = resolveProfileSessionSelection(
        profile,
        options.agentId,
        options.skillIds,
        options.ruleIds
      )
    } catch (error) {
      if (!isOrdoError(error) || error.code !== 'PROFILE_NOT_FOUND') {
        throw error
      }
      if (
        options.agentId ||
        (options.skillIds?.length ?? 0) > 0 ||
        (options.ruleIds?.length ?? 0) > 0
      ) {
        throw new Error(
          'Cannot select --agent, --skill, or --rule before initializing an Ordo project profile'
        )
      }
    }
    const runtime =
      options.provider && options.model
        ? Object.freeze({ provider: options.provider, model: options.model })
        : undefined
    const session = await createSession(repositoryRoot, {
      title: options.title ?? 'Untitled session',
      runtime,
      contextSnapshotId: options.contextSnapshotId,
      profileSelection
    })
    return Object.freeze({
      schemaVersion: 1,
      command: 'session-create' as const,
      repositoryRoot,
      session
    })
  }

  if (options.action === 'list') {
    return Object.freeze({
      schemaVersion: 1,
      command: 'session-list' as const,
      repositoryRoot,
      sessions: await listSessions(repositoryRoot)
    })
  }

  if (options.action === 'run') {
    const detail = await readSession(repositoryRoot, options.sessionId ?? '')
    if (!detail.session.runtime) {
      throw new Error('Session run requires a provider and model configured at creation')
    }
    let systemPrompt: string | undefined
    if (detail.session.profileSelection) {
      const configured = await loadConfig({ cwd: repositoryRoot, optional: true })
      const contentRoot = options.contentRoot
        ? resolveContentRoot(repositoryRoot, configured.config.contentRoot, options.contentRoot)
        : await discoverDefaultContentRoot(repositoryRoot, configured.config.contentRoot)
      const validation = await validateProjectProfile(repositoryRoot, contentRoot)
      if (!validation.valid || !validation.profile) {
        throw new Error(
          `Project profile or catalog changed; review required: ${validation.errors.join('; ')}`
        )
      }
      if (
        projectProfileSha256(validation.profile) !== detail.session.profileSelection.profileSha256
      ) {
        throw new Error(
          'Project profile changed since session creation; create a new session after review'
        )
      }
      const catalog = await loadCatalog(contentRoot)
      systemPrompt = selectedCatalogPrompt(detail.session.profileSelection, catalog.entries)
    }
    const snapshot = await snapshotProjectContext(repositoryRoot)
    const session = await setSessionContextSnapshot(
      repositoryRoot,
      detail.session.id,
      snapshot.snapshot.id
    )
    const allowed = new Set(options.allowTools ?? [])
    const result = await runSessionTurn({
      repositoryRoot,
      sessionId: session.id,
      provider: createProvider(
        detail.session.runtime.provider,
        options.baseUrl,
        options.env ?? process.env,
        options.fetch
      ),
      model: detail.session.runtime.model,
      prompt: options.prompt ?? '',
      systemPrompt,
      contextPayload: snapshot.payload,
      tools: createRepositoryTools(),
      maxOutputTokens: options.maxOutputTokens,
      approvalPolicy: {
        async decide(request) {
          return allowed.has(request.tool.name) ? 'allow-session' : 'deny'
        }
      }
    })
    return Object.freeze({
      schemaVersion: 1,
      command: 'session-run' as const,
      repositoryRoot,
      session,
      contextSnapshotId: snapshot.snapshot.id,
      ...result
    })
  }

  const detail = await readSession(repositoryRoot, options.sessionId ?? '')
  return Object.freeze({
    schemaVersion: 1,
    command: options.action === 'export' ? ('session-export' as const) : ('session-show' as const),
    repositoryRoot,
    session: detail.session,
    events: detail.events
  })
}
