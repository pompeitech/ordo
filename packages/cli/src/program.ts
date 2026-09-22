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

interface MiniCpmArguments {
  readonly action: 'chat' | 'setup' | 'start' | 'stop' | 'status' | 'models'
  readonly directory: string
  readonly baseUrl?: string
  readonly model?: string
  readonly backend?: 'auto' | 'docker-llama-cpp' | 'ollama'
  readonly prompt?: string
  readonly tools: boolean
  readonly autoApprove: boolean
  readonly maxTokens: number
  readonly maxToolTurns: number
  readonly sessionName?: string | null
  readonly port?: number
  readonly contextSize?: number
  readonly accelerator?: 'auto' | 'cpu' | 'cuda'
  readonly force: boolean
  readonly start: boolean
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

const _AGENT_HELP = `Usage: ordo agent [chat] [directory] [options]
       ordo agent setup [directory] [runtime options]
       ordo agent <start|stop|status|models> [directory]

Commands:
  chat      Start the terminal coding agent (default)
  setup     Configure a local model runtime, pull the model, and start it
  start     Start the configured local runtime
  stop      Stop it while preserving the downloaded model
  status    Show Docker and API health
  models    List supported model presets

Chat options:
  --base-url <url>              Override the configured API base URL
  --model <name>                Override the configured served model name
  -p, --prompt <text>           Run one request and exit
  --no-tools                    Disable repository tools and use plain chat
  --max-tokens <number>         Maximum completion tokens (default: 2048)
  --max-tool-turns <number>     Tool rounds before a resumable pause (default: 48)
  --session <name>              Persistent local session (default: default)
  --no-session                  Disable session persistence
  --dangerously-auto-approve    Allow writes and commands without confirmation

Setup options:
  --model <preset>              Model preset (default: devstral-small-2-q4)
  --backend <name>              Runtime backend: auto, docker-llama-cpp, or ollama
  --port <number>               Local API port (default: 8080)
  --context-size <number>       Context window (default: 8192)
  --accelerator <auto|cpu|cuda> Runtime accelerator (default: auto)
  --no-start                    Configure and pull the image without starting
  --force                       Replace an existing runtime configuration
  -h, --help                    Show agent help

Environment:
  ORDO_AGENT_BASE_URL, ORDO_AGENT_MODEL, AGENT_API_KEY
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

function _parseMiniCpmArguments(
  args: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string | undefined>>
): MiniCpmArguments {
  const actions = ['chat', 'setup', 'start', 'stop', 'status', 'models'] as const
  const requestedAction = args[0]
  const action = actions.includes(requestedAction as (typeof actions)[number])
    ? (requestedAction as MiniCpmArguments['action'])
    : 'chat'
  const commandArgs = action === 'chat' && requestedAction !== 'chat' ? args : args.slice(1)
  let directory: string | null = null
  let baseUrl =
    action === 'chat' ? (env.ORDO_AGENT_BASE_URL ?? env.ORDO_MINICPM_BASE_URL) : undefined
  let model = action === 'chat' ? (env.ORDO_AGENT_MODEL ?? env.ORDO_MINICPM_MODEL) : undefined
  let backend: MiniCpmArguments['backend']
  let prompt: string | undefined
  let tools = true
  let autoApprove = false
  let maxTokens = 2048
  let maxToolTurns = 48
  let sessionName: string | null | undefined
  let port: number | undefined
  let contextSize: number | undefined
  let accelerator: MiniCpmArguments['accelerator']
  let force = false
  let start = true
  let help = false

  for (let index = 0; index < commandArgs.length; index += 1) {
    const argument = commandArgs[index]
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (argument === '--no-tools') {
      tools = false
      continue
    }
    if (argument === '--dangerously-auto-approve') {
      autoApprove = true
      continue
    }
    if (argument === '--force') {
      force = true
      continue
    }
    if (argument === '--no-start') {
      start = false
      continue
    }
    if (argument === '--no-session') {
      sessionName = null
      continue
    }
    if (argument === '--accelerator') {
      const value = commandArgs[index + 1]
      if (value !== 'auto' && value !== 'cpu' && value !== 'cuda') {
        throw new CliUsageError('--accelerator requires auto, cpu, or cuda')
      }
      accelerator = value
      index += 1
      continue
    }
    if (
      argument === '--base-url' ||
      argument === '--model' ||
      argument === '--prompt' ||
      argument === '-p' ||
      argument === '--max-tokens' ||
      argument === '--max-tool-turns' ||
      argument === '--session' ||
      argument === '--port' ||
      argument === '--context-size' ||
      argument === '--backend'
    ) {
      const value = commandArgs[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--base-url') {
        baseUrl = value
      } else if (argument === '--model') {
        model = value
      } else if (argument === '--backend') {
        if (value !== 'auto' && value !== 'docker-llama-cpp' && value !== 'ollama') {
          throw new CliUsageError('--backend requires auto, docker-llama-cpp, or ollama')
        }
        backend = value
      } else if (argument === '--prompt' || argument === '-p') {
        prompt = value
      } else if (argument === '--session') {
        sessionName = value
      } else if (argument === '--max-tokens') {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 131072) {
          throw new CliUsageError('--max-tokens requires an integer between 1 and 131072')
        }
        maxTokens = parsed
      } else if (argument === '--max-tool-turns') {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 128) {
          throw new CliUsageError('--max-tool-turns requires an integer between 1 and 128')
        }
        maxToolTurns = parsed
      } else {
        const parsed = Number(value)
        const maximum = argument === '--port' ? 65535 : 131072
        if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
          throw new CliUsageError(`${argument} requires an integer between 1 and ${maximum}`)
        }
        if (argument === '--port') {
          port = parsed
        } else {
          contextSize = parsed
        }
      }
      index += 1
      continue
    }
    if (!argument) {
      continue
    }
    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for agent: ${argument}`)
    }
    if (directory) {
      throw new CliUsageError('The agent command accepts at most one repository directory')
    }
    directory = argument
  }
  try {
    const parsed = baseUrl ? new URL(baseUrl) : null
    if (parsed && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('protocol')
    }
  } catch {
    throw new CliUsageError('--base-url must be an HTTP or HTTPS URL')
  }

  if (
    action !== 'chat' &&
    (baseUrl !== undefined ||
      prompt !== undefined ||
      !tools ||
      autoApprove ||
      maxTokens !== 2048 ||
      maxToolTurns !== 48 ||
      sessionName !== undefined)
  ) {
    throw new CliUsageError(`Chat options cannot be used with "ordo agent ${action}"`)
  }
  if (
    action !== 'setup' &&
    (port !== undefined ||
      contextSize !== undefined ||
      backend !== undefined ||
      accelerator !== undefined ||
      force ||
      !start)
  ) {
    throw new CliUsageError(`Setup options cannot be used with "ordo agent ${action}"`)
  }
  if (action !== 'chat' && action !== 'setup' && model !== undefined) {
    throw new CliUsageError(`--model cannot be used with "ordo agent ${action}"`)
  }

  return {
    action,
    directory: path.resolve(cwd, directory ?? '.'),
    baseUrl,
    model,
    backend,
    prompt,
    tools,
    autoApprove,
    maxTokens,
    maxToolTurns,
    sessionName,
    port,
    contextSize,
    accelerator,
    force,
    start,
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
