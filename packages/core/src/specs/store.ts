import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendAuditEvent, type TransitionContext } from '../audit/store.js'
import { OrdoError } from '../errors/ordo-error.js'
import type {
  CreateSpecOptions,
  SpecCreationPreview,
  SpecRecord,
  SpecStatus,
  SpecValidationReport
} from './types.js'

const SPEC_STATUSES: readonly SpecStatus[] = [
  'draft',
  'ready',
  'implemented',
  'verified',
  'superseded'
]
const SPEC_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SECTIONS = [
  ['objective', 'Objective'],
  ['nonGoals', 'Non-goals'],
  ['actors', 'Actors'],
  ['requirements', 'Functional requirements'],
  ['constraints', 'Constraints'],
  ['acceptanceCriteria', 'Acceptance criteria'],
  ['risks', 'Risks']
] as const

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function specsDirectory(repositoryRoot: string): string {
  return path.join(repositoryRoot, '.ordo', 'specs')
}

function specPath(repositoryRoot: string, id: string): string {
  if (!SPEC_ID_PATTERN.test(id)) {
    throw new OrdoError('SPEC_INVALID', `Invalid spec id: ${id}`)
  }
  return path.join(specsDirectory(repositoryRoot), `${id}.md`)
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function renderSpec(spec: Omit<SpecRecord, 'path'>): string {
  const frontmatter = [
    '---',
    `schemaVersion: ${spec.schemaVersion}`,
    `id: ${yamlString(spec.id)}`,
    `title: ${yamlString(spec.title)}`,
    `status: ${yamlString(spec.status)}`,
    `createdAt: ${yamlString(spec.createdAt)}`,
    `updatedAt: ${yamlString(spec.updatedAt)}`,
    '---'
  ].join('\n')
  const sections = SECTIONS.map(
    ([field, heading]) => `## ${heading}\n\n${spec[field].trim() || '_Not specified._'}`
  ).join('\n\n')
  return `${frontmatter}\n\n# ${spec.title}\n\n${sections}\n`
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === '1') {
    return 1
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function parseSpec(content: string, filePath: string): SpecValidationReport {
  const errors: string[] = []
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content)
  if (!match) {
    return { valid: false, errors: ['Missing or invalid YAML frontmatter'] }
  }
  const metadata: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator < 1) {
      errors.push(`Invalid frontmatter line: ${line}`)
      continue
    }
    metadata[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1))
  }
  if (metadata.schemaVersion !== 1) {
    errors.push('schemaVersion must be 1')
  }
  if (typeof metadata.id !== 'string' || !SPEC_ID_PATTERN.test(metadata.id)) {
    errors.push('id must be a lowercase kebab-case identifier')
  }
  if (typeof metadata.title !== 'string' || !metadata.title.trim()) {
    errors.push('title is required')
  }
  if (
    typeof metadata.status !== 'string' ||
    !SPEC_STATUSES.includes(metadata.status as SpecStatus)
  ) {
    errors.push(`status must be one of: ${SPEC_STATUSES.join(', ')}`)
  }
  if (typeof metadata.createdAt !== 'string') {
    errors.push('createdAt is required')
  }
  if (typeof metadata.updatedAt !== 'string') {
    errors.push('updatedAt is required')
  }

  const body = match[2]
  const values: Record<string, string> = {}
  for (const [field, heading] of SECTIONS) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const section = new RegExp(`^## ${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=^## |\\s*$)`, 'm').exec(
      body
    )
    if (!section) {
      errors.push(`Missing section: ${heading}`)
    }
    values[field] = section?.[1].trim() ?? ''
  }
  for (const field of ['objective', 'acceptanceCriteria']) {
    if (!values[field] || values[field] === '_Not specified._') {
      errors.push(`${field} is required`)
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors: Object.freeze(errors) }
  }
  const spec: SpecRecord = Object.freeze({
    schemaVersion: 1,
    id: metadata.id as string,
    title: metadata.title as string,
    status: metadata.status as SpecStatus,
    createdAt: metadata.createdAt as string,
    updatedAt: metadata.updatedAt as string,
    objective: values.objective,
    nonGoals: values.nonGoals,
    actors: values.actors,
    requirements: values.requirements,
    constraints: values.constraints,
    acceptanceCriteria: values.acceptanceCriteria,
    risks: values.risks,
    path: filePath
  })
  return { valid: true, spec, errors: Object.freeze([]) }
}

