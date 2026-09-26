import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RuntimeTool, ToolExecutionContext } from '@pompeitech/ordo-runtime'

const DEFAULT_IGNORES = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const PROTECTED_WRITE_PREFIXES = ['.git', '.ordo/sessions']
const MAX_TEXT_BYTES = 1_000_000

export interface RepositoryToolOptions {
  readonly commandTimeoutMs?: number
  readonly maxOutputBytes?: number
  readonly ignoredDirectories?: readonly string[]
}

function objectArguments(context: ToolExecutionContext): Readonly<Record<string, unknown>> {
  return context.call.arguments
}

function stringArgument(
  context: ToolExecutionContext,
  name: string,
  options: { optional?: boolean } = {}
): string | undefined {
  const value = objectArguments(context)[name]
  if (value === undefined && options.optional) {
    return undefined
  }
  if (typeof value !== 'string' || (!options.optional && value.length === 0)) {
    throw new Error(`Tool argument "${name}" must be a non-empty string`)
  }
  return value
}

function booleanArgument(context: ToolExecutionContext, name: string, fallback: boolean): boolean {
  const value = objectArguments(context)[name]
  if (value === undefined) {
    return fallback
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Tool argument "${name}" must be a boolean`)
  }
  return value
}

function numberArgument(
  context: ToolExecutionContext,
  name: string,
  fallback: number,
  maximum: number
): number {
  const value = objectArguments(context)[name]
  if (value === undefined) {
    return fallback
  }
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new Error(`Tool argument "${name}" must be an integer between 1 and ${maximum}`)
  }
  return Number(value)
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function normalizeRelative(value: string): string {
  if (path.isAbsolute(value)) {
    throw new Error('Repository paths must be relative')
  }
  const normalized = path.normalize(value).replaceAll('\\', '/')
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Repository path escapes the repository root')
  }
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '')
}

async function resolvedRoot(repositoryRoot: string): Promise<string> {
  return realpath(repositoryRoot)
}

async function nearestExisting(candidate: string): Promise<string> {
  let current = candidate
  while (true) {
    try {
      await lstat(current)
      return current
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      const parent = path.dirname(current)
      if (parent === current) {
        throw error
      }
      current = parent
    }
  }
}

async function safePath(
  repositoryRoot: string,
  requested: string
): Promise<{
  root: string
  relative: string
  absolute: string
}> {
  const root = await resolvedRoot(repositoryRoot)
  const relative = normalizeRelative(requested)
  const absolute = path.resolve(root, relative)
  if (!isWithin(root, absolute)) {
    throw new Error('Repository path escapes the repository root')
  }
  const existing = await nearestExisting(absolute)
  const canonicalExisting = await realpath(existing)
  if (!isWithin(root, canonicalExisting)) {
    throw new Error('Repository path resolves outside the repository root through a symlink')
  }
  return { root, relative, absolute }
}

function assertWritable(relative: string): void {
  if (
    PROTECTED_WRITE_PREFIXES.some(
      prefix => relative === prefix || relative.startsWith(`${prefix}/`)
    )
  ) {
    throw new Error(`Protected Ordo path cannot be modified: ${relative}`)
  }
}

async function optionalText(absolute: string): Promise<string | undefined> {
  try {
    const info = await stat(absolute)
    if (!info.isFile()) {
      throw new Error('Target is not a file')
    }
    if (info.size > MAX_TEXT_BYTES) {
      throw new Error(`File exceeds ${MAX_TEXT_BYTES} bytes`)
    }
    const buffer = await readFile(absolute)
    if (buffer.includes(0)) {
      throw new Error('Binary files are not supported')
    }
    return buffer.toString('utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function digest(content: string | undefined): string | null {
  return content === undefined ? null : createHash('sha256').update(content).digest('hex')
}

function unifiedDiff(relative: string, before: string | undefined, after: string): string {
  if (before === after) {
    return ''
  }
  const oldLines = before?.split('\n') ?? []
  const newLines = after.split('\n')
  const body = [
    `--- ${before === undefined ? '/dev/null' : `a/${relative}`}`,
    `+++ b/${relative}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map(line => `-${line}`),
    ...newLines.map(line => `+${line}`)
  ].join('\n')
  return body.length > 100_000 ? `${body.slice(0, 100_000)}\n... diff truncated ...` : body
}

async function writePreview(context: ToolExecutionContext, content: string) {
  const requested = stringArgument(context, 'path') as string
  const target = await safePath(context.repositoryRoot, requested)
  assertWritable(target.relative)
  const before = await optionalText(target.absolute)
  return Object.freeze({
    path: target.relative,
    operation: before === undefined ? 'create' : 'overwrite',
    beforeHash: digest(before),
    afterHash: digest(content),
    diff: unifiedDiff(target.relative, before, content)
  })
}

