export type OrdoErrorCode =
  | 'ADAPTER_DUPLICATE'
  | 'ADAPTER_NOT_FOUND'
  | 'ARCHITECTURE_INVALID'
  | 'AUDIT_INVALID'
  | 'ARCHITECTURE_NOT_FOUND'
  | 'CATALOG_INVALID'
  | 'CONFIG_INVALID'
  | 'CONFIG_NOT_FOUND'
  | 'CONTEXT_INVALID'
  | 'CONTEXT_NOT_FOUND'
  | 'DECISION_INVALID'
  | 'EXPLORE_INVALID'
  | 'EXPLORE_NOT_FOUND'
  | 'INSTALLATION_CONFLICT'
  | 'INSTALLATION_FAILED'
  | 'PATH_UNSAFE'
  | 'REPOSITORY_NOT_FOUND'
  | 'SESSION_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SPEC_INVALID'
  | 'SPEC_NOT_FOUND'
  | 'STATE_INVALID'
  | 'PLAN_INVALID'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_TRANSITION_INVALID'
  | 'PROFILE_INVALID'
  | 'PROFILE_NOT_FOUND'
  | 'WORKFLOW_INVALID'
  | 'WORKFLOW_TRANSITION_INVALID'
  | 'WORKSPACE_SNAPSHOT_FAILED'

export interface OrdoErrorOptions {
  readonly cause?: unknown
  readonly details?: Readonly<Record<string, unknown>>
}

export class OrdoError extends Error {
  readonly code: OrdoErrorCode
  readonly details?: Readonly<Record<string, unknown>>

  constructor(code: OrdoErrorCode, message: string, options: OrdoErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'OrdoError'
    this.code = code
    this.details = options.details
  }
}

export function isOrdoError(error: unknown): error is OrdoError {
  return error instanceof OrdoError
}
