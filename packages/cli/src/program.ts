import path from 'node:path'
import { confirm as clackConfirm } from '@clack/prompts'
import {
  type AdapterId,
  type ArchitectureComponent,
  type ConflictStrategy,
  type ContentKind,
  isOrdoError,
  type PlanStepInput,
  type PlanStepStatus,
  type ProfileCatalogKind,
  type ProfileEntryMode,
  type SpecStatus,
  type StepReviewDecision
} from '@pompeitech/ordo-core'
import {
  type AgentApprovalDecision,
  type AgentApprovalRequest,
  defaultUsageStatePath
} from '@pompeitech/ordo-runtime'
import { runAgent } from './commands/agent.js'
import { inspectAgents } from './commands/agents.js'
import { type ArchitectAction, manageArchitect } from './commands/architect.js'
import { type BrainstormAction, manageBrainstorm } from './commands/brainstorm.js'
import { type ContextAction, manageContext } from './commands/context.js'
import { detectRepository } from './commands/detect.js'
import { diagnoseRepository } from './commands/doctor.js'
import { initializeRepository } from './commands/init.js'
import { installRepository } from './commands/install.js'
import { managePlan, type PlanAction } from './commands/plan.js'
import { manageProfile, type ProfileAction } from './commands/profile.js'
import { inspectRules } from './commands/rules.js'
import { manageSession, type SessionAction } from './commands/session.js'
import { inspectSkills } from './commands/skills.js'
import { manageSpec, type SpecAction } from './commands/spec.js'
import { reportStatus } from './commands/status.js'
import { inspectWorkflows } from './commands/workflows.js'
import { CliUsageError, formatCliError } from './errors.js'
import {
  formatArchitectReport,
  formatBrainstormReport,
  formatCatalogReport,
  formatContextReport,
  formatDetectReport,
  formatDoctorReport,
  formatInitContinuation,
  formatInitReport,
  formatInstallReport,
  formatPlanReport,
  formatProfileReport,
  formatSessionReport,
  formatSpecReport,
  formatStatusReport
} from './output/console.js'
import { formatJson } from './output/json.js'
import { createOutputTheme, formatLogo } from './output/theme.js'
import {
  createTerminalInitPrompter,
  discoverDefaultContentRoot,
  type InitPrompter,
  runInitWizard
} from './prompts/init.js'

export const CLI_VERSION = '1.0.1'

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
  readonly claudeCommand?: string
  readonly codexCommand?: string
  readonly approvalHandler?: (
    request: AgentApprovalRequest
  ) => AgentApprovalDecision | Promise<AgentApprovalDecision>
  readonly signal?: AbortSignal
}

interface DetectArguments {
  readonly directory: string
  readonly json: boolean
  readonly help: boolean
}

