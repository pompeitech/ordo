import path from 'node:path'
import type { AdapterId, ConflictStrategy, ContentKind } from '@pompeitech/ordo-core'
import { inspectAgents } from './commands/agents.js'
import { detectRepository } from './commands/detect.js'
import { diagnoseRepository } from './commands/doctor.js'
import { initializeRepository } from './commands/init.js'
import { installRepository } from './commands/install.js'
import { inspectRules } from './commands/rules.js'
import { inspectSkills } from './commands/skills.js'
import { inspectWorkflows } from './commands/workflows.js'
import { CliUsageError, formatCliError } from './errors.js'
import {
  formatCatalogReport,
  formatDetectReport,
  formatDoctorReport,
  formatInitContinuation,
  formatInitReport,
  formatInstallReport
} from './output/console.js'
import { formatJson } from './output/json.js'
import { createOutputTheme, formatLogo } from './output/theme.js'
import {
  createTerminalInitPrompter,
  discoverDefaultContentRoot,
  type InitPrompter,
  runInitWizard
} from './prompts/init.js'

export const CLI_VERSION = '1.0.0'

export interface CliWriter {
  readonly isTTY?: boolean
  write(chunk: string): unknown
}

export interface CliDependencies {
  readonly cwd?: string
  readonly stdin?: { readonly isTTY?: boolean }
  readonly stdout?: CliWriter
  readonly stderr?: CliWriter
  readonly version?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly prompter?: InitPrompter
  readonly fetch?: typeof globalThis.fetch
}

interface DetectArguments {
  readonly directory: string
  readonly json: boolean
  readonly help: boolean
}

interface DoctorArguments {
  readonly directory: string
  readonly contentRoot?: string
  readonly json: boolean
  readonly help: boolean
}

interface InitArguments {
  readonly directory: string
  readonly adapters: readonly AdapterId[]
  readonly contentRoot?: string
  readonly conflictStrategy?: ConflictStrategy
  readonly prune?: boolean
  readonly force: boolean
  readonly interactive?: boolean
  readonly yes: boolean
  readonly json: boolean
  readonly help: boolean
}

interface InstallArguments {
  readonly directory: string
  readonly contentRoot?: string
  readonly dryRun: boolean
  readonly json: boolean
  readonly help: boolean
}

interface CatalogArguments {
  readonly directory: string
  readonly contentRoot?: string
  readonly id?: string
  readonly json: boolean
  readonly help: boolean
}

const CATALOG_COMMANDS = ['agents', 'rules', 'skills', 'workflows'] as const
const CATALOG_INSPECTORS = {
  agents: inspectAgents,
  rules: inspectRules,
  skills: inspectSkills,
  workflows: inspectWorkflows
} as const

const HELP = `Ordo — deterministic agent engineering harness

Usage: ordo detect [directory] [--json]
       ordo doctor [directory] [--content-root <directory>] [--json]
       ordo init [directory] [--interactive|--non-interactive] [options]
       ordo install [directory] [--content-root <directory>] [--dry-run] [--json]
       ordo <agents|rules|skills|workflows> [directory] [--id <name>] [--json]
       ordo --help
       ordo --version

Commands:
  detect [directory]  Inspect repository, package manager, stack, and AI harnesses
  doctor [directory]  Diagnose repository, configuration, catalog, and installation state
  init [directory]    Create an Ordo configuration
  install [directory] Plan and install configured content safely
  agents [directory]  Inspect canonical agents
  rules [directory]   Inspect canonical rules
  skills [directory]  Inspect canonical skills
  workflows [directory] Inspect canonical workflows

Options:
  -j, --json          Emit a machine-readable JSON report
  -h, --help          Show help
  -v, --version       Show the Ordo CLI version
`

const DOCTOR_HELP = `Usage: ordo doctor [directory] [--content-root <directory>] [--json]

Diagnose repository discovery, runtime support, package-manager evidence,
configuration, canonical content, installation state, and available adapters.

Options:
  --content-root <directory>  Validate content from an explicit catalog root
  -j, --json                  Emit the complete DoctorReport as JSON
  -h, --help                  Show doctor help
`

const INIT_HELP = `Usage: ordo init [directory] [--interactive|--non-interactive] [options]

Create an ordo.config.json file at the repository root. A terminal session starts
the guided wizard by default. Use --yes or --non-interactive for automation.

Options:
  --adapter <name>             Configure claude or codex; may be repeated
  --content-root <directory>   Save the canonical content catalog location
  --conflict-strategy <mode>   Use error, skip, or overwrite
  --prune, --no-prune          Enable or disable stale owned-file removal
  -i, --interactive            Force the guided wizard
  --non-interactive            Disable the guided wizard
  -y, --yes                    Accept safe non-interactive defaults
  --force                      Replace an existing Ordo configuration
  -j, --json                   Emit the complete InitReport as JSON
  -h, --help                   Show init help
`

