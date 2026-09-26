import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadCatalog } from '../catalog/loader.js'
import type { CatalogEntry, ContentCatalog } from '../catalog/types.js'
import { OrdoError } from '../errors/ordo-error.js'
import type {
  InitializeProfileOptions,
  ProfileCatalogEntry,
  ProfileCatalogKind,
  ProfileEntryMode,
  ProfileSessionSelection,
  ProfileValidationReport,
  ProjectProfile
} from './types.js'

const PROFILE_SCHEMA_VERSION = 1 as const
const PROFILE_MODES: readonly ProfileEntryMode[] = [
  'enabled',
  'recommended',
  'default',
  'required',
  'disabled'
]
const PROFILE_KINDS: readonly ProfileCatalogKind[] = ['agents', 'rules', 'skills', 'workflows']
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HASH_PATTERN = /^[a-f0-9]{64}$/

function profilePath(repositoryRoot: string): string {
  return path.join(repositoryRoot, '.ordo', 'profile.json')
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function catalogDigest(entries: readonly CatalogEntry[]): string {
  return sha256(
    JSON.stringify(
      entries.map(entry => ({
        kind: entry.kind,
        id: entry.id,
        contentSha256: sha256(entry.content)
      }))
    )
  )
}

function entryDigest(entry: CatalogEntry): string {
  return sha256(entry.content)
}

export function projectProfileSha256(profile: ProjectProfile): string {
  return sha256(JSON.stringify(profile))
}

function catalogEntry(catalog: ContentCatalog, kind: ProfileCatalogKind, id: string): CatalogEntry {
  const entry = catalog.entries.find(candidate => candidate.kind === kind && candidate.id === id)
  if (!entry) {
    throw new OrdoError('PROFILE_INVALID', `Unknown ${kind} catalog entry: ${id}`)
  }
  return entry
}

function profileEntry(entry: CatalogEntry, mode: ProfileEntryMode): ProfileCatalogEntry {
  return Object.freeze({ id: entry.id, mode, contentSha256: entryDigest(entry) })
}

function assertProfile(value: unknown, filePath: string): ProjectProfile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('PROFILE_INVALID', `Profile must be an object: ${filePath}`)
  }
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== PROFILE_SCHEMA_VERSION ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string' ||
    typeof record.catalogSha256 !== 'string' ||
    !HASH_PATTERN.test(record.catalogSha256)
  ) {
    throw new OrdoError('PROFILE_INVALID', `Invalid profile metadata: ${filePath}`)
  }
  const entriesByKind = {} as Record<ProfileCatalogKind, readonly ProfileCatalogEntry[]>
  for (const kind of PROFILE_KINDS) {
    const rawEntries = record[kind]
    if (!Array.isArray(rawEntries)) {
      throw new OrdoError('PROFILE_INVALID', `Profile ${kind} must be an array: ${filePath}`)
    }
    const ids = new Set<string>()
    entriesByKind[kind] = Object.freeze(
      rawEntries.map((valueEntry, index) => {
        if (typeof valueEntry !== 'object' || valueEntry === null || Array.isArray(valueEntry)) {
          throw new OrdoError('PROFILE_INVALID', `Invalid ${kind}[${index}] entry: ${filePath}`)
        }
        const entry = valueEntry as Record<string, unknown>
        if (
          typeof entry.id !== 'string' ||
          !ID_PATTERN.test(entry.id) ||
          typeof entry.mode !== 'string' ||
          !PROFILE_MODES.includes(entry.mode as ProfileEntryMode) ||
          typeof entry.contentSha256 !== 'string' ||
          !HASH_PATTERN.test(entry.contentSha256) ||
          ids.has(entry.id)
        ) {
          throw new OrdoError(
            'PROFILE_INVALID',
            `Invalid or duplicate ${kind}[${index}]: ${filePath}`
          )
        }
        ids.add(entry.id)
        return Object.freeze({
          id: entry.id,
          mode: entry.mode as ProfileEntryMode,
          contentSha256: entry.contentSha256
        })
      })
    )
  }
  const agentDefaults = entriesByKind.agents.filter(entry => entry.mode === 'default')
  if (agentDefaults.length > 1) {
    throw new OrdoError('PROFILE_INVALID', 'At most one agent can be the project default')
  }
  const requiredAgents = entriesByKind.agents.filter(entry => entry.mode === 'required')
  if (requiredAgents.length > 1) {
    throw new OrdoError(
      'PROFILE_INVALID',
      'At most one agent can be required by the project profile'
    )
  }
  if (
    requiredAgents.length === 1 &&
    agentDefaults.length === 1 &&
    requiredAgents[0].id !== agentDefaults[0].id
  ) {
    throw new OrdoError('PROFILE_INVALID', 'A required agent must also be the project default')
  }
  return Object.freeze({
    schemaVersion: PROFILE_SCHEMA_VERSION,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    catalogSha256: record.catalogSha256,
    agents: entriesByKind.agents,
    rules: entriesByKind.rules,
    skills: entriesByKind.skills,
    workflows: entriesByKind.workflows
  })
}

