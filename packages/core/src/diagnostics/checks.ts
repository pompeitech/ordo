export type DiagnosticSeverity = 'pass' | 'info' | 'warning' | 'error'

export interface DiagnosticFinding {
  readonly checkId: string
  readonly severity: DiagnosticSeverity
  readonly message: string
  readonly path?: string
  readonly remediation?: string
}

export interface DiagnosticContext {
  readonly repositoryRoot: string
}

export interface DiagnosticCheck {
  readonly id: string
  run(context: DiagnosticContext): Promise<readonly DiagnosticFinding[]>
}

export async function runDiagnosticChecks(
  checks: readonly DiagnosticCheck[],
  context: DiagnosticContext
): Promise<readonly DiagnosticFinding[]> {
  const findings: DiagnosticFinding[] = []
  for (const check of checks) {
    try {
      findings.push(...(await check.run(context)))
    } catch (error) {
      findings.push({
        checkId: check.id,
        severity: 'error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return Object.freeze(findings)
}
