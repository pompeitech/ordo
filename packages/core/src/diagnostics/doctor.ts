import type { AdapterRegistry } from '../adapters/registry.js'
import { loadCatalog } from '../catalog/loader.js'
import { validateCatalog } from '../catalog/validator.js'
import { loadConfig } from '../config/loader.js'
import { resolveContentRoot } from '../config/paths.js'
import { detectPackageManager } from '../detection/package-manager.js'
import { inspectRepository } from '../detection/repository.js'
import { loadInstallationState } from '../installation/state.js'
import type { DiagnosticFinding } from './checks.js'

export interface DoctorOptions {
  readonly cwd?: string
  readonly configPath?: string
  readonly contentRoot?: string
  readonly adapters?: AdapterRegistry
}

export interface DoctorReport {
  readonly healthy: boolean
  readonly repositoryRoot: string | null
  readonly findings: readonly DiagnosticFinding[]
  readonly summary: Readonly<Record<DiagnosticFinding['severity'], number>>
}

function finding(
  checkId: string,
  severity: DiagnosticFinding['severity'],
  message: string,
  extra: Pick<DiagnosticFinding, 'path' | 'remediation'> = {}
): DiagnosticFinding {
  return { checkId, severity, message, ...extra }
}

export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const findings: DiagnosticFinding[] = []
  let repository
  try {
    repository = await inspectRepository(options.cwd)
    findings.push(
      finding('repository', 'pass', 'Repository root resolved', {
        path: repository.rootDirectory
      })
    )
  } catch (error) {
    findings.push(
      finding('repository', 'error', error instanceof Error ? error.message : String(error))
    )
    return createReport(null, findings)
  }

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10)
  findings.push(
    finding(
      'runtime',
      nodeMajor >= 20 ? 'pass' : 'error',
      nodeMajor >= 20
        ? `Node.js ${process.versions.node} is supported`
        : 'Node.js 20 or newer is required'
    )
  )

  const packageManager = await detectPackageManager(repository)
  findings.push(
    finding(
      'package-manager',
      packageManager.conflicts.length > 0
        ? 'warning'
        : packageManager.status === 'detected'
          ? 'pass'
          : packageManager.status === 'ambiguous'
            ? 'warning'
            : 'info',
      packageManager.selected
        ? packageManager.conflicts.length > 0
          ? `Package manager ${packageManager.selected} conflicts with: ${packageManager.conflicts.join(', ')}`
          : `Package manager detected: ${packageManager.selected}`
        : packageManager.status === 'ambiguous'
          ? 'Multiple package-manager lockfiles were found'
          : 'No package manager was detected'
    )
  )

  let loadedConfig
  try {
    loadedConfig = await loadConfig({
      cwd: repository.rootDirectory,
      filePath: options.configPath,
      optional: true
    })
    findings.push(
      finding(
        'configuration',
        loadedConfig.sourcePath ? 'pass' : 'info',
        loadedConfig.sourcePath ? 'Configuration is valid' : 'Using default configuration',
        loadedConfig.sourcePath ? { path: loadedConfig.sourcePath } : {}
      )
    )
  } catch (error) {
    findings.push(
      finding('configuration', 'error', error instanceof Error ? error.message : String(error))
    )
  }

  const contentRoot = resolveContentRoot(
    repository.rootDirectory,
    loadedConfig?.config.contentRoot,
    options.contentRoot
  )
  try {
    const validation = validateCatalog(await loadCatalog(contentRoot))
    if (validation.issues.length === 0) {
      findings.push(finding('catalog', 'pass', 'Content catalog is valid', { path: contentRoot }))
    } else {
      findings.push(
        ...validation.issues.map(item =>
          finding('catalog', item.severity, item.message, { path: item.path })
        )
      )
    }
  } catch (error) {
    findings.push(
      finding('catalog', 'error', error instanceof Error ? error.message : String(error))
    )
  }

  try {
    const state = await loadInstallationState(repository.rootDirectory)
    findings.push(
      finding(
        'installation-state',
        'pass',
        `Installation state contains ${state.files.length} files`
      )
    )
  } catch (error) {
    findings.push(
      finding('installation-state', 'error', error instanceof Error ? error.message : String(error))
    )
  }

  if (loadedConfig && loadedConfig.config.targets.length > 0 && !options.adapters) {
    findings.push(
      finding(
        'adapter-registry',
        'warning',
        `Configured adapters were not validated: ${loadedConfig.config.targets.map(target => target.adapter).join(', ')}`
      )
    )
  }

  if (loadedConfig && options.adapters) {
    for (const target of loadedConfig.config.targets) {
      if (!options.adapters.has(target.adapter)) {
        findings.push(
          finding(
            `adapter:${target.adapter}`,
            'error',
            `Adapter is not registered: ${target.adapter}`
          )
        )
        continue
      }

      const adapter = options.adapters.get(target.adapter)
      findings.push(
        finding(`adapter:${target.adapter}`, 'pass', `Adapter is registered: ${target.adapter}`)
      )
      try {
        const context = { repositoryRoot: repository.rootDirectory }
        const detection = await adapter.detect(context)
        const resolvedTarget = await adapter.resolveTarget(context, target)
        if (!detection.detected) {
          findings.push(
            finding(`adapter:${target.adapter}:detection`, 'info', 'Harness is not present yet')
          )
        }

        const adapterIssues = await adapter.validate(context, resolvedTarget)
        findings.push(
          ...adapterIssues.map(item =>
            finding(`adapter:${target.adapter}:validation`, item.severity, item.message, {
              path: item.path
            })
          )
        )
      } catch (error) {
        findings.push(
          finding(
            `adapter:${target.adapter}:validation`,
            'error',
            error instanceof Error ? error.message : String(error)
          )
        )
      }
    }
  }

  return createReport(repository.rootDirectory, findings)
}

function createReport(
  repositoryRoot: string | null,
  findings: readonly DiagnosticFinding[]
): DoctorReport {
  const summary = { pass: 0, info: 0, warning: 0, error: 0 }
  for (const item of findings) {
    summary[item.severity] += 1
  }

  return Object.freeze({
    healthy: summary.error === 0,
    repositoryRoot,
    findings: Object.freeze([...findings]),
    summary: Object.freeze(summary)
  })
}