async function walkFiles(
  root: string,
  directory: string,
  ignored: ReadonlySet<string>,
  output: string[],
  limit: number
): Promise<void> {
  if (output.length >= limit) {
    return
  }
  const entries = await readdir(directory, { withFileTypes: true })
  entries.sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    if (output.length >= limit) {
      return
    }
    if (entry.isSymbolicLink()) {
      continue
    }
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) {
        await walkFiles(root, absolute, ignored, output, limit)
      }
    } else if (entry.isFile()) {
      output.push(path.relative(root, absolute).replaceAll('\\', '/'))
    }
  }
}

function outputCollector(limit: number) {
  let value = ''
  let truncated = false
  return {
    append(chunk: Buffer | string) {
      if (truncated) {
        return
      }
      const next = value + chunk.toString()
      if (Buffer.byteLength(next) > limit) {
        value = Buffer.from(next).subarray(0, limit).toString()
        truncated = true
      } else {
        value = next
      }
    },
    result() {
      return { value, truncated }
    }
  }
}

export function createRepositoryTools(options: RepositoryToolOptions = {}): readonly RuntimeTool[] {
  const ignored = new Set([...DEFAULT_IGNORES, ...(options.ignoredDirectories ?? [])])
  const commandTimeoutMs = options.commandTimeoutMs ?? 30_000
  const maxOutputBytes = options.maxOutputBytes ?? 200_000

  const listFiles: RuntimeTool = {
    name: 'list_files',
    description: 'List regular files inside the repository, excluding generated directories.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 5000 }
      },
      additionalProperties: false
    },
    mutating: false,
    async execute(context) {
      const requested = stringArgument(context, 'path', { optional: true }) ?? ''
      const target = await safePath(context.repositoryRoot, requested)
      const info = await stat(target.absolute)
      if (!info.isDirectory()) {
        throw new Error('List target must be a directory')
      }
      const files: string[] = []
      const limit = numberArgument(context, 'limit', 500, 5000)
      await walkFiles(target.root, target.absolute, ignored, files, limit)
      return { files, truncated: files.length >= limit }
    }
  }

  const readFileTool: RuntimeTool = {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the repository.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false
    },
    mutating: false,
    async execute(context) {
      const target = await safePath(
        context.repositoryRoot,
        stringArgument(context, 'path') as string
      )
      const content = await optionalText(target.absolute)
      if (content === undefined) {
        throw new Error(`File not found: ${target.relative}`)
      }
      return { path: target.relative, content, sha256: digest(content) }
    }
  }

  const searchFiles: RuntimeTool = {
    name: 'search_files',
    description: 'Search literal text in repository UTF-8 files.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        path: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 1000 }
      },
      required: ['query'],
      additionalProperties: false
    },
    mutating: false,
    async execute(context) {
      const query = stringArgument(context, 'query') as string
      const requested = stringArgument(context, 'path', { optional: true }) ?? ''
      const target = await safePath(context.repositoryRoot, requested)
      const limit = numberArgument(context, 'limit', 100, 1000)
      const candidates: string[] = []
      const info = await stat(target.absolute)
      if (info.isFile()) {
        candidates.push(target.relative)
      } else if (info.isDirectory()) {
        await walkFiles(target.root, target.absolute, ignored, candidates, 5000)
      } else {
        throw new Error('Search target must be a file or directory')
      }
      const matches: Array<{ path: string; line: number; text: string }> = []
      for (const relative of candidates) {
        if (matches.length >= limit) {
          break
        }
        let content: string | undefined
        try {
          content = await optionalText(path.join(target.root, relative))
        } catch {
          continue
        }
        for (const [index, line] of (content ?? '').split('\n').entries()) {
          if (line.includes(query)) {
            matches.push({ path: relative, line: index + 1, text: line })
          }
          if (matches.length >= limit) {
            break
          }
        }
      }
      return { query, matches, truncated: matches.length >= limit }
    }
  }

  const writeFileTool: RuntimeTool = {
    name: 'write_file',
    description: 'Create or overwrite a UTF-8 repository file after approval of its diff.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        overwrite: { type: 'boolean', default: false }
      },
      required: ['path', 'content'],
      additionalProperties: false
    },
    mutating: true,
    async preview(context) {
      return writePreview(context, stringArgument(context, 'content') as string)
    },
    async execute(context) {
      const content = stringArgument(context, 'content') as string
      const preview = await writePreview(context, content)
      if (preview.operation === 'overwrite' && !booleanArgument(context, 'overwrite', false)) {
        throw new Error('File exists; set overwrite=true to replace it')
      }
      const target = await safePath(
        context.repositoryRoot,
        stringArgument(context, 'path') as string
      )
      await mkdir(path.dirname(target.absolute), { recursive: true })
      await writeFile(target.absolute, content, 'utf8')
      return preview
    }
  }

  const replaceInFile: RuntimeTool = {
    name: 'replace_in_file',
    description:
      'Replace an exact text occurrence in a repository file after approval of its diff.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string' },
        newText: { type: 'string' },
        replaceAll: { type: 'boolean', default: false }
      },
      required: ['path', 'oldText', 'newText'],
      additionalProperties: false
    },
    mutating: true,
    async preview(context) {
      const target = await safePath(
        context.repositoryRoot,
        stringArgument(context, 'path') as string
      )
      assertWritable(target.relative)
      const before = await optionalText(target.absolute)
      if (before === undefined) {
        throw new Error(`File not found: ${target.relative}`)
      }
      const oldText = stringArgument(context, 'oldText') as string
      const count = before.split(oldText).length - 1
      if (count === 0) {
        throw new Error('oldText was not found')
      }
      const replaceAll = booleanArgument(context, 'replaceAll', false)
      if (count > 1 && !replaceAll) {
        throw new Error('oldText is not unique; set replaceAll=true')
      }
      const newText = stringArgument(context, 'newText', { optional: true }) ?? ''
      const after = replaceAll
        ? before.replaceAll(oldText, newText)
        : before.replace(oldText, newText)
      return Object.freeze({
        path: target.relative,
        replacements: replaceAll ? count : 1,
        beforeHash: digest(before),
        afterHash: digest(after),
        diff: unifiedDiff(target.relative, before, after),
        content: after
      })
    },
    async execute(context) {
      const preview = (await this.preview?.(context)) as {
        path: string
        content: string
        [key: string]: unknown
      }
      const target = await safePath(context.repositoryRoot, preview.path)
      await writeFile(target.absolute, preview.content, 'utf8')
      const { content: _content, ...result } = preview
      return result
    }
  }

  const runCommand: RuntimeTool = {
    name: 'run_command',
    description: 'Run an executable without a shell in a repository directory.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
        cwd: { type: 'string' },
        timeoutMs: { type: 'integer', minimum: 1, maximum: 120000 }
      },
      required: ['command'],
      additionalProperties: false
    },
    mutating: true,
    async preview(context) {
      const command = stringArgument(context, 'command') as string
      const rawArgs = objectArguments(context).args ?? []
      if (!Array.isArray(rawArgs) || rawArgs.some(value => typeof value !== 'string')) {
        throw new Error('Tool argument "args" must be an array of strings')
      }
      const cwd = stringArgument(context, 'cwd', { optional: true }) ?? ''
      const target = await safePath(context.repositoryRoot, cwd)
      if (!(await stat(target.absolute)).isDirectory()) {
        throw new Error('Command cwd must be a directory')
      }
      return { command, args: rawArgs, cwd: target.relative || '.', shell: false }
    },
    async execute(context) {
      const preview = (await this.preview?.(context)) as {
        command: string
        args: string[]
        cwd: string
      }
      const cwd = await safePath(context.repositoryRoot, preview.cwd)
      const timeout = numberArgument(context, 'timeoutMs', commandTimeoutMs, 120_000)
      const stdout = outputCollector(maxOutputBytes)
      const stderr = outputCollector(maxOutputBytes)
      const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          const child = spawn(preview.command, preview.args, {
            cwd: cwd.absolute,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
          })
          const timer = setTimeout(() => child.kill('SIGTERM'), timeout)
          child.stdout.on('data', chunk => stdout.append(chunk))
          child.stderr.on('data', chunk => stderr.append(chunk))
          child.on('error', error => {
            clearTimeout(timer)
            reject(error)
          })
          child.on('close', (exitCode, signal) => {
            clearTimeout(timer)
            resolve({ exitCode, signal })
          })
        }
      )
      const out = stdout.result()
      const err = stderr.result()
      return {
        ...preview,
        ...result,
        stdout: out.value,
        stderr: err.value,
        stdoutTruncated: out.truncated,
        stderrTruncated: err.truncated
      }
    }
  }

  return Object.freeze([
    listFiles,
    readFileTool,
    searchFiles,
    writeFileTool,
    replaceInFile,
    runCommand
  ])
}
