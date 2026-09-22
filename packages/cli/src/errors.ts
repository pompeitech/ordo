import { isOrdoError } from '@pompeitech/ordo-core'

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export function formatCliError(error: unknown): string {
  if (isOrdoError(error)) {
    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
