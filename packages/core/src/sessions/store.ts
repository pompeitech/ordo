import { randomUUID } from 'node:crypto'
import {
  appendFile,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'
import type { ProfileSessionSelection } from '../profile/types.js'
import type {
  AppendSessionEventOptions,
  CreateSessionOptions,
  SessionDetail,
  SessionEvent,
  SessionEventType,
  SessionRecord,
  SessionRuntime,
  SessionStatus
} from './types.js'

const SESSION_SCHEMA_VERSION = 1 as const
const SESSION_ID_PATTERN = /^[a-f0-9-]{36}$/
const EVENT_TYPES: readonly SessionEventType[] = [
  'message',
  'tool-call',
  'tool-result',
  'approval',
  'diff',
  'verification',
  'usage',
  'status',
  'note'
]
const SESSION_STATUSES: readonly SessionStatus[] = [
  'active',
  'paused',
  'completed',
  'archived',
  'error'
]
const SHA256_PATTERN = /^[a-f0-9]{64}$/

function sessionPaths(repositoryRoot: string, sessionId?: string) {
  const directory = path.join(repositoryRoot, '.ordo', 'sessions')
  return {
    directory,
    recordPath: sessionId ? path.join(directory, `${sessionId}.json`) : undefined,
    eventsPath: sessionId ? path.join(directory, `${sessionId}.jsonl`) : undefined,
    lockPath: sessionId ? path.join(directory, `${sessionId}.lock`) : undefined
  }
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

function assertRuntime(value: unknown): SessionRuntime | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('SESSION_INVALID', 'Session runtime must be an object')
  }
  const runtime = value as Record<string, unknown>
  if (typeof runtime.provider !== 'string' || typeof runtime.model !== 'string') {
    throw new OrdoError('SESSION_INVALID', 'Session runtime requires provider and model')
  }
  return Object.freeze({ provider: runtime.provider, model: runtime.model })
}

function assertProfileSelection(value: unknown): ProfileSessionSelection | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('SESSION_INVALID', 'Session profile selection must be an object')
  }
  const selection = value as Record<string, unknown>
  if (
    typeof selection.profileSha256 !== 'string' ||
    !SHA256_PATTERN.test(selection.profileSha256)
  ) {
    throw new OrdoError('SESSION_INVALID', 'Session profile selection requires a profile hash')
  }
  const parseEntries = (key: 'skills' | 'rules' | 'workflows') => {
    const entries = selection[key]
    if (!Array.isArray(entries)) {
      throw new OrdoError('SESSION_INVALID', `Session profile ${key} must be an array`)
    }
    return Object.freeze(
      entries.map((candidate, index) => {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
          throw new OrdoError('SESSION_INVALID', `Invalid session profile ${key}[${index}]`)
        }
        const entry = candidate as Record<string, unknown>
        if (
          typeof entry.id !== 'string' ||
          typeof entry.mode !== 'string' ||
          !['enabled', 'recommended', 'default', 'required', 'disabled'].includes(entry.mode) ||
          typeof entry.contentSha256 !== 'string' ||
          !SHA256_PATTERN.test(entry.contentSha256)
        ) {
          throw new OrdoError('SESSION_INVALID', `Invalid session profile ${key}[${index}]`)
        }
        return Object.freeze({
          id: entry.id,
          mode: entry.mode as ProfileSessionSelection['skills'][number]['mode'],
          contentSha256: entry.contentSha256
        })
      })
    )
  }
  let agent: ProfileSessionSelection['agent']
  if (selection.agent !== undefined) {
    if (
      typeof selection.agent !== 'object' ||
      selection.agent === null ||
      Array.isArray(selection.agent)
    ) {
      throw new OrdoError('SESSION_INVALID', 'Invalid session profile agent')
    }
    const rawAgent = selection.agent as Record<string, unknown>
    if (
      typeof rawAgent.id !== 'string' ||
      typeof rawAgent.mode !== 'string' ||
      !['enabled', 'recommended', 'default', 'required', 'disabled'].includes(rawAgent.mode) ||
      typeof rawAgent.contentSha256 !== 'string' ||
      !SHA256_PATTERN.test(rawAgent.contentSha256)
    ) {
      throw new OrdoError('SESSION_INVALID', 'Invalid session profile agent')
    }
    agent = Object.freeze({
      id: rawAgent.id,
      mode: rawAgent.mode as NonNullable<ProfileSessionSelection['agent']>['mode'],
      contentSha256: rawAgent.contentSha256
    })
  }
  return Object.freeze({
    profileSha256: selection.profileSha256,
    agent,
    skills: parseEntries('skills'),
    rules: parseEntries('rules'),
    workflows: parseEntries('workflows')
  })
}

