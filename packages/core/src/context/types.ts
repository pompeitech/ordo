export type ContextEntryVisibility = 'visible' | 'hidden'

export interface ContextEntry {
  readonly id: string
  readonly path: string
  readonly visibility: ContextEntryVisibility
  readonly addedAt: string
}

export interface ContextManifest {
  readonly schemaVersion: 1
  readonly entries: readonly ContextEntry[]
}

export interface ContextBlock {
  readonly id: string
  readonly path: string
  readonly source: 'project-memory' | 'tracked-file'
  readonly content: string
  readonly bytes: number
  readonly estimatedTokens: number
}

export interface ContextEntryReport extends ContextEntry {
  readonly exists: boolean
  readonly bytes: number
  readonly estimatedTokens: number
}

export interface ContextReport {
  readonly schemaVersion: 1
  readonly command: 'context'
  readonly repositoryRoot: string
  readonly manifestPath: string
  readonly brainPath: string
  readonly initialized: boolean
  readonly entries: readonly ContextEntryReport[]
  readonly summary: {
    readonly visible: number
    readonly hidden: number
    readonly missing: number
    readonly estimatedTokens: number
  }
}

export interface ContextPreviewReport extends Omit<ContextReport, 'command'> {
  readonly command: 'context-preview'
  readonly blocks: readonly ContextBlock[]
  readonly payload: string
}

export interface ContextSnapshotBlock extends ContextBlock {
  readonly sha256: string
}

export interface ContextSnapshot {
  readonly schemaVersion: 1
  readonly id: string
  readonly createdAt: string
  readonly payloadSha256: string
  readonly estimatedTokens: number
  readonly blocks: readonly ContextSnapshotBlock[]
}

export interface ContextSnapshotReport extends Omit<ContextPreviewReport, 'command'> {
  readonly command: 'context-snapshot'
  readonly snapshotPath: string
  readonly snapshot: ContextSnapshot
  readonly created: boolean
}
