import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendAuditEvent, type TransitionContext } from '../audit/store.js'
import { OrdoError } from '../errors/ordo-error.js'
import type {
  AddExploreAlternativeOptions,
  CreateExploreOptions,
  ExploreAlternative,
  ExploreRecord,
  ExploreStatus
} from './types.js'

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STATUSES: readonly ExploreStatus[] = [
  'intent',
  'diverging',
  'converging',
  'crystallized',
  'archived'
]

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function directory(repositoryRoot: string): string {
  return path.join(repositoryRoot, '.ordo', 'explore')
}

function recordPath(repositoryRoot: string, id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new OrdoError('EXPLORE_INVALID', `Invalid exploration id: ${id}`)
  }
  return path.join(directory(repositoryRoot), `${id}.json`)
}

async function exists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

async function atomicWrite(target: string, value: unknown): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
  await rename(temporary, target)
}

function strings(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new OrdoError('EXPLORE_INVALID', `${field} must be an array of strings`)
  }
  return Object.freeze([...value])
}

function validate(value: unknown, source: string): ExploreRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrdoError('EXPLORE_INVALID', `Exploration must be an object: ${source}`)
  }
  const record = value as Record<string, unknown>
  if (
    record.schemaVersion !== 1 ||
    typeof record.id !== 'string' ||
    !ID_PATTERN.test(record.id) ||
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    typeof record.problem !== 'string' ||
    !record.problem.trim() ||
    typeof record.status !== 'string' ||
    !STATUSES.includes(record.status as ExploreStatus) ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string' ||
    !Array.isArray(record.alternatives)
  ) {
    throw new OrdoError('EXPLORE_INVALID', `Invalid exploration record: ${source}`)
  }
  const alternatives = record.alternatives.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new OrdoError('EXPLORE_INVALID', `Invalid alternative at index ${index}`)
    }
    const alternative = raw as Record<string, unknown>
    if (
      typeof alternative.id !== 'string' ||
      !ID_PATTERN.test(alternative.id) ||
      typeof alternative.title !== 'string' ||
      typeof alternative.summary !== 'string' ||
      typeof alternative.createdAt !== 'string'
    ) {
      throw new OrdoError('EXPLORE_INVALID', `Invalid alternative at index ${index}`)
    }
    return Object.freeze({
      id: alternative.id,
      title: alternative.title,
      summary: alternative.summary,
      benefits: strings(alternative.benefits, `alternatives[${index}].benefits`),
      tradeoffs: strings(alternative.tradeoffs, `alternatives[${index}].tradeoffs`),
      risks: strings(alternative.risks, `alternatives[${index}].risks`),
      createdAt: alternative.createdAt
    })
  })
  if (new Set(alternatives.map(item => item.id)).size !== alternatives.length) {
    throw new OrdoError('EXPLORE_INVALID', 'Alternative ids must be unique')
  }
  if (
    typeof record.selectedAlternativeId === 'string' &&
    !alternatives.some(item => item.id === record.selectedAlternativeId)
  ) {
    throw new OrdoError('EXPLORE_INVALID', 'Selected alternative does not exist')
  }
  return Object.freeze({
    schemaVersion: 1,
    id: record.id,
    title: record.title,
    problem: record.problem,
    status: record.status as ExploreStatus,
    assumptions: strings(record.assumptions, 'assumptions'),
    openQuestions: strings(record.openQuestions, 'openQuestions'),
    alternatives: Object.freeze(alternatives),
    selectedAlternativeId:
      typeof record.selectedAlternativeId === 'string' ? record.selectedAlternativeId : undefined,
    specId: typeof record.specId === 'string' ? record.specId : undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  })
}

export function previewExploreCreation(options: CreateExploreOptions): ExploreRecord {
  const title = options.title.trim()
  const problem = options.problem.trim()
  const id = options.id ?? slug(title)
  if (!title || !problem || !ID_PATTERN.test(id)) {
    throw new OrdoError('EXPLORE_INVALID', 'Exploration requires title, problem, and a valid id')
  }
  const now = new Date().toISOString()
  return Object.freeze({
    schemaVersion: 1,
    id,
    title,
    problem,
    status: 'intent',
    assumptions: Object.freeze([...(options.assumptions ?? [])]),
    openQuestions: Object.freeze([...(options.openQuestions ?? [])]),
    alternatives: Object.freeze([]),
    createdAt: now,
    updatedAt: now
  })
}

