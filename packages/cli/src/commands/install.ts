import path from 'node:path'
import { claudeAdapter } from '@pompeitech/ordo-adapter-claude'
import { codexAdapter } from '@pompeitech/ordo-adapter-codex'
import {
  type AdapterId,
  AdapterRegistry,
  type InstallationTargetInput,
  inspectRepository,
  install,
  loadCatalog,
  loadConfig,
  loadInstallationState,
  OrdoError,
  planInstallation,
  resolveContentRoot,
  selectCatalogEntries,
  validateCatalog
} from '@pompeitech/ordo-core'

const adapters = new AdapterRegistry([claudeAdapter, codexAdapter])

export interface InstallRepositoryOptions {
  readonly directory: string
  readonly contentRoot?: string
  readonly dryRun?: boolean
}

export interface InstallActionReport {
  readonly type: 'create' | 'update' | 'remove' | 'skip'
  readonly reason: string
  readonly path: string
  readonly adapter: AdapterId
  readonly sourceId: string
  readonly kind: 'agents' | 'rules' | 'skills' | 'workflows'
}

export interface InstallConflictReport {
  readonly code: string
  readonly message: string
  readonly path: string
}

export interface InstallWarningReport {
  readonly adapter: AdapterId
  readonly code: string
  readonly message: string
  readonly path?: string
}

export interface InstallReport {
  readonly schemaVersion: 1
  readonly command: 'install'
  readonly repositoryRoot: string
  readonly configPath: string
  readonly contentRoot: string
  readonly targets: readonly AdapterId[]
  readonly dryRun: boolean
  readonly installed: boolean
  readonly actions: readonly InstallActionReport[]
  readonly conflicts: readonly InstallConflictReport[]
  readonly warnings: readonly InstallWarningReport[]
  readonly summary: {
    readonly created: number
    readonly updated: number
    readonly removed: number
    readonly skipped: number
    readonly conflicts: number
  }
}

function relativePath(repositoryRoot: string, candidate: string): string {
  return path.relative(repositoryRoot, candidate).split(path.sep).join('/') || '.'
}

export async function installRepository(options: InstallRepositoryOptions): Promise<InstallReport> {
  const repository = await inspectRepository(options.directory)
  const loadedConfig = await loadConfig({ cwd: repository.rootDirectory, optional: false })
  if (!loadedConfig.sourcePath) {
    throw new OrdoError('CONFIG_NOT_FOUND', 'No Ordo configuration file was found')
  }

  if (loadedConfig.config.targets.length === 0) {
    throw new OrdoError('CONFIG_INVALID', 'Configuration must contain at least one target')
  }

  const contentRoot = resolveContentRoot(
    repository.rootDirectory,
    loadedConfig.config.contentRoot,
    options.contentRoot
  )
  const catalog = await loadCatalog(contentRoot)
  const validation = validateCatalog(catalog)
  if (!validation.valid) {
    throw new OrdoError('CATALOG_INVALID', 'Content catalog validation failed', {
      details: { issues: validation.issues }
    })
  }

  const entries = selectCatalogEntries(catalog, loadedConfig.config.content)
  const warnings: InstallWarningReport[] = []
  const targets: InstallationTargetInput[] = []
  for (const targetConfig of loadedConfig.config.targets) {
    const adapter = adapters.get(targetConfig.adapter)
    const target = await adapter.resolveTarget(
      { repositoryRoot: repository.rootDirectory },
      targetConfig
    )
    const issues = await adapter.validate({ repositoryRoot: repository.rootDirectory }, target)
    const errors = issues.filter(issue => issue.severity === 'error')
    if (errors.length > 0) {
      throw new OrdoError('CONFIG_INVALID', `Invalid ${adapter.displayName} target`, {
        details: { issues: errors }
      })
    }

    warnings.push(
      ...issues
        .filter(issue => issue.severity === 'warning')
        .map(issue => ({
          adapter: adapter.id,
          code: issue.code,
          message: issue.message,
          ...(issue.path ? { path: relativePath(repository.rootDirectory, issue.path) } : {})
        }))
    )
    targets.push({ target, files: adapter.mapEntries(entries, target) })
  }

  const previousState = await loadInstallationState(repository.rootDirectory)
  const plan = await planInstallation({
    repositoryRoot: repository.rootDirectory,
    targets,
    previousState,
    conflictStrategy: loadedConfig.config.installation.conflictStrategy,
    prune: loadedConfig.config.installation.prune
  })
  const dryRun = options.dryRun ?? false
  const configuredTargets = loadedConfig.config.targets
    .map(target => target.adapter)
    .sort((left, right) => left.localeCompare(right))
  const actions = plan.actions.map(action => ({
    type: action.type,
    reason: action.reason,
    path: relativePath(repository.rootDirectory, action.destinationPath),
    adapter: action.record.adapter,
    sourceId: action.record.sourceId,
    kind: action.record.kind
  }))
  const conflicts = plan.conflicts.map(conflict => ({
    code: conflict.code,
    message: conflict.message,
    path: relativePath(repository.rootDirectory, conflict.destinationPath)
  }))
  const summary = {
    created: actions.filter(action => action.type === 'create').length,
    updated: actions.filter(action => action.type === 'update').length,
    removed: actions.filter(action => action.type === 'remove').length,
    skipped: actions.filter(action => action.type === 'skip').length,
    conflicts: conflicts.length
  }
  if (conflicts.length === 0) {
    await install(plan, { dryRun })
  }

  return Object.freeze({
    schemaVersion: 1,
    command: 'install',
    repositoryRoot: repository.rootDirectory,
    configPath: loadedConfig.sourcePath,
    contentRoot,
    targets: Object.freeze(configuredTargets),
    dryRun,
    installed: !dryRun && conflicts.length === 0,
    actions: Object.freeze(actions),
    conflicts: Object.freeze(conflicts),
    warnings: Object.freeze(warnings),
    summary: Object.freeze(summary)
  })
}
