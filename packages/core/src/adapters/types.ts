import type { CatalogEntry } from '../catalog/types.js'
import type { AdapterId, AdapterTargetConfig, ContentKind } from '../config/schema.js'

export interface AdapterContext {
  readonly repositoryRoot: string
}

export interface AdapterDetectionResult {
  readonly detected: boolean
  readonly evidence: readonly string[]
}

export interface AdapterTarget {
  readonly adapter: AdapterId
  readonly rootDirectory: string
}

export interface AdapterOutputFile {
  readonly relativePath: string
  readonly content: string
  readonly sourceId: string
  readonly kind: ContentKind
}

export interface AdapterValidationIssue {
  readonly code: string
  readonly message: string
  readonly severity: 'error' | 'warning'
  readonly path?: string
}

export interface OrdoAdapter {
  readonly id: AdapterId
  readonly displayName: string
  readonly supportedContent: readonly ContentKind[]
  detect(context: AdapterContext): Promise<AdapterDetectionResult>
  resolveTarget(context: AdapterContext, config: AdapterTargetConfig): Promise<AdapterTarget>
  mapEntries(entries: readonly CatalogEntry[], target: AdapterTarget): readonly AdapterOutputFile[]
  validate(
    context: AdapterContext,
    target: AdapterTarget
  ): Promise<readonly AdapterValidationIssue[]>
}
