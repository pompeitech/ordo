import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'
import type { WorkflowDefinition, WorkflowStep } from './types.js'

interface MarkdownSections {
  readonly title: string
  readonly sections: Readonly<Record<string, string>>
}

function parseSections(content: string): MarkdownSections {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  const title =
    lines
      .find(line => /^#\s+/.test(line))
      ?.replace(/^#\s+/, '')
      .trim() ?? ''
  const sections: Record<string, string[]> = {}
  let current: string | null = null
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line)
    if (heading) {
      current = (heading[1] ?? '').trim().toLowerCase()
      sections[current] = []
    } else if (current) {
      sections[current]?.push(line)
    }
  }

  return {
    title,
    sections: Object.freeze(
      Object.fromEntries(
        Object.entries(sections).map(([key, value]) => [key, value.join('\n').trim()])
      )
    )
  }
}

function listItems(content: string): readonly string[] {
  return Object.freeze(
    content
      .split(/\r?\n/)
      .map(line => /^\s*(?:[-*]|\d+\.)\s+(.+)$/.exec(line)?.[1]?.trim())
      .filter((item): item is string => Boolean(item))
  )
}

export function parseWorkflow(content: string, sourcePath: string): WorkflowDefinition {
  const parsed = parseSections(content)
  const id = path.basename(sourcePath, path.extname(sourcePath))
  const objective = parsed.sections.objective ?? ''
  const rawSteps = listItems(parsed.sections.steps ?? '')
  const successCriteria = parsed.sections.success ?? parsed.sections['success criteria'] ?? ''
  if (!parsed.title || !objective || rawSteps.length === 0 || !successCriteria) {
    throw new OrdoError('WORKFLOW_INVALID', `Workflow is missing required sections: ${sourcePath}`)
  }

  const steps: readonly WorkflowStep[] = Object.freeze(
    rawSteps.map((instruction, index) =>
      Object.freeze({ id: `${id}:${index + 1}`, index, instruction })
    )
  )
  return Object.freeze({
    id,
    title: parsed.title,
    sourcePath: path.resolve(sourcePath),
    objective,
    inputs: listItems(parsed.sections.inputs ?? ''),
    preconditions: listItems(parsed.sections.preconditions ?? ''),
    steps,
    safetyRules: listItems(parsed.sections['safety rules'] ?? ''),
    successCriteria
  })
}

export async function loadWorkflow(filePath: string): Promise<WorkflowDefinition> {
  try {
    return parseWorkflow(await readFile(filePath, 'utf8'), filePath)
  } catch (error) {
    if (error instanceof OrdoError) {
      throw error
    }

    throw new OrdoError('WORKFLOW_INVALID', `Unable to load workflow: ${filePath}`, {
      cause: error
    })
  }
}

export async function loadWorkflows(directory: string): Promise<readonly WorkflowDefinition[]> {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    throw new OrdoError('WORKFLOW_INVALID', `Unable to read workflow directory: ${directory}`, {
      cause: error
    })
  }

  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map(entry => path.join(directory, entry.name))
    .sort()
  const workflows = await Promise.all(files.map(loadWorkflow))
  const ids = workflows.map(workflow => workflow.id)
  if (new Set(ids).size !== ids.length) {
    throw new OrdoError('WORKFLOW_INVALID', 'Workflow ids must be unique')
  }

  return Object.freeze(workflows)
}