function assertSession(value: unknown, recordPath: string): SessionRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('SESSION_INVALID', `Session record must be an object: ${recordPath}`)
  }
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== SESSION_SCHEMA_VERSION ||
    typeof record.id !== 'string' ||
    !SESSION_ID_PATTERN.test(record.id) ||
    typeof record.title !== 'string' ||
    typeof record.repositoryRoot !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string' ||
    typeof record.status !== 'string' ||
    !SESSION_STATUSES.includes(record.status as SessionStatus)
  ) {
    throw new OrdoError('SESSION_INVALID', `Invalid session record: ${recordPath}`)
  }
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: record.id,
    title: record.title,
    repositoryRoot: record.repositoryRoot,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status as SessionStatus,
    runtime: assertRuntime(record.runtime),
    profileSelection: assertProfileSelection(record.profileSelection),
    contextSnapshotId:
      typeof record.contextSnapshotId === 'string' ? record.contextSnapshotId : undefined,
    branch: typeof record.branch === 'string' ? record.branch : undefined,
    headCommit: typeof record.headCommit === 'string' ? record.headCommit : undefined
  })
}

function assertEvent(value: unknown, eventsPath: string): SessionEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('SESSION_INVALID', `Session event must be an object: ${eventsPath}`)
  }
  const event = value as Record<string, unknown>
  if (
    event.schemaVersion !== SESSION_SCHEMA_VERSION ||
    typeof event.id !== 'string' ||
    typeof event.sessionId !== 'string' ||
    typeof event.sequence !== 'number' ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 1 ||
    typeof event.timestamp !== 'string' ||
    typeof event.type !== 'string' ||
    !EVENT_TYPES.includes(event.type as SessionEventType) ||
    typeof event.data !== 'object' ||
    event.data === null ||
    Array.isArray(event.data)
  ) {
    throw new OrdoError('SESSION_INVALID', `Invalid session event: ${eventsPath}`)
  }
  return Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id: event.id,
    sessionId: event.sessionId,
    sequence: event.sequence,
    timestamp: event.timestamp,
    type: event.type as SessionEventType,
    data: Object.freeze({ ...(event.data as Record<string, unknown>) })
  })
}

async function atomicWriteJson(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, target)
}

async function withSessionLock<T>(
  repositoryRoot: string,
  sessionId: string,
  operation: () => Promise<T>
): Promise<T> {
  const { lockPath } = sessionPaths(repositoryRoot, sessionId)
  if (!lockPath) {
    throw new OrdoError('SESSION_INVALID', 'Session lock path is unavailable')
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(lockPath, 'wx')
  } catch (error) {
    throw new OrdoError('SESSION_INVALID', `Session is already being updated: ${sessionId}`, {
      cause: error
    })
  }

  try {
    return await operation()
  } finally {
    await handle.close()
    await unlink(lockPath).catch(() => undefined)
  }
}