async function profileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

async function atomicWriteProfile(filePath: string, profile: ProjectProfile): Promise<void> {
  const temporary = `${filePath}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, filePath)
}

export async function readProjectProfile(repositoryRoot: string): Promise<ProjectProfile> {
  const filePath = profilePath(repositoryRoot)
  if (!(await profileExists(filePath))) {
    throw new OrdoError('PROFILE_NOT_FOUND', `Project profile not found: ${filePath}`)
  }
  try {
    return assertProfile(JSON.parse(await readFile(filePath, 'utf8')), filePath)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('PROFILE_INVALID', `Invalid profile JSON: ${filePath}`, { cause: error })
  }
}

export async function initializeProjectProfile(
  repositoryRoot: string,
  contentRoot: string,
  options: InitializeProfileOptions = {}
): Promise<ProjectProfile> {
  const filePath = profilePath(repositoryRoot)
  if (await profileExists(filePath)) {
    throw new OrdoError('PROFILE_INVALID', 'Project profile already exists')
  }
  const profile = await previewProjectProfile(repositoryRoot, contentRoot, options)
  await mkdir(path.dirname(filePath), { recursive: true })
  try {
    await writeFile(filePath, `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new OrdoError('PROFILE_INVALID', 'Project profile was created concurrently', {
        cause: error
      })
    }
    throw error
  }
  return profile
}

export async function previewProjectProfile(
  repositoryRoot: string,
  contentRoot: string,
  options: InitializeProfileOptions = {}
): Promise<ProjectProfile> {
  const filePath = profilePath(repositoryRoot)
  const catalog = await loadCatalog(contentRoot)
  const now = new Date().toISOString()
  const selectedAgents =
    options.agentIds ??
    catalog.entries.filter(entry => entry.kind === 'agents').map(entry => entry.id)
  const selectedSkills = options.skillIds ?? []
  const selectedRules = new Set(options.ruleIds ?? [])
  const agentIds = [
    ...new Set([...selectedAgents, ...(options.defaultAgentId ? [options.defaultAgentId] : [])])
  ]
  const agents = agentIds.map(id =>
    profileEntry(
      catalogEntry(catalog, 'agents', id),
      id === options.defaultAgentId ? 'default' : 'enabled'
    )
  )
  const skills = [...new Set(selectedSkills)].map(id =>
    profileEntry(catalogEntry(catalog, 'skills', id), 'enabled')
  )
  const rules = catalog.entries
    .filter(entry => entry.kind === 'rules')
    .map(entry =>
      profileEntry(
        entry,
        entry.id.startsWith('common-')
          ? 'required'
          : selectedRules.has(entry.id)
            ? 'default'
            : 'recommended'
      )
    )
  const workflows = catalog.entries
    .filter(entry => entry.kind === 'workflows')
    .map(entry => profileEntry(entry, 'enabled'))
  if (agents.length === 0) {
    throw new OrdoError(
      'PROFILE_INVALID',
      'At least one agent must be included in the project profile'
    )
  }
  const profile = assertProfile(
    {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
      catalogSha256: catalogDigest(catalog.entries),
      agents,
      rules,
      skills,
      workflows
    },
    filePath
  )
  return profile
}

export async function validateProjectProfile(
  repositoryRoot: string,
  contentRoot: string
): Promise<ProfileValidationReport> {
  const profile = await readProjectProfile(repositoryRoot)
  const catalog = await loadCatalog(contentRoot)
  const errors: string[] = []
  const allProfileEntries = PROFILE_KINDS.flatMap(kind =>
    profile[kind].map(entry => ({ kind, entry }))
  )
  for (const { kind, entry } of allProfileEntries) {
    const current = catalog.entries.find(
      candidate => candidate.kind === kind && candidate.id === entry.id
    )
    if (!current) {
      errors.push(`Missing ${kind} catalog entry: ${entry.id}`)
    } else if (entryDigest(current) !== entry.contentSha256) {
      errors.push(`Changed ${kind} catalog entry requires profile review: ${entry.id}`)
    }
  }
  if (profile.catalogSha256 !== catalogDigest(catalog.entries)) {
    errors.push(
      'Content catalog changed since this profile was created; review and refresh the profile'
    )
  }
  return Object.freeze({ valid: errors.length === 0, profile, errors: Object.freeze(errors) })
}

export async function updateProjectProfileEntry(
  repositoryRoot: string,
  contentRoot: string,
  kind: ProfileCatalogKind,
  id: string,
  mode: ProfileEntryMode
): Promise<ProjectProfile> {
  const directory = path.dirname(profilePath(repositoryRoot))
  const lockPath = path.join(directory, 'profile.lock')
  await mkdir(directory, { recursive: true })
  let lock: Awaited<ReturnType<typeof open>>
  try {
    lock = await open(lockPath, 'wx')
  } catch (error) {
    throw new OrdoError('PROFILE_INVALID', 'Project profile is already being updated', {
      cause: error
    })
  }
  try {
    const next = await previewProjectProfileEntry(repositoryRoot, contentRoot, kind, id, mode)
    await atomicWriteProfile(profilePath(repositoryRoot), next)
    return next
  } finally {
    await lock.close()
    await unlink(lockPath).catch(() => undefined)
  }
}

