import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
  AgentAccess,
  AgentAdapter,
  AgentAdapterId,
  AgentApprovalDecision,
  AgentApprovalRequest
} from './agent-adapter.js'
import { claudeCodeAgentAdapter } from './claude-code.js'
import { codexAgentAdapter } from './codex-app-server.js'
import { type AgentConnection, checkAgentConnection } from './connection.js'
import { recordAgentUsage } from './usage.js'

/**
 * Personal conversations with an agent. They live in the machine-local state directory,
 * never in `.ordo/` or Git: a chat is scratch work, not a team record.
 */
export interface ChatMessage {
  readonly id: string
  readonly role: 'user' | 'agent'
  readonly agent?: AgentAdapterId
  readonly text: string
  readonly at: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  /** Set when the agent failed or was stopped; `text` keeps what it wrote until then. */
  readonly error?: string
}

export interface ChatThread {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly projectRoot: string
  readonly createdAt: string
  readonly updatedAt: string
  /** The harness's own conversation per agent: Claude session ID, Codex thread ID. */
  readonly nativeSessions: Readonly<Partial<Record<AgentAdapterId, string>>>
  /** How many messages each agent has seen, so a switch hands over only what it missed. */
  readonly seen: Readonly<Partial<Record<AgentAdapterId, number>>>
  readonly messages: readonly ChatMessage[]
}

export interface ChatSummary {
  readonly id: string
  readonly title: string
  readonly updatedAt: string
  readonly messageCount: number
  readonly lastAgent?: AgentAdapterId
}

export interface ChatStoreOptions {
  /** Defaults to `$ORDO_STATE_DIR/chats` or `$XDG_STATE_HOME/ordo/chats`. */
  readonly directory?: string
}

export interface ChatHandoff {
  /** Earlier messages this agent has not seen and will receive with the next message. */
  readonly messages: number
  readonly estimatedTokens: number
}

export interface SendChatMessageOptions extends ChatStoreOptions {
  readonly projectRoot: string
  /** Continue this chat; a new one is created when absent. */
  readonly chatId?: string
  readonly agent: AgentAdapterId
  readonly text: string
  readonly command?: string
  /** Claude Code only: the user's API key, used only when the CLI is not logged in. */
  readonly apiKey?: string
  readonly access?: AgentAccess
  readonly signal?: AbortSignal
  readonly usageStatePath?: string
  /** Called once the user message is stored, before the agent starts. */
  readonly onStarted?: (chat: ChatThread) => void
  readonly onText?: (text: string) => void
  readonly onApprovalRequest?: (
    request: AgentApprovalRequest
  ) => AgentApprovalDecision | Promise<AgentApprovalDecision>
  /** Test seams. */
  readonly adapters?: Partial<Record<AgentAdapterId, AgentAdapter>>
  readonly checkConnection?: (id: AgentAdapterId) => Promise<AgentConnection>
}

export interface SendChatMessageResult {
  readonly chat: ChatThread
  readonly reply: ChatMessage
}

const AGENT_NAMES: Record<AgentAdapterId, string> = { 'claude-code': 'Claude Code', codex: 'Codex' }
const DEFAULT_ADAPTERS: Record<AgentAdapterId, AgentAdapter> = {
  'claude-code': claudeCodeAgentAdapter,
  codex: codexAgentAdapter
}
const MAX_MESSAGE_LENGTH = 20_000
const CHAT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const READ_ONLY_PREAMBLE =
  'You are answering in a chat inside Ordo, in read-only mode: you can read and search the ' +
  'project, but you cannot change files or run commands. When a change is needed, show it ' +
  'as a snippet or a diff and say which file it belongs to.'

export function defaultChatDirectory(env: NodeJS.ProcessEnv = process.env): string {
  if (env.ORDO_STATE_DIR) {
    return path.join(env.ORDO_STATE_DIR, 'chats')
  }
  const stateHome = env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state')
  return path.join(stateHome, 'ordo', 'chats')
}