export async function createSession(
  repositoryRoot: string,
  options: CreateSessionOptions
): Promise<SessionRecord> {
  const title = options.title.trim()
  if (!title) {
    throw new OrdoError('SESSION_INVALID', 'Session title must not be empty')
  }
  if (
    (options.runtime?.provider && !options.runtime.model) ||
    (!options.runtime?.provider && options.runtime?.model)
  ) {
    throw new OrdoError('SESSION_INVALID', 'Session runtime requires both provider and model')
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  const paths = sessionPaths(repositoryRoot, id)
  await mkdir(paths.directory, { recursive: true })
  const session: SessionRecord = Object.freeze({
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    title,
    repositoryRoot,
    createdAt: now,
    updatedAt: now,
    status: 'active' as const,
    runtime: options.runtime ? Object.freeze({ ...options.runtime }) : undefined,
    profileSelection: options.profileSelection
      ? assertProfileSelection(options.profileSelection)
      : undefined,
    contextSnapshotId: options.contextSnapshotId,
    branch: options.branch,
    headCommit: options.headCommit
  })
  await writeFile(paths.recordPath as string, `${JSON.stringify(session, null, 2)}\n`, {
    flag: 'wx'
  })
  await writeFile(paths.eventsPath as string, '', { flag: 'wx' })
  return session
}

export async function setSessionContextSnapshot(
  repositoryRoot: string,
  sessionId: string,
  contextSnapshotId: string
): Promise<SessionRecord> {
  if (!contextSnapshotId.trim()) {
    throw new OrdoError('SESSION_INVALID', 'Context snapshot id must not be empty')
  }
  return withSessionLock(repositoryRoot, sessionId, async () => {
    const detail = await readSession(repositoryRoot, sessionId)
    const now = new Date().toISOString()
    const next: SessionRecord = Object.freeze({
      ...detail.session,
      contextSnapshotId,
      updatedAt: now
    })
    const { recordPath } = sessionPaths(repositoryRoot, sessionId)
    await atomicWriteJson(recordPath as string, next)
    return next
  })
}

export async function readSessionEvents(
  repositoryRoot: string,
  sessionId: string
): Promise<readonly SessionEvent[]> {
  const { eventsPath } = sessionPaths(repositoryRoot, sessionId)
  if (!eventsPath || !(await fileExists(eventsPath))) {
    throw new OrdoError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
  }
  const content = await readFile(eventsPath, 'utf8')
  const events = content
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try {
        return assertEvent(JSON.parse(line), eventsPath)
      } catch (error) {
        if (error instanceof OrdoError) {
          throw error
        }
        throw new OrdoError('SESSION_INVALID', `Invalid session event JSON: ${eventsPath}`, {
          cause: error
        })
      }
    })
  events.forEach((event, index) => {
    if (event.sequence !== index + 1 || event.sessionId !== sessionId) {
      throw new OrdoError('SESSION_INVALID', `Session event sequence is invalid: ${eventsPath}`)
    }
  })
  return Object.freeze(events)
}

export async function readSession(
  repositoryRoot: string,
  sessionId: string
): Promise<SessionDetail> {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new OrdoError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
  }
  const { recordPath } = sessionPaths(repositoryRoot, sessionId)
  if (!recordPath || !(await fileExists(recordPath))) {
    throw new OrdoError('SESSION_NOT_FOUND', `Session not found: ${sessionId}`)
  }
  let session: SessionRecord
  try {
    session = assertSession(JSON.parse(await readFile(recordPath, 'utf8')), recordPath)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('SESSION_INVALID', `Invalid session JSON: ${recordPath}`, { cause: error })
  }
  return Object.freeze({ session, events: await readSessionEvents(repositoryRoot, sessionId) })
}

export async function listSessions(repositoryRoot: string): Promise<readonly SessionRecord[]> {
  const { directory } = sessionPaths(repositoryRoot)
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const sessions = await Promise.all(
      entries
        .filter(
          entry =>
            entry.isFile() &&
            SESSION_ID_PATTERN.test(entry.name.replace(/\.json$/, '')) &&
            entry.name.endsWith('.json')
        )
        .map(async entry => {
          const recordPath = path.join(directory, entry.name)
          return assertSession(JSON.parse(await readFile(recordPath, 'utf8')), recordPath)
        })
    )
    return Object.freeze(
      sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze([])
    }
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('SESSION_INVALID', 'Unable to list sessions', { cause: error })
  }
}

export async function appendSessionEvent(
  repositoryRoot: string,
  sessionId: string,
  options: AppendSessionEventOptions
): Promise<SessionEvent> {
  return withSessionLock(repositoryRoot, sessionId, async () => {
    const detail = await readSession(repositoryRoot, sessionId)
    const now = new Date().toISOString()
    const event: SessionEvent = Object.freeze({
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: randomUUID(),
      sessionId,
      sequence: detail.events.length + 1,
      timestamp: now,
      type: options.type,
      data: Object.freeze({ ...options.data })
    })
    const paths = sessionPaths(repositoryRoot, sessionId)
    await appendFile(paths.eventsPath as string, `${JSON.stringify(event)}\n`, 'utf8')
    await atomicWriteJson(paths.recordPath as string, { ...detail.session, updatedAt: now })
    return event
  })
}

export async function updateSessionStatus(
  repositoryRoot: string,
  sessionId: string,
  status: SessionStatus
): Promise<SessionRecord> {
  if (!SESSION_STATUSES.includes(status)) {
    throw new OrdoError('SESSION_INVALID', `Unsupported session status: ${status}`)
  }
  return withSessionLock(repositoryRoot, sessionId, async () => {
    const detail = await readSession(repositoryRoot, sessionId)
    const updated: SessionRecord = Object.freeze({
      ...detail.session,
      status,
      updatedAt: new Date().toISOString()
    })
    const { recordPath } = sessionPaths(repositoryRoot, sessionId)
    await atomicWriteJson(recordPath as string, updated)
    return updated
  })
}
