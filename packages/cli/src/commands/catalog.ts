import {
  type ContentKind,
  type FrontmatterValue,
  inspectRepository,
  loadCatalog,
  loadConfig,
  OrdoError,
  resolveContentRoot,
  validateCatalog
} from '@pompeitech/ordo-core'

export interface InspectCatalogOptions {
  readonly directory: string
  readonly kind: ContentKind
  readonly contentRoot?: string
  readonly id?: string
}

export interface CatalogEntryReport {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly path: string
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>
  readonly content?: string
}

export interface CatalogInspectionReport {
  readonly schemaVersion: 1
  readonly command: ContentKind
  readonly repositoryRoot: string
  readonly contentRoot: string
  readonly selectedId: string | null
  readonly count: number
  readonly entries: readonly CatalogEntryReport[]
}

export async function inspectCatalog(
  options: InspectCatalogOptions
): Promise<CatalogInspectionReport> {
  const repository = await inspectRepository(options.directory)
  const loadedConfig = await loadConfig({ cwd: repository.rootDirectory, optional: true })
  const contentRoot = resolveContentRoot(
    repository.rootDirectory,
    loadedConfig.config.contentRoot,
    options.contentRoot
  )
  const catalog = await loadCatalog(contentRoot, { kinds: [options.kind] })
  const validation = validateCatalog(catalog)
  const blockingIssues = validation.issues.filter(
    issue => issue.severity === 'error' && issue.code !== 'empty-catalog'
  )
  if (blockingIssues.length > 0) {
    throw new OrdoError('CATALOG_INVALID', `${options.kind} catalog validation failed`, {
      details: { issues: blockingIssues }
    })
  }

  const selected = options.id
    ? catalog.entries.filter(entry => entry.id === options.id)
    : catalog.entries
  if (options.id && selected.length === 0) {
    throw new OrdoError('CATALOG_INVALID', `Unknown ${options.kind} catalog entry: ${options.id}`)
  }

  const entries = selected.map(entry =>
    Object.freeze({
      id: entry.id,
      name: entry.name,
      description: entry.description ?? null,
      path: entry.relativePath,
      frontmatter: entry.frontmatter,
      ...(options.id ? { content: entry.content } : {})
    })
  )

  return Object.freeze({
    schemaVersion: 1,
    command: options.kind,
    repositoryRoot: repository.rootDirectory,
    contentRoot,
    selectedId: options.id ?? null,
    count: entries.length,
    entries: Object.freeze(entries)
  })
}