/** Chats of one project, keyed by a hash of its path so no project name leaks into paths. */
function projectDirectory(projectRoot: string, options: ChatStoreOptions): string {
  const key = createHash('sha256').update(path.resolve(projectRoot)).digest('hex').slice(0, 16)
  return path.join(options.directory ?? defaultChatDirectory(), key)
}

function chatPath(projectRoot: string, id: string, options: ChatStoreOptions): string {
  if (!CHAT_ID.test(id)) {
    throw new Error(`Invalid chat ID: ${id}`)
  }
  return path.join(projectDirectory(projectRoot, options), `${id}.json`)
}

async function saveChat(chat: ChatThread, options: ChatStoreOptions): Promise<void> {
  const filePath = chatPath(chat.projectRoot, chat.id, options)
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(chat, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, filePath)
}

export async function readChat(
  projectRoot: string,
  id: string,
  options: ChatStoreOptions = {}
): Promise<ChatThread> {
  const chat = JSON.parse(await readFile(chatPath(projectRoot, id, options), 'utf8')) as ChatThread
  if (chat.schemaVersion !== 1 || chat.id !== id || !Array.isArray(chat.messages)) {
    throw new Error(`Unreadable chat: ${id}`)
  }
  return chat
}

export async function listChats(
  projectRoot: string,
  options: ChatStoreOptions = {}
): Promise<readonly ChatSummary[]> {
  let names: string[]
  try {
    names = await readdir(projectDirectory(projectRoot, options))
  } catch {
    return []
  }
  const chats = await Promise.all(
    names
      .filter(name => CHAT_ID.test(name.replace(/\.json$/, '')) && name.endsWith('.json'))
      .map(name => readChat(projectRoot, name.slice(0, -5), options).catch(() => undefined))
  )
  return chats
    .filter((chat): chat is ChatThread => Boolean(chat))
    .map(chat => ({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
      messageCount: chat.messages.length,
      lastAgent: [...chat.messages].reverse().find(message => message.agent)?.agent
    }))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function deleteChat(
  projectRoot: string,
  id: string,
  options: ChatStoreOptions = {}
): Promise<void> {
  await rm(chatPath(projectRoot, id, options), { force: true })
}

function speaker(message: ChatMessage): string {
  return message.role === 'user' ? 'User' : AGENT_NAMES[message.agent ?? 'claude-code']
}

/** Messages the agent missed, without failed replies: they are not part of the conversation. */
function missedMessages(chat: ChatThread, agent: AgentAdapterId): readonly ChatMessage[] {
  const from = chat.nativeSessions[agent] ? (chat.seen[agent] ?? 0) : 0
  return chat.messages.slice(from).filter(message => !message.error)
}

/** What switching to `agent` costs before its reply: the transcript it has not seen. */
export function chatHandoff(chat: ChatThread | undefined, agent: AgentAdapterId): ChatHandoff {
  const missed = chat ? missedMessages(chat, agent) : []
  const characters = missed.reduce((total, message) => total + message.text.length + 16, 0)
  return { messages: missed.length, estimatedTokens: Math.ceil(characters / 4) }
}

/** The prompt for the agent: its own session continues; anything it missed is handed over. */
export function chatPrompt(
  chat: ChatThread,
  agent: AgentAdapterId,
  text: string,
  access: AgentAccess | undefined
): string {
  const parts: string[] = []
  if (!chat.nativeSessions[agent] && access === 'read-only') {
    parts.push(READ_ONLY_PREAMBLE)
  }
  const missed = missedMessages(chat, agent)
  if (missed.length) {
    parts.push(
      'Earlier in this conversation, which you did not see:\n\n' +
        missed.map(message => `${speaker(message)}: ${message.text}`).join('\n\n')
    )
    parts.push(`Now reply to the user:\n\n${text}`)
  } else {
    parts.push(text)
  }
  return parts.join('\n\n---\n\n')
}

function titleOf(text: string): string {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || 'New chat'
}

/**
 * Sends one user message and waits for the agent's reply. Both are stored in the
 * personal chat; a failure is stored as a reply with `error`, never thrown away.
 */
export async function sendChatMessage(
  options: SendChatMessageOptions
): Promise<SendChatMessageResult> {
  const text = options.text.trim()
  if (!text) {
    throw new Error('Write a message first.')
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`)
  }
  const store: ChatStoreOptions = { directory: options.directory }
  const now = () => new Date().toISOString()
  const existing = options.chatId
    ? await readChat(options.projectRoot, options.chatId, store)
    : undefined
  const base: ChatThread = existing ?? {
    schemaVersion: 1,
    id: randomUUID(),
    title: titleOf(text),
    projectRoot: path.resolve(options.projectRoot),
    createdAt: now(),
    updatedAt: now(),
    nativeSessions: {},
    seen: {},
    messages: []
  }

  const connection = await (options.checkConnection
    ? options.checkConnection(options.agent)
    : checkAgentConnection(options.agent, {
        command: options.command,
        cwd: options.projectRoot,
        apiKey: options.apiKey
      }))
  if (connection.status !== 'connected' || !connection.installation) {
    throw new Error(connection.message)
  }

  const userMessage: ChatMessage = { id: randomUUID(), role: 'user', text, at: now() }
  let chat: ChatThread = {
    ...base,
    updatedAt: userMessage.at,
    messages: [...base.messages, userMessage]
  }
  await saveChat(chat, store)
  options.onStarted?.(chat)

  const adapter = options.adapters?.[options.agent] ?? DEFAULT_ADAPTERS[options.agent]
  let written = ''
  let inputTokens: number | undefined
  let outputTokens: number | undefined
  let nativeSession: string | undefined
  const run = (from: ChatThread) =>
    adapter.run({
      command: connection.installation?.command,
      cwd: options.projectRoot,
      apiKey: connection.usesApiKey ? options.apiKey : undefined,
      prompt: chatPrompt(from, options.agent, text, options.access),
      resume: from.nativeSessions[options.agent],
      access: options.access,
      signal: options.signal,
      onApprovalRequest: options.onApprovalRequest,
      async onEvent(event) {
        if (event.type === 'text-delta') {
          written += event.text
          options.onText?.(event.text)
        } else if (event.type === 'native-session') {
          nativeSession = event.nativeSessionId
        } else if (event.type === 'usage') {
          inputTokens = event.inputTokens
          outputTokens = event.outputTokens
        } else if (event.type === 'usage-limits') {
          await recordAgentUsage(event.usage, { filePath: options.usageStatePath }).catch(
            () => undefined
          )
        }
      }
    })

  // `seen` is measured before the user message: the prompt carries that message itself.
  const before: ChatThread = { ...chat, messages: base.messages }
  let reply: ChatMessage
  try {
    let result: Awaited<ReturnType<AgentAdapter['run']>>
    try {
      result = await run(before)
    } catch (error) {
      // A harness can forget an old conversation; start it again with the full transcript.
      if (!before.nativeSessions[options.agent] || written || options.signal?.aborted) {
        throw error
      }
      const { [options.agent]: _forgotten, ...nativeSessions } = before.nativeSessions
      result = await run({ ...before, nativeSessions })
    }
    reply = {
      id: randomUUID(),
      role: 'agent',
      agent: options.agent,
      text: result.text || written,
      at: now(),
      inputTokens,
      outputTokens
    }
    nativeSession = result.nativeSessionId ?? nativeSession
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reply = {
      id: randomUUID(),
      role: 'agent',
      agent: options.agent,
      text: written,
      at: now(),
      error: options.signal?.aborted ? 'Stopped.' : message
    }
  }
  const messages = [...chat.messages, reply]
  chat = {
    ...chat,
    updatedAt: reply.at,
    messages,
    nativeSessions: nativeSession
      ? { ...chat.nativeSessions, [options.agent]: nativeSession }
      : chat.nativeSessions,
    seen:
      reply.error && !nativeSession ? chat.seen : { ...chat.seen, [options.agent]: messages.length }
  }
  await saveChat(chat, store)
  return { chat, reply }
}
