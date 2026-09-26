import type { ProfileSessionSelection } from '../profile/types.js'

export type SessionStatus = 'active' | 'paused' | 'completed' | 'archived' | 'error'

export type SessionEventType =
  | 'message'
  | 'tool-call'
  | 'tool-result'
  | 'approval'
  | 'diff'
  | 'verification'
  | 'usage'
  | 'status'
  | 'note'

export interface SessionRuntime {
  readonly provider: string
  readonly model: string
}

export interface SessionRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly repositoryRoot: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: SessionStatus
  readonly runtime?: SessionRuntime
  readonly profileSelection?: ProfileSessionSelection
  readonly contextSnapshotId?: string
  readonly branch?: string
  readonly headCommit?: string
}

export interface SessionEvent {
  readonly schemaVersion: 1
  readonly id: string
  readonly sessionId: string
  readonly sequence: number
  readonly timestamp: string
  readonly type: SessionEventType
  readonly data: Readonly<Record<string, unknown>>
}

export interface SessionDetail {
  readonly session: SessionRecord
  readonly events: readonly SessionEvent[]
}

export interface CreateSessionOptions {
  readonly title: string
  readonly runtime?: SessionRuntime
  readonly profileSelection?: ProfileSessionSelection
  readonly contextSnapshotId?: string
  readonly branch?: string
  readonly headCommit?: string
}

export interface AppendSessionEventOptions {
  readonly type: SessionEventType
  readonly data: Readonly<Record<string, unknown>>
}