const INSTALL_HELP = `Usage: ordo install [directory] [--content-root <directory>] [--dry-run] [--json]

Load the canonical catalog, create a deterministic installation plan, and apply
it atomically when no conflicts exist.

Options:
  --content-root <directory>  Install from an explicit catalog root
  --dry-run                   Report actions without writing files or state
  -j, --json                  Emit the complete InstallReport as JSON
  -h, --help                  Show install help
`

function catalogHelp(command: ContentKind): string {
  return `Usage: ordo ${command} [directory] [--id <name>] [--content-root <directory>] [--json]

List canonical ${command}, or inspect one complete Markdown source with --id.

Options:
  --id <name>                 Inspect one exact catalog entry
  --content-root <directory>  Inspect an explicit catalog root
  -j, --json                  Emit a versioned catalog report as JSON
  -h, --help                  Show ${command} help
`
}

function isCatalogCommand(value: string): value is ContentKind {
  return (CATALOG_COMMANDS as readonly string[]).includes(value)
}

function shouldUseColor(
  writer: CliWriter,
  env: Readonly<Record<string, string | undefined>>
): boolean {
  if ('NO_COLOR' in env) {
    return false
  }

  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== '0'
  }

  if (env.TERM === 'dumb') {
    return false
  }

  return writer.isTTY === true
}

function formatHumanOutput(value: string, color: boolean): string {
  return `${formatLogo(color)}\n\n${value}`
}

function parseDetectArguments(args: readonly string[], cwd: string): DetectArguments {
  let directory: string | null = null
  let json = false
  let help = false

  for (const argument of args) {
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for detect: ${argument}`)
    }

    if (directory) {
      throw new CliUsageError('The detect command accepts at most one directory')
    }

    directory = argument
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    json,
    help
  }
}

function parseDoctorArguments(args: readonly string[], cwd: string): DoctorArguments {
  let directory: string | null = null
  let contentRoot: string | undefined
  let json = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--content-root') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError('The --content-root option requires a directory')
      }

      contentRoot = path.resolve(cwd, value)
      index += 1
      continue
    }

    if (!argument) {
      continue
    }

    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for doctor: ${argument}`)
    }

    if (directory) {
      throw new CliUsageError('The doctor command accepts at most one repository directory')
    }

    directory = argument
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    contentRoot,
    json,
    help
  }
}

function parseInitArguments(args: readonly string[], cwd: string): InitArguments {
  let directory: string | null = null
  const adapters: AdapterId[] = []
  let contentRoot: string | undefined
  let conflictStrategy: ConflictStrategy | undefined
  let prune: boolean | undefined
  let force = false
  let interactive: boolean | undefined
  let yes = false
  let json = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--force') {
      force = true
      continue
    }

    if (argument === '--interactive' || argument === '-i') {
      if (interactive === false) {
        throw new CliUsageError('--interactive cannot be combined with --non-interactive')
      }

      interactive = true
      continue
    }

    if (argument === '--non-interactive') {
      if (interactive === true) {
        throw new CliUsageError('--non-interactive cannot be combined with --interactive')
      }

      interactive = false
      continue
    }

    if (argument === '--yes' || argument === '-y') {
      yes = true
      continue
    }

    if (argument === '--prune' || argument === '--no-prune') {
      const value = argument === '--prune'
      if (prune !== undefined && prune !== value) {
        throw new CliUsageError('--prune cannot be combined with --no-prune')
      }

      prune = value
      continue
    }

    if (argument === '--content-root') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError('The --content-root option requires a directory')
      }

      contentRoot = path.resolve(cwd, value)
      index += 1
      continue
    }

    if (argument === '--conflict-strategy') {
      const value = args[index + 1]
      if (value !== 'error' && value !== 'skip' && value !== 'overwrite') {
        throw new CliUsageError('The --conflict-strategy option requires error, skip, or overwrite')
      }

      conflictStrategy = value
      index += 1
      continue
    }

    if (argument === '--adapter') {
      const value = args[index + 1]
      if (value !== 'claude' && value !== 'codex') {
        throw new CliUsageError('The --adapter option requires claude or codex')
      }

      if (adapters.includes(value)) {
        throw new CliUsageError(`Duplicate adapter option: ${value}`)
      }

      adapters.push(value)
      index += 1
      continue
    }

    if (!argument) {
      continue
    }

    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for init: ${argument}`)
    }

    if (directory) {
      throw new CliUsageError('The init command accepts at most one repository directory')
    }

    directory = argument
  }

  if (interactive && json) {
    throw new CliUsageError('--interactive cannot be combined with --json')
  }

  if (interactive && yes) {
    throw new CliUsageError('--interactive cannot be combined with --yes')
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    adapters: Object.freeze(adapters),
    contentRoot,
    conflictStrategy,
    prune,
    force,
    interactive,
    yes,
    json,
    help
  }
}

function parseInstallArguments(args: readonly string[], cwd: string): InstallArguments {
  let directory: string | null = null
  let contentRoot: string | undefined
  let dryRun = false
  let json = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--dry-run') {
      dryRun = true
      continue
    }

    if (argument === '--content-root') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError('The --content-root option requires a directory')
      }

      contentRoot = path.resolve(cwd, value)
      index += 1
      continue
    }

    if (!argument) {
      continue
    }

    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for install: ${argument}`)
    }

    if (directory) {
      throw new CliUsageError('The install command accepts at most one repository directory')
    }

    directory = argument
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    contentRoot,
    dryRun,
    json,
    help
  }
}