async function exists(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

export function previewSpecCreation(
  repositoryRoot: string,
  options: CreateSpecOptions
): SpecCreationPreview {
  const title = options.title.trim()
  const objective = options.objective.trim()
  const acceptanceCriteria = options.acceptanceCriteria.trim()
  const id = options.id ?? slug(title)
  if (!title || !objective || !acceptanceCriteria || !SPEC_ID_PATTERN.test(id)) {
    throw new OrdoError(
      'SPEC_INVALID',
      'Spec requires a title, objective, acceptance criteria, and valid id'
    )
  }
  const target = specPath(repositoryRoot, id)
  const now = new Date().toISOString()
  const spec = {
    schemaVersion: 1 as const,
    id,
    title,
    status: options.status ?? ('draft' as const),
    createdAt: now,
    updatedAt: now,
    objective,
    nonGoals: options.nonGoals?.trim() ?? '_Not specified._',
    actors: options.actors?.trim() ?? '_Not specified._',
    requirements: options.requirements?.trim() ?? '_Not specified._',
    constraints: options.constraints?.trim() ?? '_Not specified._',
    acceptanceCriteria,
    risks: options.risks?.trim() ?? '_Not specified._'
  }
  const record = Object.freeze({ ...spec, path: target })
  return Object.freeze({ spec: record, content: renderSpec(spec) })
}

export async function createSpec(
  repositoryRoot: string,
  options: CreateSpecOptions
): Promise<SpecRecord> {
  const preview = previewSpecCreation(repositoryRoot, options)
  if (await exists(preview.spec.path)) {
    throw new OrdoError('SPEC_INVALID', `Spec already exists: ${preview.spec.id}`)
  }
  await mkdir(path.dirname(preview.spec.path), { recursive: true })
  await writeFile(preview.spec.path, preview.content, { flag: 'wx' })
  await appendAuditEvent(repositoryRoot, {
    kind: 'spec',
    artifactId: preview.spec.id,
    action: 'created',
    to: preview.spec.status
  })
  return preview.spec
}

export async function validateSpec(
  repositoryRoot: string,
  id: string
): Promise<SpecValidationReport> {
  const target = specPath(repositoryRoot, id)
  if (!(await exists(target))) {
    throw new OrdoError('SPEC_NOT_FOUND', `Spec not found: ${id}`)
  }
  return parseSpec(await readFile(target, 'utf8'), target)
}

export async function readSpec(repositoryRoot: string, id: string): Promise<SpecRecord> {
  const report = await validateSpec(repositoryRoot, id)
  if (!report.valid || !report.spec) {
    throw new OrdoError('SPEC_INVALID', `Spec is invalid: ${id}`, {
      details: { errors: report.errors }
    })
  }
  return report.spec
}

export async function listSpecs(repositoryRoot: string): Promise<readonly SpecRecord[]> {
  const directory = specsDirectory(repositoryRoot)
  let names: string[]
  try {
    names = (await readdir(directory)).filter(name => name.endsWith('.md')).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Object.freeze([])
    }
    throw error
  }
  return Object.freeze(
    await Promise.all(names.map(name => readSpec(repositoryRoot, name.slice(0, -3))))
  )
}

export async function updateSpecStatus(
  repositoryRoot: string,
  id: string,
  status: SpecStatus,
  context: TransitionContext = {}
): Promise<SpecRecord> {
  if (!SPEC_STATUSES.includes(status)) {
    throw new OrdoError('SPEC_INVALID', `Invalid status: ${status}`)
  }
  const current = await readSpec(repositoryRoot, id)
  const target = specPath(repositoryRoot, id)
  const next = { ...current, status, updatedAt: new Date().toISOString() }
  const temporary = `${target}.${randomUUID()}.tmp`
  await writeFile(temporary, renderSpec(next), { flag: 'wx' })
  await rename(temporary, target)
  if (current.status !== status) {
    await appendAuditEvent(repositoryRoot, {
      kind: 'spec',
      artifactId: id,
      action: 'status-changed',
      from: current.status,
      to: status,
      ...context
    })
  }
  return Object.freeze({ ...next, path: target })
}
