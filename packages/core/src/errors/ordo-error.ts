export type OrdoErrorCode =
  | 'ADAPTER_DUPLICATE'
  | 'ADAPTER_NOT_FOUND'
  | 'CATALOG_INVALID'
  | 'CONFIG_INVALID'
  | 'CONFIG_NOT_FOUND'
  | 'DECISION_INVALID'
  | 'INSTALLATION_CONFLICT'
  | 'INSTALLATION_FAILED'
  | 'PATH_UNSAFE'
  | 'REPOSITORY_NOT_FOUND'
  | 'STATE_INVALID'
  | 'WORKFLOW_INVALID'
  | 'WORKFLOW_TRANSITION_INVALID'

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
