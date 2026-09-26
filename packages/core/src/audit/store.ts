import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'

export type AuditArtifactKind = 'explore' | 'spec' | 'architecture' | 'plan'

/** A person, a coding agent acting for one, or Ordo itself (automatic transitions). */
export type ActorType = 'human' | 'agent' | 'system'

/** Optional context a caller gives a state transition; it is written to the audit log. */
export interface TransitionContext {
  readonly actorType?: ActorType
  readonly reason?: string
}

export type AuditAction =
  | 'created'
  | 'status-changed'
  | 'alternative-selected'
  | 'crystallized'
  | 'approved'
  | 'step-started'
  | 'step-finished'
  | 'reviewed'

/**
 * One workflow transition. Audit files are shared in Git with the rest of `.ordo/`,
 * so they carry only what the team already sees in commits: a display name, never
 * emails, tokens or content.
 */
export interface AuditEvent {
  readonly schemaVersion: 1
  readonly id: string
  readonly at: string
  readonly kind: AuditArtifactKind
  readonly artifactId: string
  readonly action: AuditAction
  readonly from?: string
  readonly to?: string
  readonly stepId?: string
  readonly actor?: string
  /** Absent only in events written before actor types were recorded. */
  readonly actorType?: ActorType
  /** Related artifact, e.g. the spec an exploration crystallized into or a step's session. */
  readonly ref?: { readonly kind: string; readonly id: string }
  readonly reason?: string
  /** For a review: which files the agent changed were kept and which were undone. */
  readonly files?: { readonly accepted: readonly string[]; readonly rejected: readonly string[] }
}

export type AuditEventInput = Omit<
  AuditEvent,
  'schemaVersion' | 'id' | 'at' | 'actor' | 'actorType'
> & {
  readonly actor?: string
  readonly actorType?: ActorType
  readonly at?: string
}

const ACTOR_TYPES: readonly ActorType[] = ['human', 'agent', 'system']

/** `ORDO_ACTOR_TYPE` lets an automation declare itself; everything else is a person. */
export function resolveActorType(env: NodeJS.ProcessEnv = process.env): ActorType {
  const declared = env.ORDO_ACTOR_TYPE?.trim() as ActorType | undefined
  return declared && ACTOR_TYPES.includes(declared) ? declared : 'human'
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const KINDS: readonly AuditArtifactKind[] = ['explore', 'spec', 'architecture', 'plan']

function auditPath(repositoryRoot: string, kind: AuditArtifactKind, id: string): string {
  if (!KINDS.includes(kind) || !ID_PATTERN.test(id)) {
    throw new OrdoError('AUDIT_INVALID', `Invalid audit target: ${kind}/${id}`)
  }
  return path.join(repositoryRoot, '.ordo', 'audit', kind, `${id}.jsonl`)
}

function gitUserName(repositoryRoot: string): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(
      'git',
      ['config', 'user.name'],
      { cwd: repositoryRoot, timeout: 3000 },
      (error, stdout) => resolve(error ? undefined : stdout.trim() || undefined)
    )
  })
}

/** Who performs a transition: `ORDO_ACTOR`, else Git's `user.name`, else unknown. */
export async function resolveActor(
  repositoryRoot: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
  return env.ORDO_ACTOR?.trim() || (await gitUserName(repositoryRoot))
}

export async function appendAuditEvent(
  repositoryRoot: string,
  input: AuditEventInput
): Promise<AuditEvent> {
  const target = auditPath(repositoryRoot, input.kind, input.artifactId)
  const actorType = input.actorType ?? resolveActorType()
  const event: AuditEvent = Object.freeze({
    schemaVersion: 1,
    id: randomUUID(),
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    artifactId: input.artifactId,
    action: input.action,
    from: input.from,
    to: input.to,
    stepId: input.stepId,
    // Automatic transitions are Ordo's, not the person who happened to run the command.
    actor: input.actor ?? (actorType === 'system' ? 'Ordo' : await resolveActor(repositoryRoot)),
    actorType,
    ref: input.ref,
    reason: input.reason,
    files: input.files
  })
  await mkdir(path.dirname(target), { recursive: true })
  await appendFile(target, `${JSON.stringify(event)}\n`)
  return event
}

/** Events for one artifact, oldest first. Malformed lines are skipped, not fatal. */
export async function readAuditEvents(
  repositoryRoot: string,
  kind: AuditArtifactKind,
  id: string
): Promise<readonly AuditEvent[]> {
  let content: string
  try {
    content = await readFile(auditPath(repositoryRoot, kind, id), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze([])
    }
    throw error
  }
  const events: AuditEvent[] = []
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue
    }
    try {
      const value = JSON.parse(line) as AuditEvent
      if (value?.schemaVersion === 1 && value.kind === kind && value.artifactId === id) {
        events.push(Object.freeze(value))
      }
    } catch {
      // A torn or hand-edited line must not hide the rest of the history.
    }
  }
  return Object.freeze(events.sort((left, right) => left.at.localeCompare(right.at)))
}