function parseCatalogArguments(
  command: ContentKind,
  args: readonly string[],
  cwd: string
): CatalogArguments {
  let directory: string | null = null
  let contentRoot: string | undefined
  let id: string | undefined
  let json = false
  let help = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }

    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }

    if (argument === '--id') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError('The --id option requires a catalog entry id')
      }

      if (id) {
        throw new CliUsageError('The --id option may be provided only once')
      }

      id = value
      index += 1
      continue
    }

    if (argument === '--content-root') {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError('The --content-root option requires a directory')
      }

      contentRoot = path.resolve(cwd, value)
      index += 1
      continue
    }

    if (!argument) {
      continue
    }

    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for ${command}: ${argument}`)
    }

    if (directory) {
      throw new CliUsageError(`The ${command} command accepts at most one repository directory`)
    }

    directory = argument
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    contentRoot,
    id,
    json,
    help
  }
}

export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies = {}
): Promise<number> {
  const cwd = path.resolve(dependencies.cwd ?? process.cwd())
  const stdout = dependencies.stdout ?? process.stdout
  const stderr = dependencies.stderr ?? process.stderr
  const stdin = dependencies.stdin ?? process.stdin
  const version = dependencies.version ?? CLI_VERSION
  const env = dependencies.env ?? process.env
  const color = shouldUseColor(stdout, env)

  try {
    const command = args[0]
    if (!command || command === '--help' || command === '-h') {
      stdout.write(formatHumanOutput(HELP, color))

      return 0
    }

    if (command === '--version' || command === '-v') {
      stdout.write(`${version}\n`)

      return 0
    }

    if (command.startsWith('-')) {
      throw new CliUsageError(`Unknown option: ${command}`)
    }

    if (command === 'detect') {
      const options = parseDetectArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(HELP, color))

        return 0
      }

      const report = await detectRepository(options.directory)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatDetectReport(report, { color }), color)
      )

      return 0
    }

    if (command === 'doctor') {
      const options = parseDoctorArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(DOCTOR_HELP, color))

        return 0
      }

      const report = await diagnoseRepository({
        directory: options.directory,
        contentRoot: options.contentRoot
      })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatDoctorReport(report, { color }), color)
      )

      return report.healthy ? 0 : 1
    }

    if (command === 'init') {
      const options = parseInitArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(INIT_HELP, color))

        return 0
      }

      const interactive =
        options.interactive ??
        (!options.json && !options.yes && stdin.isTTY === true && stdout.isTTY === true)
      if (interactive) {
        const prompter = dependencies.prompter ?? createTerminalInitPrompter()
        try {
          const wizard = await runInitWizard(
            {
              directory: options.directory,
              adapters: options.adapters,
              contentRoot: options.contentRoot,
              conflictStrategy: options.conflictStrategy,
              prune: options.prune,
              force: options.force
            },
            prompter
          )
          const report = await initializeRepository(wizard)
          stdout.write(formatHumanOutput(formatInitReport(report, { color }), color))
          if (wizard.installNow) {
            stdout.write('\n')
            const installReport = await installRepository({ directory: options.directory })
            stdout.write(formatInstallReport(installReport, { color }))

            return installReport.conflicts.length === 0 ? 0 : 1
          }

          stdout.write(formatInitContinuation({ color }))

          return 0
        } finally {
          prompter.close()
        }
      }

      const contentRoot =
        options.contentRoot ?? (await discoverDefaultContentRoot(options.directory))
      const report = await initializeRepository({
        directory: options.directory,
        adapters: options.adapters.length > 0 ? options.adapters : ['claude', 'codex'],
        contentRoot,
        conflictStrategy: options.conflictStrategy,
        prune: options.prune,
        force: options.force
      })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatInitReport(report, { color }), color)
      )

      return 0
    }

    if (command === 'install') {
      const options = parseInstallArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(INSTALL_HELP, color))

        return 0
      }

      const report = await installRepository(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatInstallReport(report, { color }), color)
      )

      return report.conflicts.length === 0 ? 0 : 1
    }

    if (isCatalogCommand(command)) {
      const options = parseCatalogArguments(command, args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(catalogHelp(command), color))

        return 0
      }

      const report = await CATALOG_INSPECTORS[command]({
        directory: options.directory,
        contentRoot: options.contentRoot,
        id: options.id
      })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatCatalogReport(report, { color }), color)
      )

      return 0
    }

    throw new CliUsageError(`Unknown command: ${command}`)
  } catch (error) {
    const errorMessage = formatCliError(error)
    let formattedError = errorMessage
    if (shouldUseColor(stderr, env)) {
      formattedError = createOutputTheme(true).danger(`× ${errorMessage}`)
    }

    stderr.write(`${formattedError}\n`)
    if (error instanceof CliUsageError) {
      stderr.write('Run "ordo --help" for usage.\n')

      return 2
    }

    return 1
  }
}
