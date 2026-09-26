import { createHash } from 'node:crypto'
import { access } from 'node:fs/promises'
import path from 'node:path'
import {
  type CatalogEntry,
  loadCatalog,
  loadConfig,
  type ProfileCatalogKind,
  type ProfileEntryMode,
  type ProfileSuggestion,
  type ProjectProfile,
  resolveContentRoot,
  resolveProfileSessionSelection,
  validateCatalog
} from '@pompeitech/ordo-core'

export const PROFILE_KINDS: readonly ProfileCatalogKind[] = [
  'agents',
  'skills',
  'rules',
  'workflows'
]
export const PROFILE_MODES: readonly ProfileEntryMode[] = [
  'required',
  'default',
  'recommended',
  'enabled',
  'disabled'
]

export type ContentSource = 'config' | 'repository' | 'bundled'

export interface ResolvedContentRoot {
  readonly root: string
  readonly source: ContentSource
}

async function isCatalogRoot(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    const catalog = await loadCatalog(candidate)
    return catalog.entries.length > 0 && validateCatalog(catalog).valid
  } catch {
    return false
  }
}

/**
 * The shared catalog the team profile refers to: an explicit `contentRoot` in the
 * project config wins, then the repository's own `content/`, then the catalog that
 * ships with Ordo.
 */
export async function resolveProfileContentRoot(
  repositoryRoot: string,
  bundledRoot: string
): Promise<ResolvedContentRoot> {
  const configured = await loadConfig({ cwd: repositoryRoot, optional: true })
  if (configured.config.contentRoot) {
    return {
      root: resolveContentRoot(repositoryRoot, configured.config.contentRoot),
      source: 'config'
    }
  }
  const repositoryContent = path.join(repositoryRoot, 'content')
  if (await isCatalogRoot(repositoryContent)) {
    return { root: repositoryContent, source: 'repository' }
  }
  return { root: bundledRoot, source: 'bundled' }
}

export interface ProfileItemView {
  readonly id: string
  readonly name: string
  readonly description?: string
  /** Undefined when the catalog entry is not part of the team profile. */
  readonly mode?: ProfileEntryMode
  /** The catalog entry changed after the profile recorded it and needs review. */
  readonly changed: boolean
  /** The profile references an entry that the catalog no longer contains. */
  readonly missing: boolean
}

export interface ProfileKindView {
  readonly kind: ProfileCatalogKind
  readonly items: readonly ProfileItemView[]
}

export interface SessionPreview {
  readonly agent?: string
  readonly agentRequired: boolean
  readonly skills: readonly string[]
  readonly rules: readonly string[]
  readonly workflows: number
  readonly problem?: string
}

export interface SuggestionView {
  readonly kind: 'skills' | 'rules'
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly suggestedMode: ProfileSuggestion['suggestedMode']
  /** Why it is suggested, e.g. "Fastify (package:fastify)". */
  readonly reasons: readonly string[]
}

export interface ProfileView {
  readonly exists: boolean
  readonly contentRoot: string
  readonly contentSource: ContentSource
  readonly kinds: readonly ProfileKindView[]
  readonly errors: readonly string[]
  readonly session?: SessionPreview
  readonly suggestions: readonly SuggestionView[]
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function buildProfileView(
  entries: readonly CatalogEntry[],
  profile: ProjectProfile | undefined,
  errors: readonly string[],
  content: ResolvedContentRoot,
  suggestions: readonly ProfileSuggestion[] = []
): ProfileView {
  const kinds = PROFILE_KINDS.map(kind => {
    const catalogEntries = entries.filter(entry => entry.kind === kind)
    const profileEntries = profile?.[kind] ?? []
    const items: ProfileItemView[] = catalogEntries.map(entry => {
      const recorded = profileEntries.find(candidate => candidate.id === entry.id)
      return {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        mode: recorded?.mode,
        changed: recorded ? recorded.contentSha256 !== sha256(entry.content) : false,
        missing: false
      }
    })
    for (const recorded of profileEntries) {
      if (!catalogEntries.some(entry => entry.id === recorded.id)) {
        items.push({
          id: recorded.id,
          name: recorded.id,
          mode: recorded.mode,
          changed: false,
          missing: true
        })
      }
    }
    items.sort((left, right) => left.name.localeCompare(right.name))
    return { kind, items }
  })
  return {
    exists: Boolean(profile),
    contentRoot: content.root,
    contentSource: content.source,
    kinds,
    errors,
    session: profile ? previewSession(profile) : undefined,
    suggestions: suggestions.map(suggestion => {
      const entry = entries.find(
        candidate => candidate.kind === suggestion.kind && candidate.id === suggestion.id
      )
      return {
        kind: suggestion.kind,
        id: suggestion.id,
        name: entry?.name ?? suggestion.id,
        description: entry?.description,
        suggestedMode: suggestion.suggestedMode,
        reasons: suggestion.technologies.map(
          technology => `${technology.name} (${technology.evidence.join(', ')})`
        )
      }
    })
  }
}

/** What every session receives from the team profile before any personal choice. */
export function previewSession(profile: ProjectProfile): SessionPreview {
  const agentRequired = profile.agents.some(entry => entry.mode === 'required')
  try {
    const selection = resolveProfileSessionSelection(profile, undefined)
    return {
      agent: selection.agent?.id,
      agentRequired,
      skills: selection.skills.map(entry => entry.id),
      rules: selection.rules.map(entry => entry.id),
      workflows: selection.workflows.length
    }
  } catch (error) {
    const fallback = resolveProfileSessionSelection({ ...profile, agents: [] }, undefined)
    return {
      agentRequired,
      skills: fallback.skills.map(entry => entry.id),
      rules: fallback.rules.map(entry => entry.id),
      workflows: fallback.workflows.length,
      problem: error instanceof Error ? error.message : String(error)
    }
  }
}

export interface ProfileChange {
  readonly kind: ProfileCatalogKind
  readonly id: string
  readonly mode: ProfileEntryMode
}

/** Validates a change requested by the webview before it reaches the core. */
export function parseProfileChange(value: unknown): ProfileChange | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.kind !== 'string' ||
    !PROFILE_KINDS.includes(candidate.kind as ProfileCatalogKind) ||
    typeof candidate.mode !== 'string' ||
    !PROFILE_MODES.includes(candidate.mode as ProfileEntryMode) ||
    typeof candidate.id !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.id)
  ) {
    return undefined
  }
  return {
    kind: candidate.kind as ProfileCatalogKind,
    id: candidate.id,
    mode: candidate.mode as ProfileEntryMode
  }
}

export interface ProfileSummary {
  readonly agents: number
  readonly defaultAgent?: string
  readonly skills: number
  readonly requiredRules: number
}

export function summarizeProfile(profile: ProjectProfile): ProfileSummary {
  const active = (entries: ProjectProfile['agents']) =>
    entries.filter(entry => entry.mode !== 'disabled')
  return {
    agents: active(profile.agents).length,
    defaultAgent: profile.agents.find(
      entry => entry.mode === 'required' || entry.mode === 'default'
    )?.id,
    skills: active(profile.skills).length,
    requiredRules: profile.rules.filter(entry => entry.mode === 'required').length
  }
}
