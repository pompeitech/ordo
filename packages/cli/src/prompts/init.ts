import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Option as ClackOption } from '@clack/prompts'
import {
  CANCEL_SYMBOL,
  confirm as clackConfirm,
  intro as clackIntro,
  multiselect as clackMultiselect,
  note as clackNote,
  outro as clackOutro,
  select as clackSelect,
  text as clackText
} from '@clack/prompts'
import {
  type AdapterId,
  type ConflictStrategy,
  type ContentCatalog,
  type ContentKind,
  type ContentSelectionConfig,
  findConfigPath,
  inspectRepository,
  loadCatalog,
  OrdoError,
  validateCatalog
} from '@pompeitech/ordo-core'
import type { InitializeRepositoryOptions } from '../commands/init.js'
import { CliUsageError } from '../errors.js'

const CONTENT_KINDS = ['agents', 'rules', 'skills', 'workflows'] as const

interface InitSelectOptions<Value extends string> {
  readonly message: string
  readonly values: readonly {
    readonly value: Value
    readonly label: string
    readonly hint?: string
  }[]
  readonly initialValue: Value
}

interface InitMultiselectOptions<Value extends string> {
  readonly message: string
  readonly values: readonly {
    readonly value: Value
    readonly label: string
    readonly hint?: string
  }[]
  readonly initialValues: readonly Value[]
}

export interface InitPrompter {
  intro(title: string): void
  text(options: { readonly message: string; readonly defaultValue: string }): Promise<string>
  select<Value extends string>(options: InitSelectOptions<Value>): Promise<Value>
  multiselect<Value extends string>(
    options: InitMultiselectOptions<Value>
  ): Promise<readonly Value[]>
  confirm(options: { readonly message: string; readonly initialValue: boolean }): Promise<boolean>
  close(): void
  note(message: string, title?: string): void
  outro(message: string): void
}

export interface InitWizardInput {
  readonly directory: string
  readonly adapters?: readonly AdapterId[]
  readonly contentRoot?: string
  readonly conflictStrategy?: ConflictStrategy
  readonly prune?: boolean
  readonly force?: boolean
}

export interface InitWizardResult extends InitializeRepositoryOptions {
  readonly installNow: boolean
}

function unwrapPrompt<Value>(value: Value | typeof CANCEL_SYMBOL): Value {
  if (value === CANCEL_SYMBOL) {
    throw new CliUsageError('Initialization cancelled')
  }

  return value
}

async function selectPrompt<Value extends string>(
  options: InitSelectOptions<Value>
): Promise<Value> {
  return unwrapPrompt(
    await clackSelect({
      message: options.message,
      options: [...options.values] as ClackOption<Value>[],
      initialValue: options.initialValue
    })
  )
}

async function multiselectPrompt<Value extends string>(
  options: InitMultiselectOptions<Value>
): Promise<readonly Value[]> {
  return unwrapPrompt(
    await clackMultiselect({
      message: options.message,
      options: [...options.values] as ClackOption<Value>[],
      initialValues: [...options.initialValues],
      required: false
    })
  )
}

export function createTerminalInitPrompter(): InitPrompter {
  return {
    intro: title => clackIntro(title),
    text: async options =>
      unwrapPrompt(
        await clackText({
          message: options.message,
          defaultValue: options.defaultValue,
          placeholder: options.defaultValue
        })
      ),
    select: selectPrompt,
    multiselect: multiselectPrompt,
    confirm: async options =>
      unwrapPrompt(
        await clackConfirm({ message: options.message, initialValue: options.initialValue })
      ),
    close: () => {},
    note: (message, title) => clackNote(message, title),
    outro: message => clackOutro(message)
  }
}

async function confirm(
  prompter: InitPrompter,
  label: string,
  defaultValue: boolean
): Promise<boolean> {
  return prompter.confirm({ message: label, initialValue: defaultValue })
}

async function chooseAdapters(prompter: InitPrompter): Promise<readonly AdapterId[]> {
  const choice = await prompter.select({
    message: 'Choose target harnesses',
    values: [
      { value: 'claude', label: 'Claude Code', hint: 'writes repository content to .claude/' },
      {
        value: 'codex',
        label: 'Codex',
        hint: 'writes repository content to .agents/, .codex/, and AGENTS.md'
      },
      { value: 'both', label: 'Claude Code + Codex', hint: 'both hosted coding harnesses' },
      { value: 'all', label: 'Claude Code + Codex', hint: 'all available harnesses' }
    ],
    initialValue: 'both'
  })
  const selected = String(choice)
  if (selected === 'claude') {
    return ['claude']
  }

  if (selected === 'codex') {
    return ['codex']
  }

  if (selected === 'all') {
    return ['claude', 'codex']
  }

  return ['claude', 'codex']
}

async function isValidCatalogRoot(candidate: string): Promise<boolean> {
  try {
    return validateCatalog(await loadCatalog(candidate)).valid
  } catch {
    return false
  }
}

