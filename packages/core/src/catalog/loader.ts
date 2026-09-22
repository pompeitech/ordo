import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ContentKind, ContentSelectionConfig } from '../config/schema.js'
import { OrdoError } from '../errors/ordo-error.js'
import type { CatalogEntry, ContentCatalog, FrontmatterValue } from './types.js'

export interface LoadCatalogOptions {
  readonly kinds?: readonly ContentKind[]
}

interface ParsedMarkdown {
  readonly body: string
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>
}

function parseScalar(value: string): FrontmatterValue {
  const trimmed = value.trim()
  if (trimmed === 'true') {
    return true
  }

  if (trimmed === 'false') {
    return false
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }

  return trimmed.replace(/^['"]|['"]$/g, '')
}

export function parseMarkdownFrontmatter(content: string): ParsedMarkdown {
  const normalized = content.replace(/^\uFEFF/, '')
  const lines = normalized.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return { body: normalized, frontmatter: {} }
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) {
    return { body: normalized, frontmatter: {} }
  }

  const frontmatter: Record<string, FrontmatterValue> = {}
  for (const line of lines.slice(1, end)) {
    if (/^\s/.test(line)) {
      continue
    }

    const separator = line.indexOf(':')
    if (separator < 1) {
      continue
    }

    frontmatter[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1))
  }

  return {
    body: lines
      .slice(end + 1)
      .join('\n')
      .replace(/^\n/, ''),
    frontmatter: Object.freeze(frontmatter)
  }
}

async function walkMarkdownFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new OrdoError('CATALOG_INVALID', `Catalog symlinks are not supported: ${entryPath}`)
    }

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownFiles(entryPath)))
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath)
    }
  }

  return files
}

function fallbackId(kind: ContentKind, relativePath: string): string {
  if (kind === 'skills') {
    return relativePath.split('/').at(-2) ?? 'unknown'
  }

  return relativePath
    .replace(new RegExp(`^${kind}/`), '')
    .replace(/\.md$/i, '')
    .split('/')
    .join('-')
}

function shouldLoad(kind: ContentKind, filePath: string): boolean {
  const name = path.basename(filePath)
  if (name.toLowerCase() === 'readme.md') {
    return false
  }

  return kind !== 'skills' || name === 'SKILL.md'
}

async function loadKind(rootDirectory: string, kind: ContentKind): Promise<CatalogEntry[]> {
  const directory = path.join(rootDirectory, kind)
  let files: readonly string[]
  try {
    files = await walkMarkdownFiles(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    throw error
  }

  const entries: CatalogEntry[] = []
  for (const sourcePath of files) {
    if (!shouldLoad(kind, sourcePath)) {
      continue
    }

    const content = await readFile(sourcePath, 'utf8')
    const parsed = parseMarkdownFrontmatter(content)
    const relativePath = path.relative(rootDirectory, sourcePath).split(path.sep).join('/')
    const id = String(parsed.frontmatter.name ?? fallbackId(kind, relativePath))
    entries.push(
      Object.freeze({
        id,
        kind,
        name: String(parsed.frontmatter.name ?? id),
        description:
          typeof parsed.frontmatter.description === 'string'
            ? parsed.frontmatter.description
            : undefined,
        sourcePath,
        relativePath,
        content,
        body: parsed.body,
        frontmatter: parsed.frontmatter
      })
    )
  }

  return entries
}

export async function loadCatalog(
  rootDirectory: string,
  options: LoadCatalogOptions = {}
): Promise<ContentCatalog> {
  const root = path.resolve(rootDirectory)
  try {
    if (!(await stat(root)).isDirectory()) {
      throw new OrdoError('CATALOG_INVALID', `Catalog root is not a directory: ${root}`)
    }
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }

    throw new OrdoError('CATALOG_INVALID', `Catalog root was not found: ${root}`, { cause: error })
  }

  const kinds = options.kinds ?? (['agents', 'rules', 'skills', 'workflows'] as const)
  const entries = (await Promise.all(kinds.map(kind => loadKind(root, kind))))
    .flat()
    .sort((left, right) => `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`))
  return Object.freeze({ rootDirectory: root, entries: Object.freeze(entries) })
}

export function getCatalogEntries(
  catalog: ContentCatalog,
  kind: ContentKind
): readonly CatalogEntry[] {
  return catalog.entries.filter(entry => entry.kind === kind)
}

export function selectCatalogEntries(
  catalog: ContentCatalog,
  selection: ContentSelectionConfig
): readonly CatalogEntry[] {
  for (const [kind, filter] of Object.entries(selection) as [
    ContentKind,
    ContentSelectionConfig[ContentKind]
  ][]) {
    if (!filter) {
      continue
    }

    const available = new Set(
      catalog.entries.filter(entry => entry.kind === kind).map(entry => entry.id)
    )
    const missing = [...(filter.include ?? []), ...(filter.exclude ?? [])].find(
      id => !available.has(id)
    )
    if (missing) {
      throw new OrdoError('CATALOG_INVALID', `Unknown ${kind} catalog entry: ${missing}`)
    }
  }

  return Object.freeze(
    catalog.entries.filter(entry => {
      const filter = selection[entry.kind]
      if (filter?.include && !filter.include.includes(entry.id)) {
        return false
      }

      return !filter?.exclude?.includes(entry.id)
    })
  )
}
