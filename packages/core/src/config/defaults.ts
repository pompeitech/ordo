import {
  type ContentSelectionConfig,
  type InstallationConfig,
  ORDO_CONFIG_VERSION,
  type ResolvedOrdoConfig
} from './schema.js'

export const DEFAULT_CONTENT_SELECTION = Object.freeze({}) satisfies ContentSelectionConfig

export const DEFAULT_INSTALLATION_CONFIG = Object.freeze({
  conflictStrategy: 'error',
  prune: false
}) satisfies Required<InstallationConfig>

export const DEFAULT_ORDO_CONFIG = Object.freeze({
  schemaVersion: ORDO_CONFIG_VERSION,
  targets: Object.freeze([]),
  content: DEFAULT_CONTENT_SELECTION,
  installation: DEFAULT_INSTALLATION_CONFIG
}) satisfies ResolvedOrdoConfig