interface AgentArguments {
  readonly kind: 'claude' | 'codex'
  readonly directory: string
  readonly specId?: string
  readonly planId?: string
  readonly stepId?: string
  readonly prompt?: string
  readonly agentId?: string
  readonly skillIds: readonly string[]
  readonly ruleIds: readonly string[]
  readonly contentRoot?: string
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

interface ContextArguments {
  readonly directory: string
  readonly action: ContextAction
  readonly value?: string
  readonly json: boolean
  readonly help: boolean
}

interface SessionArguments {
  readonly directory: string
  readonly action: SessionAction
  readonly sessionId?: string
  readonly title?: string
  readonly provider?: string
  readonly model?: string
  readonly contextSnapshotId?: string
  readonly agentId?: string
  readonly ruleIds: readonly string[]
  readonly skillIds: readonly string[]
  readonly contentRoot?: string
  readonly prompt?: string
  readonly baseUrl?: string
  readonly allowTools: readonly string[]
  readonly maxOutputTokens?: number
  readonly json: boolean
  readonly help: boolean
}

interface SpecArguments {
  readonly directory: string
  readonly action: SpecAction
  readonly id?: string
  readonly title?: string
  readonly objective?: string
  readonly acceptanceCriteria?: string
  readonly status?: SpecStatus
  readonly dryRun: boolean
  readonly json: boolean
  readonly help: boolean
}

interface PlanArguments {
  readonly directory: string
  readonly action: PlanAction
  readonly id?: string
  readonly title?: string
  readonly specId?: string
  readonly steps: readonly PlanStepInput[]
  readonly stepId?: string
  readonly sessionId?: string
  readonly status?: Extract<
    PlanStepStatus,
    'completed' | 'error' | 'paused' | 'cancelled' | 'skipped'
  >
  readonly decision?: StepReviewDecision
  readonly note?: string
  readonly rejectFiles: readonly string[]
  readonly rejectAll: boolean
  readonly diff: boolean
  readonly dryRun: boolean
  readonly json: boolean
  readonly help: boolean
}

interface ArchitectArguments {
  readonly directory: string
  readonly action: ArchitectAction
  readonly id?: string
  readonly title?: string
  readonly specId?: string
  readonly impact: readonly string[]
  readonly components: readonly ArchitectureComponent[]
  readonly contracts: readonly string[]
  readonly decisions: readonly string[]
  readonly risks: readonly string[]
  readonly dryRun: boolean
  readonly json: boolean
  readonly help: boolean
}

interface BrainstormArguments {
  readonly directory: string
  readonly action: BrainstormAction
  readonly id?: string
  readonly title?: string
  readonly problem?: string
  readonly assumptions: readonly string[]
  readonly openQuestions: readonly string[]
  readonly alternativeId?: string
  readonly summary?: string
  readonly benefits: readonly string[]
  readonly tradeoffs: readonly string[]
  readonly risks: readonly string[]
  readonly specId?: string
  readonly acceptanceCriteria?: string
  readonly dryRun: boolean
  readonly json: boolean
  readonly help: boolean
}

interface ProfileArguments {
  readonly directory: string
  readonly action: ProfileAction
  readonly contentRoot?: string
  readonly agentIds: readonly string[]
  readonly ruleIds: readonly string[]
  readonly skillIds: readonly string[]
  readonly defaultAgentId?: string
  readonly kind?: ProfileCatalogKind
  readonly id?: string
  readonly mode?: ProfileEntryMode
  readonly dryRun: boolean
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
       ordo context [init|preview|snapshot] [directory] [--json]
       ordo context <add|hide|show|remove> <entry> [--repository <directory>] [--json]
       ordo profile <init|show|validate|set> [options]
       ordo session <create|list|show|export> [options]
       ordo agent <claude|codex> --spec <id> --plan <id> [--step <id>] [options]
       ordo spec <create|list|show|validate|status> [options]
       ordo plan <create|list|show|validate|run|finish> [options]
       ordo brainstorm <create|list|show|add|select|crystallize> [options]
       ordo architect <create|list|show|approve> [options]
       ordo status [directory] [--spec <id>] [--json]
       ordo <agents|rules|skills|workflows> [directory] [--id <name>] [--json]
       ordo --help
       ordo --version

Commands:
  detect [directory]  Inspect repository, package manager, stack, and AI harnesses
  doctor [directory]  Diagnose repository, configuration, catalog, and installation state
  init [directory]    Create an Ordo configuration
  install [directory] Plan and install configured content safely
  context              Manage repository-local knowledge and preview model context
  profile              Configure shared repository agents, skills, rules, and workflows
  session              Create, inspect, list, and export persistent sessions
  agent <claude|codex> Execute an Ordo plan step through the selected local coding harness
  spec                 Create and validate versioned engineering specifications
  plan                 Create and execute dependency-aware implementation plans
  brainstorm           Explore alternatives and crystallize a selected approach into a spec
  architect            Propose and approve the architecture that implements a spec
  status               Show where each requirement is in the workflow, or one decision's trail
  agents [directory]  Inspect canonical agents
  rules [directory]   Inspect canonical rules
  skills [directory]  Inspect canonical skills
  workflows [directory] Inspect canonical workflows

Options:
  -j, --json          Emit a machine-readable JSON report
  -h, --help          Show help
  -v, --version       Show the Ordo CLI version
`

function safeApprovalDisplay(value: string): string {
  const safe = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
  return safe.length > 4_000 ? `${safe.slice(0, 4_000)}… [truncated]` : safe
}

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

const CONTEXT_HELP = `Usage: ordo context [directory] [--json]
       ordo context init [directory] [--json]
       ordo context preview [directory] [--json]
       ordo context snapshot [directory] [--json]
       ordo context add <path> [--repository <directory>] [--json]
       ordo context <hide|show|remove> <id-or-path> [--repository <directory>] [--json]

Create and govern repository-local project memory. Preview prints the exact
context blocks prepared for a future model call and an estimated token budget.

Options:
  --repository <directory>  Resolve the repository from this directory
  -j, --json                Emit a machine-readable context report
  -h, --help                Show context help
`

const SESSION_HELP = `Usage: ordo session create --title <title> [options]
       ordo session list [directory] [--json]
       ordo session <show|export> <session-id> [--repository <directory>] [--json]
       ordo session run <session-id> --prompt <text> [options]

Manage provider-neutral, repository-local session records and append-only event logs.

Options:
  --title <title>             Set the title for a new session
  --provider <provider>       Record the selected provider
  --model <model>             Record the selected model
  --context-snapshot <id>     Link an immutable context snapshot
  --agent <id>                Select an agent allowed by the shared project profile
  --rule <id>                  Apply an enabled rule from the shared project profile; may be repeated
  --skill <id>                Enable a skill allowed by the shared project profile; may be repeated
  --content-root <directory>  Override the shared content catalog for profile validation (create/run)
  --prompt <text>              Send a new prompt to the configured provider
  --base-url <url>             Override the provider endpoint; required for compatible providers
  --allow-tool <name>          Approve one mutating tool for this session; may be repeated
  --max-output-tokens <count>  Limit model output tokens
  --repository <directory>    Resolve the repository from this directory
  -j, --json                  Emit a machine-readable session report
  -h, --help                  Show session help
`

const AGENT_HELP = `Usage: ordo agent <claude|codex> --spec <id> --plan <id> [--step <id>] [options]

Execute a ready spec's ready plan step using the selected locally installed coding harness.
Ordo snapshots shared project context, records the task in an Ordo session, and
passes the spec, step, selected profile content, and snapshot to Claude Code.
Supported harnesses: Claude Code CLI and Codex app-server. After the agent finishes, the plan step is paused for human review/verification.
Ctrl-C stops the child process and leaves the Ordo session and plan step paused (exit code 130).
Credentials and base permission policy stay with the selected harness; Codex approvals are per-operation and allow is never the default. Non-interactive runs without an approval handler deny them.

Options:
  --spec <id>                 Ready Ordo specification
  --plan <id>                 Plan linked to that specification
  --step <id>                 Ready plan step (otherwise the first ready step)
  --prompt <text>             Additional task-specific instruction
  --agent <id>                Select an agent allowed by the shared project profile
  --skill <id>                Select an enabled skill; may be repeated
  --rule <id>                 Select an enabled rule; may be repeated
  --content-root <directory>  Override the canonical shared content catalog
  --repository <directory>    Resolve the repository from this directory
  -j, --json                  Emit a machine-readable report
  -h, --help                  Show agent help
`

const PROFILE_HELP = `Usage: ordo profile init [options]
       ordo profile <show|validate> [--repository <directory>] [options]
       ordo profile set <agents|rules|skills|workflows> <id> --mode <mode> [options]

Manage the repository-shared .ordo/profile.json. It references canonical content IDs;
it does not copy agent or skill prompts into the project.

Options:
  --agent <id>                Include an allowed agent; may be repeated (init only)
  --rule <id>                 Mark a rule as the session default; may be repeated (init only)
  --skill <id>                Include an allowed skill; may be repeated (init only)
  --default-agent <id>        Set the session default agent (init only)
  --mode <mode>               enabled|recommended|default|required|disabled (set only)
  --content-root <directory>  Use an explicit content catalog
  --repository <directory>    Resolve the repository from this directory
  --dry-run                   Preview profile creation or update without writing
  -j, --json                  Emit a machine-readable report
  -h, --help                  Show profile help
`

const SPEC_HELP = `Usage: ordo spec create --title <title> --objective <text> --acceptance <text> [options]
       ordo spec list [directory] [--json]
       ordo spec <show|validate> <id> [--repository <directory>] [--json]
       ordo spec status <id> --status <status> [--dry-run] [--json]

Manage repository-local Markdown specifications. Mutating actions support --dry-run.

Options:
  --id <id>                    Set the id for a new spec
  --title <title>              Set the spec title
  --objective <text>           Set the objective
  --acceptance <text>          Set acceptance criteria
  --status <status>            draft, ready, implemented, verified, or superseded
  --repository <directory>     Resolve the repository from this directory
  --dry-run                    Preview without writing
  -j, --json                   Emit a machine-readable report
  -h, --help                   Show spec help
`

const PLAN_HELP = `Usage: ordo plan create --title <title> --spec <id> --step <json> [options]
       ordo plan list [directory] [--json]
       ordo plan <show|validate> <id> [--repository <directory>] [--json]
       ordo plan run <id> [--step-id <id>] [--session <id>] [--dry-run] [--json]
       ordo plan finish <id> --step-id <id> --status <status> [--dry-run] [--json]
       ordo plan review <id> --step-id <id> --decision <decision> [--note <text>]
                        [--reject <path>]... [--reject-all] [--json]
       ordo plan changes <id> --step-id <id> [--diff] [--json]

Each --step value is JSON with description, expectedOutput, verification, and optional
id, inputs, areas, and dependsOn. Mutating actions support --dry-run.

review records a person's decision on a step an agent finished (paused for review):
approved completes it, changes-requested makes it runnable again, blocked stops it.
changes-requested and blocked require --note.

changes lists the files the latest agent run of a step changed (from snapshots taken
before and after the run); --diff prints the unified diff. --reject undoes a file,
restoring its version from before the run, before the decision is recorded; nothing is
undone if a rejected file was edited after the agent finished.

Options:
  --id <id>                    Set the id for a new plan
  --title <title>              Set the plan title
  --spec <id>                  Link the source specification
  --step <json>                Add an atomic step; may be repeated
  --step-id <id>               Select a step for run or finish
  --session <id>               Link the execution session
  --status <status>            completed, error, paused, cancelled, or skipped
  --decision <decision>        approved, changes-requested, or blocked (review)
  --note <text>                Review note: what to change or why the step is blocked
  --reject <path>              Undo a file the agent changed; may be repeated (review)
  --reject-all                 Undo every file the agent changed (review)
  --diff                       Include the unified diff (changes)
  --repository <directory>     Resolve the repository from this directory
  --dry-run                    Preview without writing
  -j, --json                   Emit a machine-readable report
  -h, --help                   Show plan help
`

const STATUS_HELP = `Usage: ordo status [directory] [--spec <id>] [--json]

Show every requirement and exploration across the Ordo workflow
(brainstorm → spec → architect → plan → implement → verify → review → record),
with what blocks each one and the next allowed step.

With --spec, show the decision trail of one requirement: the alternatives chosen and
rejected, approvals, plans, steps and agent sessions, with who, when and the source
of each entry (audit log, artifact fields, or Git history).

Options:
  --spec <id>   Show the decision trail of this requirement
  -j, --json    Emit a machine-readable JSON report
  -h, --help    Show status help
`

const BRAINSTORM_HELP = `Usage: ordo brainstorm create --title <title> --problem <text> [options]
       ordo brainstorm list [directory] [--json]
       ordo brainstorm show <id> [--repository <directory>] [--json]
       ordo brainstorm add <id> --title <title> --summary <text> --tradeoff <text> [options]
       ordo brainstorm select <id> --alternative <id> [--dry-run] [--json]
       ordo brainstorm crystallize <id> --acceptance <text> [--spec-id <id>] [--dry-run]

Explore a problem without modifying project code. Alternatives and trade-offs stay
explicit, and only the selected approach can be crystallized into a Markdown spec.

Options:
  --assumption <text>          Add an assumption; may be repeated
  --question <text>            Add an open question; may be repeated
  --benefit <text>             Add an alternative benefit; may be repeated
  --tradeoff <text>            Add an alternative trade-off; may be repeated
  --risk <text>                Add an alternative risk; may be repeated
  --alternative <id>           Select an alternative
  --acceptance <text>          Set spec acceptance criteria
  --repository <directory>     Resolve the repository from this directory
  --dry-run                    Preview without writing
  -j, --json                   Emit a machine-readable report
  -h, --help                   Show brainstorm help
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

interface StatusArguments {
  readonly directory: string
  readonly specId?: string
  readonly json: boolean
  readonly help: boolean
}

function parseStatusArguments(args: readonly string[], cwd: string): StatusArguments {
  let directory: string | null = null
  let specId: string | undefined
  let json = false
  let help = false
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
    } else if (argument === '--help' || argument === '-h') {
      help = true
    } else if (argument === '--spec') {
      specId = args[index + 1]
      index += 1
      if (!specId || specId.startsWith('-')) {
        throw new CliUsageError('The --spec option requires a specification id')
      }
    } else if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for status: ${argument}`)
    } else if (directory) {
      throw new CliUsageError('The status command accepts at most one directory')
    } else {
      directory = argument
    }
  }
  return { directory: path.resolve(cwd, directory ?? '.'), specId, json, help }
}

function parseAgentArguments(args: readonly string[], cwd: string): AgentArguments {
  const kind = args[0]
  if (kind !== 'claude' && kind !== 'codex' && kind !== '--help' && kind !== '-h') {
    throw new CliUsageError('The agent command supports claude or codex')
  }
  let directory = cwd
  let specId: string | undefined
  let planId: string | undefined
  let stepId: string | undefined
  let prompt: string | undefined
  let agentId: string | undefined
  let contentRoot: string | undefined
  const skillIds: string[] = []
  const ruleIds: string[] = []
  let json = false
  let help = kind === '--help' || kind === '-h'
  for (
    let index = kind === 'claude' || kind === 'codex' ? 1 : args.length;
    index < args.length;
    index += 1
  ) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
    } else if (argument === '--help' || argument === '-h') {
      help = true
    } else if (
      argument === '--spec' ||
      argument === '--plan' ||
      argument === '--step' ||
      argument === '--prompt' ||
      argument === '--agent' ||
      argument === '--skill' ||
      argument === '--rule' ||
      argument === '--content-root' ||
      argument === '--repository'
    ) {
      const value = args[index + 1]
      if (!value) {
        throw new CliUsageError(`${argument} requires a value`)
      }
      switch (argument) {
        case '--spec':
          specId = value
          break
        case '--plan':
          planId = value
          break
        case '--step':
          stepId = value
          break
        case '--prompt':
          prompt = value
          break
        case '--agent':
          agentId = value
          break
        case '--skill':
          skillIds.push(value)
          break
        case '--rule':
          ruleIds.push(value)
          break
        case '--content-root':
          contentRoot = value
          break
        case '--repository':
          directory = path.resolve(cwd, value)
          break
      }
      index += 1
    } else {
      throw new CliUsageError(`Unknown option for agent: ${argument}`)
    }
  }
  if (!help && (!specId || !planId)) {
    throw new CliUsageError(`The agent ${kind} command requires --spec and --plan`)
  }
  return {
    kind: kind === 'codex' ? 'codex' : 'claude',
    directory,
    specId,
    planId,
    stepId,
    prompt,
    agentId,
    skillIds,
    ruleIds,
    contentRoot,
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

function parseContextArguments(args: readonly string[], cwd: string): ContextArguments {
  const actions: readonly ContextAction[] = [
    'init',
    'preview',
    'snapshot',
    'add',
    'hide',
    'show',
    'remove'
  ]
  let action: ContextAction = 'inspect'
  let value: string | undefined
  let directory: string | null = null
  let json = false
  let help = false
  let index = 0

  if (args[0] && actions.includes(args[0] as ContextAction)) {
    action = args[0] as ContextAction
    index = 1
  }

  if (action === 'add' || action === 'hide' || action === 'show' || action === 'remove') {
    const candidate = args[index]
    if (!candidate || candidate.startsWith('-')) {
      throw new CliUsageError(`The context ${action} command requires an entry`)
    }
    value = candidate
    index += 1
  }

  for (; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (argument === '--repository') {
      const candidate = args[index + 1]
      if (!candidate || candidate.startsWith('-')) {
        throw new CliUsageError('The --repository option requires a directory')
      }
      if (directory) {
        throw new CliUsageError('The context command accepts only one repository directory')
      }
      directory = candidate
      index += 1
      continue
    }
    if (!argument) {
      continue
    }
    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for context: ${argument}`)
    }
    if (action === 'add' || action === 'hide' || action === 'show' || action === 'remove') {
      throw new CliUsageError(`Use --repository to set a directory for context ${action}`)
    }
    if (directory) {
      throw new CliUsageError('The context command accepts at most one repository directory')
    }
    directory = argument
  }

  return {
    action,
    value,
    directory: path.resolve(cwd, directory ?? '.'),
    json,
    help
  }
}

