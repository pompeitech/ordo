export type SpecStatus = 'draft' | 'ready' | 'implemented' | 'verified' | 'superseded'

export interface SpecRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly status: SpecStatus
  readonly createdAt: string
  readonly updatedAt: string
  readonly objective: string
  readonly nonGoals: string
  readonly actors: string
  readonly requirements: string
  readonly constraints: string
  readonly acceptanceCriteria: string
  readonly risks: string
  readonly path: string
}

export interface CreateSpecOptions {
  readonly id?: string
  readonly title: string
  readonly objective: string
  readonly nonGoals?: string
  readonly actors?: string
  readonly requirements?: string
  readonly constraints?: string
  readonly acceptanceCriteria: string
  readonly risks?: string
  readonly status?: SpecStatus
}

export interface SpecValidationReport {
  readonly valid: boolean
  readonly spec?: SpecRecord
  readonly errors: readonly string[]
}

export interface SpecCreationPreview {
  readonly spec: SpecRecord
  readonly content: string
}