export async function previewProjectProfileEntry(
  repositoryRoot: string,
  contentRoot: string,
  kind: ProfileCatalogKind,
  id: string,
  mode: ProfileEntryMode
): Promise<ProjectProfile> {
  if (!PROFILE_KINDS.includes(kind) || !PROFILE_MODES.includes(mode)) {
    throw new OrdoError('PROFILE_INVALID', 'Unsupported profile kind or mode')
  }
  const current = await readProjectProfile(repositoryRoot)
  const catalog = await loadCatalog(contentRoot)
  const source = catalogEntry(catalog, kind, id)
  const nextEntries = current[kind].filter(entry => entry.id !== id)
  nextEntries.push(profileEntry(source, mode))
  if (kind === 'agents' && (mode === 'default' || mode === 'required')) {
    for (let index = 0; index < nextEntries.length; index += 1) {
      if (
        nextEntries[index].id !== id &&
        (nextEntries[index].mode === 'default' || nextEntries[index].mode === 'required')
      ) {
        nextEntries[index] = Object.freeze({ ...nextEntries[index], mode: 'enabled' })
      }
    }
  }
  if (kind === 'agents' && (mode === 'enabled' || mode === 'recommended' || mode === 'disabled')) {
    const oldRequired = nextEntries.find(entry => entry.id !== id && entry.mode === 'required')
    if (oldRequired) {
      throw new OrdoError(
        'PROFILE_INVALID',
        `Cannot change ${id} while ${oldRequired.id} is required by the project profile`
      )
    }
  }
  const next = assertProfile(
    {
      ...current,
      updatedAt: new Date().toISOString(),
      catalogSha256: catalogDigest(catalog.entries),
      [kind]: nextEntries
    },
    profilePath(repositoryRoot)
  )
  return next
}

export function resolveProfileSessionSelection(
  profile: ProjectProfile,
  agentId: string | undefined,
  requestedSkillIds: readonly string[] = [],
  requestedRuleIds: readonly string[] = []
): ProfileSessionSelection {
  const permittedAgents = profile.agents.filter(entry => entry.mode !== 'disabled')
  const requiredAgents = permittedAgents.filter(entry => entry.mode === 'required')
  const defaultAgent = requiredAgents[0] ?? permittedAgents.find(entry => entry.mode === 'default')
  const selectedAgentId = agentId ?? defaultAgent?.id
  if (agentId && requiredAgents.length > 0 && agentId !== requiredAgents[0].id) {
    throw new OrdoError(
      'PROFILE_INVALID',
      `Project profile requires agent: ${requiredAgents[0].id}`
    )
  }
  if (permittedAgents.length > 0 && !selectedAgentId) {
    throw new OrdoError('PROFILE_INVALID', 'Choose an agent with --agent or set a project default')
  }
  if (selectedAgentId && !permittedAgents.some(entry => entry.id === selectedAgentId)) {
    throw new OrdoError(
      'PROFILE_INVALID',
      `Agent is not enabled by the project profile: ${selectedAgentId}`
    )
  }
  const availableSkills = profile.skills.filter(entry => entry.mode !== 'disabled')
  const requested = [...new Set(requestedSkillIds)]
  for (const id of requested) {
    if (!availableSkills.some(entry => entry.id === id)) {
      throw new OrdoError('PROFILE_INVALID', `Skill is not enabled by the project profile: ${id}`)
    }
  }
  const selectedSkills = availableSkills.filter(
    entry => entry.mode === 'required' || entry.mode === 'default' || requested.includes(entry.id)
  )
  const availableRules = profile.rules.filter(entry => entry.mode !== 'disabled')
  const requestedRules = [...new Set(requestedRuleIds)]
  for (const id of requestedRules) {
    if (!availableRules.some(entry => entry.id === id)) {
      throw new OrdoError('PROFILE_INVALID', `Rule is not enabled by the project profile: ${id}`)
    }
  }
  return Object.freeze({
    profileSha256: projectProfileSha256(profile),
    agent: selectedAgentId
      ? permittedAgents.find(entry => entry.id === selectedAgentId)
      : undefined,
    skills: Object.freeze(selectedSkills.sort((left, right) => left.id.localeCompare(right.id))),
    rules: Object.freeze(
      profile.rules
        .filter(
          entry =>
            entry.mode === 'required' ||
            entry.mode === 'default' ||
            requestedRules.includes(entry.id)
        )
        .sort((left, right) => left.id.localeCompare(right.id))
    ),
    workflows: Object.freeze(
      profile.workflows
        .filter(entry => entry.mode !== 'disabled')
        .sort((left, right) => left.id.localeCompare(right.id))
    )
  })
}