function parseSessionArguments(args: readonly string[], cwd: string): SessionArguments {
  const candidateAction = args[0]
  if (candidateAction === '--help' || candidateAction === '-h') {
    return {
      directory: cwd,
      action: 'list',
      allowTools: [],
      ruleIds: [],
      skillIds: [],
      json: false,
      help: true
    }
  }
  if (
    candidateAction !== 'create' &&
    candidateAction !== 'list' &&
    candidateAction !== 'show' &&
    candidateAction !== 'export' &&
    candidateAction !== 'run'
  ) {
    throw new CliUsageError('The session command requires create, list, show, export, or run')
  }

  const action: SessionAction = candidateAction
  let index = 1
  let sessionId: string | undefined
  if (action === 'show' || action === 'export' || action === 'run') {
    const candidate = args[index]
    if (!candidate || candidate.startsWith('-')) {
      throw new CliUsageError(`The session ${action} command requires a session id`)
    }
    sessionId = candidate
    index += 1
  }

  let directory: string | null = null
  let title: string | undefined
  let provider: string | undefined
  let model: string | undefined
  let contextSnapshotId: string | undefined
  let agentId: string | undefined
  const ruleIds: string[] = []
  const skillIds: string[] = []
  let contentRoot: string | undefined
  let prompt: string | undefined
  let baseUrl: string | undefined
  const allowTools: string[] = []
  let maxOutputTokens: number | undefined
  let json = false
  let help = false

  for (; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (
      argument === '--repository' ||
      argument === '--title' ||
      argument === '--provider' ||
      argument === '--model' ||
      argument === '--context-snapshot' ||
      argument === '--agent' ||
      argument === '--rule' ||
      argument === '--skill' ||
      argument === '--content-root' ||
      argument === '--prompt' ||
      argument === '--base-url' ||
      argument === '--allow-tool' ||
      argument === '--max-output-tokens'
    ) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--title') {
        title = value
      }
      if (argument === '--provider') {
        provider = value
      }
      if (argument === '--model') {
        model = value
      }
      if (argument === '--context-snapshot') {
        contextSnapshotId = value
      }
      if (argument === '--agent') {
        agentId = value
      }
      if (argument === '--rule') {
        ruleIds.push(value)
      }
      if (argument === '--skill') {
        skillIds.push(value)
      }
      if (argument === '--content-root') {
        contentRoot = value
      }
      if (argument === '--prompt') {
        prompt = value
      }
      if (argument === '--base-url') {
        baseUrl = value
      }
      if (argument === '--allow-tool') {
        allowTools.push(value)
      }
      if (argument === '--max-output-tokens') {
        const parsed = Number(value)
        if (!Number.isSafeInteger(parsed) || parsed < 1) {
          throw new CliUsageError('--max-output-tokens must be a positive integer')
        }
        maxOutputTokens = parsed
      }
      index += 1
      continue
    }
    if (!argument) {
      continue
    }
    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for session: ${argument}`)
    }
    if (action !== 'list' || directory) {
      throw new CliUsageError('Use --repository to set a directory for this session command')
    }
    directory = argument
  }

  if ((provider && !model) || (!provider && model)) {
    throw new CliUsageError('--provider and --model must be provided together')
  }
  if (action === 'create' && !title) {
    throw new CliUsageError('The session create command requires --title')
  }
  if (
    action !== 'create' &&
    (title ||
      provider ||
      model ||
      contextSnapshotId ||
      agentId ||
      ruleIds.length > 0 ||
      skillIds.length > 0 ||
      (contentRoot && action !== 'run'))
  ) {
    throw new CliUsageError('Creation options are only valid for session create')
  }
  if (action === 'run' && !prompt) {
    throw new CliUsageError('The session run command requires --prompt')
  }
  if (action !== 'run' && (prompt || baseUrl || allowTools.length > 0 || maxOutputTokens)) {
    throw new CliUsageError('Run options are only valid for session run')
  }

  return {
    directory: path.resolve(cwd, directory ?? '.'),
    action,
    sessionId,
    title,
    provider,
    model,
    contextSnapshotId,
    agentId,
    ruleIds,
    skillIds,
    contentRoot,
    prompt,
    baseUrl,
    allowTools,
    maxOutputTokens,
    json,
    help
  }
}

function parseProfileArguments(args: readonly string[], cwd: string): ProfileArguments {
  if (args[0] === '--help' || args[0] === '-h') {
    return {
      directory: cwd,
      action: 'show',
      agentIds: [],
      ruleIds: [],
      skillIds: [],
      dryRun: false,
      json: false,
      help: true
    }
  }
  const action = args[0] as ProfileAction | undefined
  if (action !== 'init' && action !== 'show' && action !== 'validate' && action !== 'set') {
    throw new CliUsageError('The profile command requires init, show, validate, or set')
  }
  let index = 1
  let kind: ProfileCatalogKind | undefined
  let id: string | undefined
  if (action === 'set') {
    const candidateKind = args[index]
    const candidateId = args[index + 1]
    if (!candidateKind || !['agents', 'rules', 'skills', 'workflows'].includes(candidateKind)) {
      throw new CliUsageError(
        'profile set requires a catalog kind: agents, rules, skills, or workflows'
      )
    }
    if (!candidateId || candidateId.startsWith('-')) {
      throw new CliUsageError('profile set requires a catalog entry id')
    }
    kind = candidateKind as ProfileCatalogKind
    id = candidateId
    index += 2
  }
  let directory = cwd
  let contentRoot: string | undefined
  let defaultAgentId: string | undefined
  let mode: ProfileEntryMode | undefined
  let dryRun = false
  let json = false
  let help = false
  const agentIds: string[] = []
  const ruleIds: string[] = []
  const skillIds: string[] = []
  for (; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--json' || argument === '-j') {
      json = true
      continue
    }
    if (argument === '--dry-run') {
      dryRun = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      help = true
      continue
    }
    if (
      argument === '--repository' ||
      argument === '--content-root' ||
      argument === '--agent' ||
      argument === '--rule' ||
      argument === '--skill' ||
      argument === '--default-agent' ||
      argument === '--mode'
    ) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--content-root') {
        contentRoot = value
      }
      if (argument === '--agent') {
        agentIds.push(value)
      }
      if (argument === '--rule') {
        ruleIds.push(value)
      }
      if (argument === '--skill') {
        skillIds.push(value)
      }
      if (argument === '--default-agent') {
        defaultAgentId = value
      }
      if (argument === '--mode') {
        if (!['enabled', 'recommended', 'default', 'required', 'disabled'].includes(value)) {
          throw new CliUsageError(
            '--mode must be enabled, recommended, default, required, or disabled'
          )
        }
        mode = value as ProfileEntryMode
      }
      index += 1
      continue
    }
    if (argument.startsWith('-')) {
      throw new CliUsageError(`Unknown option for profile: ${argument}`)
    }
    throw new CliUsageError(`Unexpected profile argument: ${argument}`)
  }
  if (dryRun && action !== 'init' && action !== 'set') {
    throw new CliUsageError('--dry-run is only valid for profile init or set')
  }
  if (action === 'set' && !mode) {
    throw new CliUsageError('profile set requires --mode')
  }
  if (action !== 'set' && mode) {
    throw new CliUsageError('--mode is only valid for profile set')
  }
  if (
    action !== 'init' &&
    (agentIds.length || ruleIds.length || skillIds.length || defaultAgentId)
  ) {
    throw new CliUsageError(
      '--agent, --rule, --skill, and --default-agent are only valid for profile init'
    )
  }
  return {
    directory: path.resolve(cwd, directory),
    action,
    contentRoot,
    agentIds,
    ruleIds,
    skillIds,
    defaultAgentId,
    kind,
    id,
    mode,
    dryRun,
    json,
    help
  }
}

function parseSpecArguments(args: readonly string[], cwd: string): SpecArguments {
  const action = args[0] as SpecAction | undefined
  if (
    action === undefined ||
    action === ('--help' as SpecAction) ||
    action === ('-h' as SpecAction)
  ) {
    return { directory: cwd, action: 'list', dryRun: false, json: false, help: true }
  }
  if (!['create', 'list', 'show', 'validate', 'status'].includes(action)) {
    throw new CliUsageError('The spec command requires create, list, show, validate, or status')
  }
  let index = 1
  let id: string | undefined
  if (action === 'show' || action === 'validate' || action === 'status') {
    id = args[index]
    if (!id || id.startsWith('-')) {
      throw new CliUsageError(`The spec ${action} command requires an id`)
    }
    index += 1
  }
  let directory: string | undefined
  let title: string | undefined
  let objective: string | undefined
  let acceptanceCriteria: string | undefined
  let status: SpecStatus | undefined
  let dryRun = false
  let json = false
  let help = false
  for (; index < args.length; index += 1) {
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
    if (
      argument === '--repository' ||
      argument === '--id' ||
      argument === '--title' ||
      argument === '--objective' ||
      argument === '--acceptance' ||
      argument === '--status'
    ) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--id') {
        id = value
      }
      if (argument === '--title') {
        title = value
      }
      if (argument === '--objective') {
        objective = value
      }
      if (argument === '--acceptance') {
        acceptanceCriteria = value
      }
      if (argument === '--status') {
        if (!['draft', 'ready', 'implemented', 'verified', 'superseded'].includes(value)) {
          throw new CliUsageError(`Invalid spec status: ${value}`)
        }
        status = value as SpecStatus
      }
      index += 1
      continue
    }
    if (argument?.startsWith('-')) {
      throw new CliUsageError(`Unknown option for spec: ${argument}`)
    }
    if (action !== 'list' || directory) {
      throw new CliUsageError('Use --repository to set a directory for this spec command')
    }
    directory = argument
  }
  if (action === 'create' && (!title || !objective || !acceptanceCriteria)) {
    throw new CliUsageError('spec create requires --title, --objective, and --acceptance')
  }
  if (action === 'status' && !status) {
    throw new CliUsageError('spec status requires --status')
  }
  if (dryRun && action !== 'create' && action !== 'status') {
    throw new CliUsageError('--dry-run is only valid for mutating spec actions')
  }
  return {
    directory: path.resolve(cwd, directory ?? '.'),
    action,
    id,
    title,
    objective,
    acceptanceCriteria,
    status,
    dryRun,
    json,
    help
  }
}

const ARCHITECT_HELP = `Usage: ordo architect create --spec <id> --title <title> --impact <text>
         --component <json> --contract <text> --decision <text> [options]
       ordo architect list [directory] [--json]
       ordo architect show <id> [--repository <directory>] [--json]
       ordo architect approve <id> [--dry-run] [--json]