export async function createExplore(
  repositoryRoot: string,
  options: CreateExploreOptions
): Promise<ExploreRecord> {
  const record = previewExploreCreation(options)
  const target = recordPath(repositoryRoot, record.id)
  if (await exists(target)) {
    throw new OrdoError('EXPLORE_INVALID', `Exploration already exists: ${record.id}`)
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
  await appendAuditEvent(repositoryRoot, {
    kind: 'explore',
    artifactId: record.id,
    action: 'created',
    to: record.status
  })
  return record
}

export async function readExplore(repositoryRoot: string, id: string): Promise<ExploreRecord> {
  const target = recordPath(repositoryRoot, id)
  if (!(await exists(target))) {
    throw new OrdoError('EXPLORE_NOT_FOUND', `Exploration not found: ${id}`)
  }
  try {
    return validate(JSON.parse(await readFile(target, 'utf8')), target)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('EXPLORE_INVALID', `Invalid exploration JSON: ${target}`, { cause: error })
  }
}

export async function listExplores(repositoryRoot: string): Promise<readonly ExploreRecord[]> {
  let names: string[]
  try {
    names = (await readdir(directory(repositoryRoot))).filter(name => name.endsWith('.json')).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze([])
    }
    throw error
  }
  return Object.freeze(
    await Promise.all(names.map(name => readExplore(repositoryRoot, name.slice(0, -5))))
  )
}

export async function addExploreAlternative(
  repositoryRoot: string,
  exploreId: string,
  options: AddExploreAlternativeOptions
): Promise<ExploreRecord> {
  const current = await readExplore(repositoryRoot, exploreId)
  if (current.status === 'crystallized' || current.status === 'archived') {
    throw new OrdoError('EXPLORE_INVALID', `Cannot add alternatives in status: ${current.status}`)
  }
  const id = options.id ?? slug(options.title)
  if (!ID_PATTERN.test(id) || current.alternatives.some(item => item.id === id)) {
    throw new OrdoError('EXPLORE_INVALID', `Invalid or duplicate alternative id: ${id}`)
  }
  if (!options.title.trim() || !options.summary.trim() || options.tradeoffs.length === 0) {
    throw new OrdoError('EXPLORE_INVALID', 'Alternative requires title, summary, and tradeoffs')
  }
  const now = new Date().toISOString()
  const alternative: ExploreAlternative = Object.freeze({
    id,
    title: options.title.trim(),
    summary: options.summary.trim(),
    benefits: Object.freeze([...(options.benefits ?? [])]),
    tradeoffs: Object.freeze([...options.tradeoffs]),
    risks: Object.freeze([...(options.risks ?? [])]),
    createdAt: now
  })
  const next: ExploreRecord = Object.freeze({
    ...current,
    status: 'diverging',
    alternatives: Object.freeze([...current.alternatives, alternative]),
    updatedAt: now
  })
  await atomicWrite(recordPath(repositoryRoot, exploreId), next)
  return next
}

export async function selectExploreAlternative(
  repositoryRoot: string,
  exploreId: string,
  alternativeId: string,
  context: TransitionContext = {}
): Promise<ExploreRecord> {
  const current = await readExplore(repositoryRoot, exploreId)
  if (!current.alternatives.some(item => item.id === alternativeId)) {
    throw new OrdoError('EXPLORE_INVALID', `Alternative not found: ${alternativeId}`)
  }
  const next: ExploreRecord = Object.freeze({
    ...current,
    status: 'converging',
    selectedAlternativeId: alternativeId,
    updatedAt: new Date().toISOString()
  })
  await atomicWrite(recordPath(repositoryRoot, exploreId), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'explore',
    artifactId: exploreId,
    action: 'alternative-selected',
    from: current.status,
    to: next.status,
    ref: { kind: 'alternative', id: alternativeId },
    ...context
  })
  return next
}

export async function linkExploreSpec(
  repositoryRoot: string,
  exploreId: string,
  specId: string,
  context: TransitionContext = {}
): Promise<ExploreRecord> {
  const current = await readExplore(repositoryRoot, exploreId)
  if (!current.selectedAlternativeId) {
    throw new OrdoError('EXPLORE_INVALID', 'Select an alternative before crystallizing a spec')
  }
  const next: ExploreRecord = Object.freeze({
    ...current,
    status: 'crystallized',
    specId,
    updatedAt: new Date().toISOString()
  })
  await atomicWrite(recordPath(repositoryRoot, exploreId), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'explore',
    artifactId: exploreId,
    action: 'crystallized',
    from: current.status,
    to: next.status,
    ref: { kind: 'spec', id: specId },
    ...context
  })
  return next
}
