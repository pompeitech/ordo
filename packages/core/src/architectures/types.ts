export type ArchitectureStatus = 'proposed' | 'approved' | 'superseded'

export interface ArchitectureComponent {
  readonly name: string
  readonly responsibility: string
  readonly changes: readonly string[]
}

export interface ArchitectureProposal {
  readonly schemaVersion: 1
  readonly id: string
  readonly title: string
  readonly specId: string
  readonly status: ArchitectureStatus
  readonly impact: readonly string[]
  readonly components: readonly ArchitectureComponent[]
  readonly contracts: readonly string[]
  readonly decisions: readonly string[]
  readonly risks: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly approvedAt?: string
}

export interface CreateArchitectureOptions {
  readonly id?: string
  readonly title: string
  readonly specId: string
  readonly impact: readonly string[]
  readonly components: readonly ArchitectureComponent[]
  readonly contracts: readonly string[]
  readonly decisions: readonly string[]
  readonly risks?: readonly string[]
}