Propose the impact, components, contracts, and decisions required by a spec.
Proposals start as proposed and require explicit human approval.

Each --component value is JSON with name, responsibility, and changes.

Options:
  --id <id>                    Set the id for a new proposal
  --title <title>              Set the proposal title
  --spec <id>                  Link the source specification
  --impact <text>              Add an impacted area; may be repeated
  --component <json>           Add a component; may be repeated
  --contract <text>            Add a contract; may be repeated
  --decision <text>            Add a decision; may be repeated
  --risk <text>                Add a risk; may be repeated
  --repository <directory>     Resolve the repository from this directory
  --dry-run                    Preview without writing
  -j, --json                   Emit a machine-readable report
  -h, --help                   Show architect help
`

function parseArchitectComponent(value: string): ArchitectureComponent {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new CliUsageError('--component must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliUsageError('--component must be a JSON object')
  }
  const component = parsed as Record<string, unknown>
  return { ...component, changes: component.changes ?? [] } as ArchitectureComponent
}

function parseArchitectArguments(args: readonly string[], cwd: string): ArchitectArguments {
  const action = args[0] as ArchitectAction | undefined
  const empty = {
    directory: cwd,
    action: 'list' as const,
    impact: [],
    components: [],
    contracts: [],
    decisions: [],
    risks: [],
    dryRun: false,
    json: false
  }
  if (!action || action === ('--help' as ArchitectAction) || action === ('-h' as ArchitectAction)) {
    return { ...empty, help: true }
  }
  if (!['create', 'list', 'show', 'approve'].includes(action)) {
    throw new CliUsageError('The architect command requires create, list, show, or approve')
  }
  let index = 1
  let id: string | undefined
  if (action === 'show' || action === 'approve') {
    id = args[index]
    if (!id || id.startsWith('-')) {
      throw new CliUsageError(`The architect ${action} command requires an id`)
    }
    index += 1
  }
  let directory: string | undefined
  let title: string | undefined
  let specId: string | undefined
  const impact: string[] = []
  const components: ArchitectureComponent[] = []
  const contracts: string[] = []
  const decisions: string[] = []
  const risks: string[] = []
  let dryRun = false
  let json = false
  let help = false
  for (; index < args.length; index += 1) {
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
    const valueOptions = [
      '--repository',
      '--id',
      '--title',
      '--spec',
      '--impact',
      '--component',
      '--contract',
      '--decision',
      '--risk'
    ]
    if (valueOptions.includes(argument)) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--id') {
        id = value
      }
      if (argument === '--title') {
        title = value
      }
      if (argument === '--spec') {
        specId = value
      }
      if (argument === '--impact') {
        impact.push(value)
      }
      if (argument === '--component') {
        components.push(parseArchitectComponent(value))
      }
      if (argument === '--contract') {
        contracts.push(value)
      }
      if (argument === '--decision') {
        decisions.push(value)
      }
      if (argument === '--risk') {
        risks.push(value)
      }
      index += 1
      continue
    }
    if (argument?.startsWith('-')) {
      throw new CliUsageError(`Unknown option for architect: ${argument}`)
    }
    if (action !== 'list' || directory) {
      throw new CliUsageError('Use --repository to set a directory for this architect command')
    }
    directory = argument
  }
  if (
    action === 'create' &&
    (!title ||
      !specId ||
      impact.length === 0 ||
      components.length === 0 ||
      contracts.length === 0 ||
      decisions.length === 0)
  ) {
    throw new CliUsageError(
      'architect create requires --title, --spec, --impact, --component, --contract, and --decision'
    )
  }
  if (dryRun && action !== 'create' && action !== 'approve') {
    throw new CliUsageError('--dry-run is only valid for mutating architect actions')
  }
  return {
    directory: path.resolve(cwd, directory ?? '.'),
    action,
    id,
    title,
    specId,
    impact,
    components,
    contracts,
    decisions,
    risks,
    dryRun,
    json,
    help
  }
}

function parsePlanStep(value: string): PlanStepInput {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new CliUsageError('--step must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliUsageError('--step must be a JSON object')
  }
  return parsed as PlanStepInput
}

function parsePlanArguments(args: readonly string[], cwd: string): PlanArguments {
  const action = args[0] as PlanAction | undefined
  if (
    action === undefined ||
    action === ('--help' as PlanAction) ||
    action === ('-h' as PlanAction)
  ) {
    return {
      directory: cwd,
      action: 'list',
      steps: [],
      rejectFiles: [],
      rejectAll: false,
      diff: false,
      dryRun: false,
      json: false,
      help: true
    }
  }
  if (
    !['create', 'list', 'show', 'validate', 'run', 'finish', 'review', 'changes'].includes(action)
  ) {
    throw new CliUsageError(
      'The plan command requires create, list, show, validate, run, finish, review, or changes'
    )
  }
  let index = 1
  let id: string | undefined
  if (
    action === 'show' ||
    action === 'validate' ||
    action === 'run' ||
    action === 'finish' ||
    action === 'review' ||
    action === 'changes'
  ) {
    id = args[index]
    if (!id || id.startsWith('-')) {
      throw new CliUsageError(`The plan ${action} command requires an id`)
    }
    index += 1
  }
  let directory: string | undefined
  let title: string | undefined
  let specId: string | undefined
  const steps: PlanStepInput[] = []
  let stepId: string | undefined
  let sessionId: string | undefined
  let status: PlanArguments['status']
  let decision: StepReviewDecision | undefined
  let note: string | undefined
  const rejectFiles: string[] = []
  let rejectAll = false
  let diff = false
  let dryRun = false
  let json = false
  let help = false
  for (; index < args.length; index += 1) {
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
    if (
      argument === '--repository' ||
      argument === '--id' ||
      argument === '--title' ||
      argument === '--spec' ||
      argument === '--step' ||
      argument === '--step-id' ||
      argument === '--session' ||
      argument === '--status'
    ) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--id') {
        id = value
      }
      if (argument === '--title') {
        title = value
      }
      if (argument === '--spec') {
        specId = value
      }
      if (argument === '--step') {
        steps.push(parsePlanStep(value))
      }
      if (argument === '--step-id') {
        stepId = value
      }
      if (argument === '--session') {
        sessionId = value
      }
      if (argument === '--status') {
        if (!['completed', 'error', 'paused', 'cancelled', 'skipped'].includes(value)) {
          throw new CliUsageError(`Invalid step status: ${value}`)
        }
        status = value as PlanArguments['status']
      }
      index += 1
      continue
    }
    if (argument === '--decision') {
      const value = args[index + 1]
      if (value !== 'approved' && value !== 'changes-requested' && value !== 'blocked') {
        throw new CliUsageError('--decision must be approved, changes-requested, or blocked')
      }
      decision = value
      index += 1
      continue
    }
    if (argument === '--reject') {
      const value = args[index + 1]
      if (!value?.trim()) {
        throw new CliUsageError('The --reject option requires a file path')
      }
      rejectFiles.push(value)
      index += 1
      continue
    }
    if (argument === '--reject-all') {
      rejectAll = true
      continue
    }
    if (argument === '--diff') {
      diff = true
      continue
    }
    if (argument === '--note') {
      // A note is free text and may start with a dash.
      const value = args[index + 1]
      if (value === undefined || !value.trim()) {
        throw new CliUsageError('The --note option requires a value')
      }
      note = value
      index += 1
      continue
    }
    if (argument?.startsWith('-')) {
      throw new CliUsageError(`Unknown option for plan: ${argument}`)
    }
    if (action !== 'list' || directory) {
      throw new CliUsageError('Use --repository to set a directory for this plan command')
    }
    directory = argument
  }
  if (action === 'create' && (!title || !specId || steps.length === 0)) {
    throw new CliUsageError('plan create requires --title, --spec, and at least one --step')
  }
  if (action === 'finish' && (!stepId || !status)) {
    throw new CliUsageError('plan finish requires --step-id and --status')
  }
  if (action === 'review' && (!stepId || !decision)) {
    throw new CliUsageError('plan review requires --step-id and --decision')
  }
  if (action === 'changes' && !stepId) {
    throw new CliUsageError('plan changes requires --step-id')
  }
  if (rejectAll && rejectFiles.length > 0) {
    throw new CliUsageError('Use either --reject or --reject-all')
  }
  if ((rejectAll || rejectFiles.length > 0) && action !== 'review') {
    throw new CliUsageError('--reject and --reject-all are only valid for plan review')
  }
  if (dryRun && action !== 'create' && action !== 'run' && action !== 'finish') {
    throw new CliUsageError('--dry-run is only valid for mutating plan actions')
  }
  return {
    directory: path.resolve(cwd, directory ?? '.'),
    action,
    id,
    title,
    specId,
    steps,
    stepId,
    sessionId,
    status,
    decision,
    note,
    rejectFiles,
    rejectAll,
    diff,
    dryRun,
    json,
    help
  }
}

function parseBrainstormArguments(args: readonly string[], cwd: string): BrainstormArguments {
  const action = args[0] as BrainstormAction | undefined
  const empty = {
    directory: cwd,
    action: 'list' as const,
    assumptions: [],
    openQuestions: [],
    benefits: [],
    tradeoffs: [],
    risks: [],
    dryRun: false,
    json: false
  }
  if (
    !action ||
    action === ('--help' as BrainstormAction) ||
    action === ('-h' as BrainstormAction)
  ) {
    return { ...empty, help: true }
  }
  if (!['create', 'list', 'show', 'add', 'select', 'crystallize'].includes(action)) {
    throw new CliUsageError(
      'The brainstorm command requires create, list, show, add, select, or crystallize'
    )
  }
  let index = 1
  let id: string | undefined
  if (action === 'show' || action === 'add' || action === 'select' || action === 'crystallize') {
    id = args[index]
    if (!id || id.startsWith('-')) {
      throw new CliUsageError(`The brainstorm ${action} command requires an id`)
    }
    index += 1
  }
  let directory: string | undefined
  let title: string | undefined
  let problem: string | undefined
  let alternativeId: string | undefined
  let summary: string | undefined
  let specId: string | undefined
  let acceptanceCriteria: string | undefined
  const assumptions: string[] = []
  const openQuestions: string[] = []
  const benefits: string[] = []
  const tradeoffs: string[] = []
  const risks: string[] = []
  let dryRun = false
  let json = false
  let help = false
  for (; index < args.length; index += 1) {
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
    const valueOptions = [
      '--repository',
      '--id',
      '--title',
      '--problem',
      '--summary',
      '--assumption',
      '--question',
      '--benefit',
      '--tradeoff',
      '--risk',
      '--alternative',
      '--spec-id',
      '--acceptance'
    ]
    if (valueOptions.includes(argument)) {
      const value = args[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliUsageError(`The ${argument} option requires a value`)
      }
      if (argument === '--repository') {
        directory = value
      }
      if (argument === '--id') {
        if (action === 'add') {
          alternativeId = value
        } else {
          id = value
        }
      }
      if (argument === '--title') {
        title = value
      }
      if (argument === '--problem') {
        problem = value
      }
      if (argument === '--summary') {
        summary = value
      }
      if (argument === '--assumption') {
        assumptions.push(value)
      }
      if (argument === '--question') {
        openQuestions.push(value)
      }
      if (argument === '--benefit') {
        benefits.push(value)
      }
      if (argument === '--tradeoff') {
        tradeoffs.push(value)
      }
      if (argument === '--risk') {
        risks.push(value)
      }
      if (argument === '--alternative') {
        alternativeId = value
      }
      if (argument === '--spec-id') {
        specId = value
      }
      if (argument === '--acceptance') {
        acceptanceCriteria = value
      }
      index += 1
      continue
    }
    if (argument?.startsWith('-')) {
      throw new CliUsageError(`Unknown option for brainstorm: ${argument}`)
    }
    if (action !== 'list' || directory) {
      throw new CliUsageError('Use --repository to set a directory for this brainstorm command')
    }
    directory = argument
  }
  if (action === 'create' && (!title || !problem)) {
    throw new CliUsageError('brainstorm create requires --title and --problem')
  }
  if (action === 'add' && (!title || !summary || tradeoffs.length === 0)) {
    throw new CliUsageError('brainstorm add requires --title, --summary, and --tradeoff')
  }
  if (action === 'select' && !alternativeId) {
    throw new CliUsageError('brainstorm select requires --alternative')
  }
  if (action === 'crystallize' && !acceptanceCriteria) {
    throw new CliUsageError('brainstorm crystallize requires --acceptance')
  }
  if (dryRun && !['create', 'add', 'select', 'crystallize'].includes(action)) {
    throw new CliUsageError('--dry-run is only valid for mutating brainstorm actions')
  }
  return {
    directory: path.resolve(cwd, directory ?? '.'),
    action,
    id,
    title,
    problem,
    assumptions,
    openQuestions,
    alternativeId,
    summary,
    benefits,
    tradeoffs,
    risks,
    specId,
    acceptanceCriteria,
    dryRun,
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

    if (command === 'context') {
      const options = parseContextArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(CONTEXT_HELP, color))

        return 0
      }

      const report = await manageContext(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatContextReport(report, { color }), color)
      )

      return 0
    }

    if (command === 'agent') {
      const options = parseAgentArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(AGENT_HELP, color))
        return 0
      }
      const report = await runAgent({
        harness: options.kind === 'codex' ? 'codex' : 'claude-code',
        directory: options.directory,
        prompt: options.prompt,
        specId: options.specId,
        planId: options.planId,
        stepId: options.stepId,
        agentId: options.agentId,
        skillIds: options.skillIds,
        ruleIds: options.ruleIds,
        contentRoot: options.contentRoot,
        command: options.kind === 'codex' ? dependencies.codexCommand : dependencies.claudeCommand,
        usageStatePath: defaultUsageStatePath(env),
        signal: dependencies.signal,
        onApprovalRequest: async request => {
          if (dependencies.approvalHandler) {
            return dependencies.approvalHandler(request)
          }
          if (stdin.isTTY && stdout.isTTY && !options.json) {
            stdout.write(`\n\nCodex approval required: ${safeApprovalDisplay(request.summary)}\n`)
            if (request.command) {
              stdout.write(`Command: ${safeApprovalDisplay(request.command)}\n`)
            }
            if (request.cwd) {
              stdout.write(`Working directory: ${safeApprovalDisplay(request.cwd)}\n`)
            }
            if (request.reason) {
              stdout.write(`Reason: ${safeApprovalDisplay(request.reason)}\n`)
            }
            if (request.kind === 'permission-escalation') {
              stdout.write(
                `Requested permissions (granted for this turn only if approved):\n${safeApprovalDisplay(JSON.stringify(request.details.permissions ?? {}, null, 2))}\n`
              )
            }
            const approved = await clackConfirm({
              message: 'Allow this operation once? (No is the default)',
              initialValue: false
            })
            return approved === true ? 'accept' : 'decline'
          }
          return 'decline'
        },
        onText(text) {
          if (!options.json) {
            stdout.write(text)
          }
        }
      })
      if (options.json) {
        stdout.write(formatJson(report))
      } else {
        stdout.write(`\n\n${options.kind === 'codex' ? 'Codex' : 'Claude Code'} ${report.version}`)
        if (report.nativeSessionId) {
          stdout.write(
            ` · ${options.kind === 'codex' ? 'Codex thread' : 'Claude session'} ${report.nativeSessionId}`
          )
        }
        stdout.write('\n')
        const reviewHint = `ordo plan changes ${report.planId} --step-id ${report.planStepId}`
        stdout.write(
          report.changedFiles === undefined
            ? 'No diff: this repository is not a Git work tree.\n'
            : `${report.changedFiles.length} file(s) changed by the agent. Review them: ${reviewHint}\n`
        )
      }
      return 0
    }

    if (command === 'session') {
      const options = parseSessionArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(SESSION_HELP, color))

        return 0
      }

      const report = await manageSession({ ...options, env, fetch: dependencies.fetch })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatSessionReport(report, { color }), color)
      )

      return 0
    }

    if (command === 'profile') {
      const options = parseProfileArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(PROFILE_HELP, color))
        return 0
      }
      const report = await manageProfile(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatProfileReport(report, { color }), color)
      )
      return report.valid === false ? 5 : 0
    }

    if (command === 'spec') {
      const options = parseSpecArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(SPEC_HELP, color))
        return 0
      }
      const report = await manageSpec(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatSpecReport(report, { color }), color)
      )
      return report.action === 'validate' && !report.validation.valid ? 5 : 0
    }

    if (command === 'plan') {
      const options = parsePlanArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(PLAN_HELP, color))
        return 0
      }
      const report = await managePlan(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatPlanReport(report, { color }), color)
      )
      return report.action === 'validate' && !report.validation.valid ? 5 : 0
    }

    if (command === 'brainstorm') {
      const options = parseBrainstormArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(BRAINSTORM_HELP, color))
        return 0
      }
      const report = await manageBrainstorm({
        ...options,
        alternative:
          options.action === 'add'
            ? {
                id: options.alternativeId,
                title: options.title ?? '',
                summary: options.summary ?? '',
                benefits: options.benefits,
                tradeoffs: options.tradeoffs,
                risks: options.risks
              }
            : undefined
      })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatBrainstormReport(report, { color }), color)
      )
      return 0
    }

    if (command === 'status') {
      const options = parseStatusArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(STATUS_HELP, color))
        return 0
      }
      const report = await reportStatus({ directory: options.directory, specId: options.specId })
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatStatusReport(report, { color }), color)
      )
      return 0
    }

    if (command === 'architect') {
      const options = parseArchitectArguments(args.slice(1), cwd)
      if (options.help) {
        stdout.write(formatHumanOutput(ARCHITECT_HELP, color))
        return 0
      }
      const report = await manageArchitect(options)
      stdout.write(
        options.json
          ? formatJson(report)
          : formatHumanOutput(formatArchitectReport(report, { color }), color)
      )
      return 0
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
    if (dependencies.signal?.aborted) {
      stderr.write('Interrupted. The Ordo session and plan step are paused.\n')
      return 130
    }
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

    if (isOrdoError(error) && error.code === 'PLAN_TRANSITION_INVALID') {
      return 3
    }

    return 1
  }
}
