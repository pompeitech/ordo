export const ORDO_CONFIG_VERSION = 1 as const

export type OrdoConfigVersion = typeof ORDO_CONFIG_VERSION
export type AdapterId = 'claude' | 'codex'
export type ContentKind = 'agents' | 'rules' | 'skills' | 'workflows'
export type ConflictStrategy = 'error' | 'overwrite' | 'skip'

export interface ContentFilterConfig {
  readonly include?: readonly string[]
  readonly exclude?: readonly string[]
}

export type ContentSelectionConfig = {
  readonly [Kind in ContentKind]?: ContentFilterConfig
}

export interface AdapterTargetConfig {
  readonly adapter: AdapterId
  readonly outputDirectory?: string
}

export interface InstallationConfig {
  readonly conflictStrategy?: ConflictStrategy
  readonly prune?: boolean
}

export interface OrdoConfig {
  readonly schemaVersion: OrdoConfigVersion
  readonly targets: readonly AdapterTargetConfig[]
  readonly contentRoot?: string
  readonly content?: ContentSelectionConfig
  readonly installation?: InstallationConfig
}

export interface ResolvedOrdoConfig extends OrdoConfig {
  readonly content: ContentSelectionConfig
  readonly installation: Required<InstallationConfig>
}
