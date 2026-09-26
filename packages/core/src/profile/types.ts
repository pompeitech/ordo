export type ProfileEntryMode = 'enabled' | 'recommended' | 'default' | 'required' | 'disabled'

export type ProfileCatalogKind = 'agents' | 'rules' | 'skills' | 'workflows'

export interface ProfileCatalogEntry {
  readonly id: string
  readonly mode: ProfileEntryMode
  readonly contentSha256: string
}

export type ProfileCatalogReference = Pick<ProfileCatalogEntry, 'id' | 'mode' | 'contentSha256'>

export interface ProjectProfile {
  readonly schemaVersion: 1
  readonly createdAt: string
  readonly updatedAt: string
  readonly catalogSha256: string
  readonly agents: readonly ProfileCatalogEntry[]
  readonly rules: readonly ProfileCatalogEntry[]
  readonly skills: readonly ProfileCatalogEntry[]
  readonly workflows: readonly ProfileCatalogEntry[]
}

export interface InitializeProfileOptions {
  readonly agentIds?: readonly string[]
  readonly ruleIds?: readonly string[]
  readonly skillIds?: readonly string[]
  readonly defaultAgentId?: string
}

export interface ProfileValidationReport {
  readonly valid: boolean
  readonly profile?: ProjectProfile
  readonly errors: readonly string[]
}

export interface ProfileSessionSelection {
  readonly profileSha256: string
  readonly agent?: ProfileCatalogReference
  readonly skills: readonly ProfileCatalogReference[]
  readonly rules: readonly ProfileCatalogReference[]
  readonly workflows: readonly ProfileCatalogReference[]
}
