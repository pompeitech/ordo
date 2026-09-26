import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appendAuditEvent, type TransitionContext } from '../audit/store.js'
import { OrdoError } from '../errors/ordo-error.js'
import { readSpec } from '../specs/store.js'
import type {
  ArchitectureComponent,
  ArchitectureProposal,
  ArchitectureStatus,
  CreateArchitectureOptions
} from './types.js'

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const STATUSES: readonly ArchitectureStatus[] = ['proposed', 'approved', 'superseded']

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function directory(repositoryRoot: string): string {
  return path.join(repositoryRoot, '.ordo', 'architectures')
}

function proposalPath(repositoryRoot: string, id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new OrdoError('ARCHITECTURE_INVALID', `Invalid architecture id: ${id}`)
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

function stringList(value: unknown, name: string, allowEmpty = true): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some(item => typeof item !== 'string' || !item.trim()) ||
    (!allowEmpty && value.length === 0)
  ) {
    throw new OrdoError('ARCHITECTURE_INVALID', `${name} must be an array of non-empty strings`)
  }
  return Object.freeze([...value])
}

function components(value: unknown): readonly ArchitectureComponent[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OrdoError('ARCHITECTURE_INVALID', 'components must not be empty')
  }
  return Object.freeze(
    value.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new OrdoError('ARCHITECTURE_INVALID', `Invalid component at index ${index}`)
      }
      const component = raw as Record<string, unknown>
      if (
        typeof component.name !== 'string' ||
        !component.name.trim() ||
        typeof component.responsibility !== 'string' ||
        !component.responsibility.trim()
      ) {
        throw new OrdoError('ARCHITECTURE_INVALID', `Invalid component at index ${index}`)
      }
      return Object.freeze({
        name: component.name,
        responsibility: component.responsibility,
        changes: stringList(component.changes, `components[${index}].changes`)
      })
    })
  )
}

function validate(value: unknown, source: string): ArchitectureProposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OrdoError('ARCHITECTURE_INVALID', `Architecture must be an object: ${source}`)
  }
  const proposal = value as Record<string, unknown>
  if (
    proposal.schemaVersion !== 1 ||
    typeof proposal.id !== 'string' ||
    !ID_PATTERN.test(proposal.id) ||
    typeof proposal.title !== 'string' ||
    !proposal.title.trim() ||
    typeof proposal.specId !== 'string' ||
    !ID_PATTERN.test(proposal.specId) ||
    typeof proposal.status !== 'string' ||
    !STATUSES.includes(proposal.status as ArchitectureStatus) ||
    typeof proposal.createdAt !== 'string' ||
    typeof proposal.updatedAt !== 'string'
  ) {
    throw new OrdoError('ARCHITECTURE_INVALID', `Invalid architecture proposal: ${source}`)
  }
  return Object.freeze({
    schemaVersion: 1,
    id: proposal.id,
    title: proposal.title,
    specId: proposal.specId,
    status: proposal.status as ArchitectureStatus,
    impact: stringList(proposal.impact, 'impact', false),
    components: components(proposal.components),
    contracts: stringList(proposal.contracts, 'contracts', false),
    decisions: stringList(proposal.decisions, 'decisions', false),
    risks: stringList(proposal.risks, 'risks'),
    createdAt: proposal.createdAt,
    updatedAt: proposal.updatedAt,
    approvedAt: typeof proposal.approvedAt === 'string' ? proposal.approvedAt : undefined
  })
}

export async function previewArchitectureProposal(
  repositoryRoot: string,
  options: CreateArchitectureOptions
): Promise<ArchitectureProposal> {
  await readSpec(repositoryRoot, options.specId)
  const id = options.id ?? slug(options.title)
  const now = new Date().toISOString()
  return validate(
    {
      schemaVersion: 1,
      id,
      title: options.title.trim(),
      specId: options.specId,
      status: 'proposed',
      impact: options.impact,
      components: options.components,
      contracts: options.contracts,
      decisions: options.decisions,
      risks: options.risks ?? [],
      createdAt: now,
      updatedAt: now
    },
    'preview'
  )
}

export async function createArchitectureProposal(
  repositoryRoot: string,
  options: CreateArchitectureOptions
): Promise<ArchitectureProposal> {
  const proposal = await previewArchitectureProposal(repositoryRoot, options)
  const target = proposalPath(repositoryRoot, proposal.id)
  if (await exists(target)) {
    throw new OrdoError('ARCHITECTURE_INVALID', `Architecture already exists: ${proposal.id}`)
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, `${JSON.stringify(proposal, null, 2)}\n`, { flag: 'wx' })
  await appendAuditEvent(repositoryRoot, {
    kind: 'architecture',
    artifactId: proposal.id,
    action: 'created',
    to: proposal.status,
    ref: { kind: 'spec', id: proposal.specId }
  })
  return proposal
}

export async function readArchitectureProposal(
  repositoryRoot: string,
  id: string
): Promise<ArchitectureProposal> {
  const target = proposalPath(repositoryRoot, id)
  if (!(await exists(target))) {
    throw new OrdoError('ARCHITECTURE_NOT_FOUND', `Architecture not found: ${id}`)
  }
  try {
    return validate(JSON.parse(await readFile(target, 'utf8')), target)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }
    throw new OrdoError('ARCHITECTURE_INVALID', `Invalid architecture JSON: ${target}`, {
      cause: error
    })
  }
}

export async function listArchitectureProposals(
  repositoryRoot: string
): Promise<readonly ArchitectureProposal[]> {
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
    await Promise.all(
      names.map(name => readArchitectureProposal(repositoryRoot, name.slice(0, -5)))
    )
  )
}

export async function previewArchitectureApproval(
  repositoryRoot: string,
  id: string
): Promise<ArchitectureProposal> {
  const current = await readArchitectureProposal(repositoryRoot, id)
  if (current.status !== 'proposed') {
    throw new OrdoError(
      'ARCHITECTURE_INVALID',
      `Architecture cannot be approved from: ${current.status}`
    )
  }
  const now = new Date().toISOString()
  return Object.freeze({
    ...current,
    status: 'approved',
    approvedAt: now,
    updatedAt: now
  })
}

export async function approveArchitectureProposal(
  repositoryRoot: string,
  id: string,
  context: TransitionContext = {}
): Promise<ArchitectureProposal> {
  const current = await readArchitectureProposal(repositoryRoot, id)
  const next = await previewArchitectureApproval(repositoryRoot, id)
  await atomicWrite(proposalPath(repositoryRoot, id), next)
  await appendAuditEvent(repositoryRoot, {
    kind: 'architecture',
    artifactId: id,
    action: 'approved',
    from: current.status,
    to: next.status,
    ref: { kind: 'spec', id: next.specId },
    ...context
  })
  return next
}
