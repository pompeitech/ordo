import type { ContentKind } from '../config/schema.js'

export type FrontmatterValue = string | number | boolean | readonly string[]

export interface CatalogEntry {
  readonly id: string
  readonly kind: ContentKind
  readonly name: string
  readonly description?: string
  readonly sourcePath: string
  readonly relativePath: string
  readonly content: string
  readonly body: string
  readonly frontmatter: Readonly<Record<string, FrontmatterValue>>
}

export interface ContentCatalog {
  readonly rootDirectory: string
  readonly entries: readonly CatalogEntry[]
}

export type CatalogIssueSeverity = 'error' | 'warning'

export interface CatalogValidationIssue {
  readonly code: string
  readonly severity: CatalogIssueSeverity
  readonly message: string
  readonly path?: string
  readonly entryId?: string
}

export interface CatalogValidationResult {
  readonly valid: boolean
  readonly issues: readonly CatalogValidationIssue[]
}
