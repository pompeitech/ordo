import path from 'node:path'
import type {
  CatalogEntry,
  CatalogValidationIssue,
  CatalogValidationResult,
  ContentCatalog
} from './types.js'

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function issue(
  entry: CatalogEntry,
  code: string,
  message: string,
  severity: CatalogValidationIssue['severity'] = 'error'
): CatalogValidationIssue {
  return { code, severity, message, path: entry.relativePath, entryId: entry.id }
}

function validateEntry(entry: CatalogEntry): CatalogValidationIssue[] {
  const issues: CatalogValidationIssue[] = []
  if (!ID_PATTERN.test(entry.id)) {
    issues.push(issue(entry, 'invalid-id', `Invalid id: ${entry.id}`))
  }

  if (entry.content.trim().length === 0) {
    issues.push(issue(entry, 'empty-content', 'Content is empty'))
  }

  if (!entry.body.includes('## Prompt Defense Baseline')) {
    issues.push(issue(entry, 'missing-prompt-defense', 'Prompt Defense Baseline is missing'))
  }

  if (entry.kind !== 'workflows') {
    if (!entry.frontmatter.name) {
      issues.push(issue(entry, 'missing-name', 'Frontmatter name is missing'))
    }

    if (!entry.description) {
      issues.push(issue(entry, 'missing-description', 'Frontmatter description is missing'))
    }

    if (!entry.body.includes('**Identity**:')) {
      issues.push(issue(entry, 'missing-identity', 'Identity declaration is missing', 'warning'))
    }
  }

  if (entry.kind === 'skills') {
    const segments = entry.relativePath.split('/')
    if (segments.length !== 3 || segments[2] !== 'SKILL.md' || segments[1] !== entry.id) {
      issues.push(issue(entry, 'invalid-skill-path', 'Skill path must be skills/<id>/SKILL.md'))
    }
  }

  if (entry.kind === 'workflows') {
    for (const heading of ['## Objective', '## Steps', '## Safety rules', '## Success']) {
      if (!entry.body.toLowerCase().includes(heading.toLowerCase())) {
        issues.push(
          issue(entry, 'missing-workflow-section', `Workflow section is missing: ${heading}`)
        )
      }
    }
  }

  return issues
}

export function validateCatalog(catalog: ContentCatalog): CatalogValidationResult {
  const issues = catalog.entries.flatMap(validateEntry)
  if (catalog.entries.length === 0) {
    issues.push({
      code: 'empty-catalog',
      severity: 'error',
      message: 'Content catalog contains no entries'
    })
  }

  const seen = new Map<string, CatalogEntry>()
  for (const entry of catalog.entries) {
    const key = `${entry.kind}:${entry.id}`
    const previous = seen.get(key)
    if (previous) {
      issues.push({
        code: 'duplicate-id',
        severity: 'error',
        message: `Duplicate ${entry.kind} id: ${entry.id}`,
        path: path.relative(catalog.rootDirectory, entry.sourcePath),
        entryId: entry.id
      })
    } else {
      seen.set(key, entry)
    }
  }

  return Object.freeze({
    valid: !issues.some(item => item.severity === 'error'),
    issues: Object.freeze(issues)
  })
}
