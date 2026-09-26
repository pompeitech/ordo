export type ExploreStatus = 'intent' | 'diverging' | 'converging' | 'crystallized' | 'archived'

export interface ExploreAlternative {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly benefits: readonly string[]
  readonly tradeoffs: readonly string[]
  readonly risks: readonly string[]
  readonly createdAt: string
}

export interface ExploreRecord {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly problem: string
  readonly status: ExploreStatus
  readonly assumptions: readonly string[]
  readonly openQuestions: readonly string[]
  readonly alternatives: readonly ExploreAlternative[]
  readonly selectedAlternativeId?: string
  readonly specId?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateExploreOptions {
  readonly id?: string
  readonly title: string
  readonly problem: string
  readonly assumptions?: readonly string[]
  readonly openQuestions?: readonly string[]
}

export interface AddExploreAlternativeOptions {
  readonly id?: string
  readonly title: string
  readonly summary: string
  readonly benefits?: readonly string[]
  readonly tradeoffs: readonly string[]
  readonly risks?: readonly string[]
}