export async function discoverDefaultContentRoot(
  repositoryRoot: string,
  configuredRoot?: string
): Promise<string> {
  if (configuredRoot) {
    return path.resolve(repositoryRoot, configuredRoot)
  }

  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(repositoryRoot, 'content'),
    path.resolve(moduleDirectory, 'content'),
    path.resolve(moduleDirectory, '../content'),
    path.resolve(moduleDirectory, '../../content'),
    path.resolve(moduleDirectory, '../../../content'),
    path.resolve(moduleDirectory, '../../../../content')
  ]
  for (const candidate of [...new Set(candidates)]) {
    if (await isValidCatalogRoot(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

async function chooseCatalogRoot(
  prompter: InitPrompter,
  repositoryRoot: string,
  configuredRoot?: string
): Promise<{ readonly catalog: ContentCatalog; readonly contentRoot: string }> {
  const defaultRoot = await discoverDefaultContentRoot(repositoryRoot, configuredRoot)
  if (await isValidCatalogRoot(defaultRoot)) {
    const catalog = await loadCatalog(defaultRoot)
    prompter.note(defaultRoot, 'Content catalog detected')

    return { catalog, contentRoot: defaultRoot }
  }

  while (true) {
    const answer = (
      await prompter.text({
        message: 'No Ordo content catalog was found. Enter its directory',
        defaultValue: defaultRoot
      })
    ).trim()
    const contentRoot = path.resolve(repositoryRoot, answer || defaultRoot)
    try {
      const catalog = await loadCatalog(contentRoot)
      const validation = validateCatalog(catalog)
      if (!validation.valid) {
        const errors = validation.issues
          .filter(issue => issue.severity === 'error')
          .map(issue => issue.message)
          .join('; ')
        throw new OrdoError('CATALOG_INVALID', errors || 'Catalog validation failed')
      }

      return { catalog, contentRoot }
    } catch (error) {
      prompter.note(
        `${error instanceof Error ? error.message : String(error)}\nChoose another directory or press Ctrl+C to cancel.`,
        'Invalid catalog'
      )
    }
  }
}

async function chooseContent(
  prompter: InitPrompter,
  catalog: ContentCatalog
): Promise<ContentSelectionConfig | undefined> {
  const scope = await prompter.select({
    message: 'Choose the content scope',
    values: [
      { value: 'all', label: 'Install all catalog content', hint: 'recommended' },
      { value: 'custom', label: 'Choose entries by category' }
    ],
    initialValue: 'all'
  })
  if (scope === 'all') {
    return undefined
  }

  const selection: Partial<Record<ContentKind, { readonly include: readonly string[] }>> = {}
  for (const kind of CONTENT_KINDS) {
    const entries = catalog.entries.filter(entry => entry.kind === kind)
    if (entries.length === 0) {
      continue
    }

    const selected = await prompter.multiselect({
      message: `Select ${kind}`,
      values: entries.map(entry => ({
        value: entry.id,
        label: entry.name,
        ...(entry.description ? { hint: entry.description } : {})
      })),
      initialValues: entries.map(entry => entry.id)
    })
    selection[kind] = { include: Object.freeze([...selected]) }
  }

  return Object.freeze(selection)
}

export async function runInitWizard(
  input: InitWizardInput,
  prompter: InitPrompter
): Promise<InitWizardResult> {
  const repository = await inspectRepository(input.directory)
  const existingConfigPath = await findConfigPath(repository.rootDirectory)
  if (existingConfigPath && !input.force) {
    throw new OrdoError(
      'CONFIG_INVALID',
      `Configuration already exists: ${existingConfigPath}. Use --force to replace it.`
    )
  }

  prompter.intro('ORDO // initialize repository')
  const adapters = input.adapters?.length ? input.adapters : await chooseAdapters(prompter)
  const { catalog, contentRoot } = await chooseCatalogRoot(
    prompter,
    repository.rootDirectory,
    input.contentRoot
  )
  const content = await chooseContent(prompter, catalog)
  const conflictStrategy: ConflictStrategy =
    input.conflictStrategy ??
    (await prompter.select<ConflictStrategy>({
      message: 'How should Ordo handle unmanaged file conflicts?',
      values: [
        { value: 'error', label: 'Block installation', hint: 'safest and recommended' },
        { value: 'skip', label: 'Preserve conflicting files' },
        { value: 'overwrite', label: 'Replace conflicting files', hint: 'destructive' }
      ],
      initialValue: 'error'
    }))
  const prune = input.prune ?? (await confirm(prompter, 'Remove stale Ordo-owned files', false))
  const installNow = await confirm(prompter, 'Install the selected content now', true)

  if (adapters.length === 0) {
    throw new CliUsageError('At least one target adapter is required')
  }

  prompter.outro('Configuration choices validated')

  return Object.freeze({
    directory: repository.rootDirectory,
    adapters: Object.freeze([...adapters]),
    contentRoot,
    content,
    conflictStrategy,
    prune,
    force: input.force,
    installNow
  })
}
