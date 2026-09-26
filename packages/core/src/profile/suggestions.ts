import path from 'node:path'
import type { CatalogEntry } from '../catalog/types.js'
import { inspectRepository } from '../detection/repository.js'
import { type DetectedTechnology, detectStack } from '../detection/stack.js'
import type { ProfileEntryMode, ProjectProfile } from './types.js'

export interface SuggestionTechnology {
  readonly id: string
  readonly name: string
  /** Where the technology was detected, relative to the repository root when possible. */
  readonly evidence: readonly string[]
}

export interface ProfileSuggestion {
  readonly kind: 'skills' | 'rules'
  readonly id: string
  readonly suggestedMode: Extract<ProfileEntryMode, 'recommended' | 'default'>
  readonly technologies: readonly SuggestionTechnology[]
}

/** Modes that mean the team already decided about an entry, so it is not suggested again. */
const DECIDED_MODES: readonly ProfileEntryMode[] = [
  'required',
  'default',
  'recommended',
  'disabled'
]

/**
 * Technologies a catalog entry is meant for. Skills declare them in
 * `metadata.stack`; rules are grouped by technology directory (`rules/<tech>/`).
 * Entries without a stack are general and never suggested from detection.
 */
export function catalogEntryStack(entry: CatalogEntry): readonly string[] {
  if (entry.kind === 'skills') {
    const declared = entry.frontmatter['metadata.stack']
    if (Array.isArray(declared)) {
      return declared
    }
    return typeof declared === 'string' && declared ? [declared] : []
  }
  if (entry.kind === 'rules') {
    const directory = path.basename(path.dirname(entry.relativePath))
    return directory && directory !== '.' && directory !== 'rules' && directory !== 'common'
      ? [directory]
      : []
  }
  return []
}

export function computeProfileSuggestions(
  entries: readonly CatalogEntry[],
  technologies: readonly DetectedTechnology[],
  profile?: ProjectProfile
): readonly ProfileSuggestion[] {
  const suggestions: ProfileSuggestion[] = []
  for (const entry of entries) {
    if (entry.kind !== 'skills' && entry.kind !== 'rules') {
      continue
    }
    const recorded = profile?.[entry.kind].find(candidate => candidate.id === entry.id)
    if (recorded && DECIDED_MODES.includes(recorded.mode)) {
      continue
    }
    const stack = catalogEntryStack(entry)
    const matched = technologies.filter(technology => stack.includes(technology.id))
    if (matched.length === 0) {
      continue
    }
    suggestions.push(
      Object.freeze({
        kind: entry.kind,
        id: entry.id,
        suggestedMode: entry.kind === 'rules' ? 'default' : 'recommended',
        technologies: Object.freeze(
          matched.map(technology =>
            Object.freeze({
              id: technology.id,
              name: technology.name,
              evidence: technology.evidence
            })
          )
        )
      })
    )
  }
  return Object.freeze(
    suggestions.sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
    )
  )
}

/** Suggests skills and rules for the technologies detected in the repository. */
export async function suggestProfileEntries(
  repositoryRoot: string,
  entries: readonly CatalogEntry[],
  profile?: ProjectProfile
): Promise<readonly ProfileSuggestion[]> {
  const repository = await inspectRepository(repositoryRoot)
  const stack = await detectStack(repository)
  const technologies = stack.technologies.map(technology => ({
    ...technology,
    evidence: technology.evidence.map(item =>
      path.isAbsolute(item) ? path.relative(repository.rootDirectory, item) : item
    )
  }))
  return computeProfileSuggestions(entries, technologies, profile)
}
