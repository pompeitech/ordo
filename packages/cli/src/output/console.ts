import type {
  ContextPreviewReport,
  ContextReport,
  ContextSnapshotReport,
  DoctorReport,
  TrailEntry,
  WorkflowItem
} from '@pompeitech/ordo-core'
import type { ArchitectReport } from '../commands/architect.js'
import type { BrainstormReport } from '../commands/brainstorm.js'
import type { CatalogInspectionReport } from '../commands/catalog.js'
import type { DetectReport } from '../commands/detect.js'
import type { InitReport } from '../commands/init.js'
import type { InstallReport } from '../commands/install.js'
import type { PlanCommandReport } from '../commands/plan.js'
import type { ProfileCommandReport } from '../commands/profile.js'
import type { SessionCommandReport } from '../commands/session.js'
import type { SpecCommandReport } from '../commands/spec.js'
import type { StatusReport } from '../commands/status.js'
import { createOutputTheme, type OutputTheme } from './theme.js'

export interface OutputFormatOptions {
  readonly color?: boolean
}

export function formatArchitectReport(
  report: ArchitectReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.action === 'list') {
    return [
      theme.brand('architecture proposals'),
      '',
      ...(report.proposals.length > 0
        ? report.proposals.map(
            item =>
              `  ${theme.info('◆')} ${theme.strong(item.id.padEnd(24))}${item.status}  ${item.title}`
          )
        : [`  ${theme.muted('○ no architecture proposals')}`]),
      ''
    ].join('\n')
  }
  const item = report.proposal
  const list = (values: readonly string[]) =>
    values.length > 0 ? values.map(value => `  • ${value}`) : [`  ${theme.muted('○ none')}`]
  return [
    theme.brand(`architect ${report.action}`),
    '',
    field(theme, 'id', item.id),
    field(theme, 'spec', item.specId),
    field(theme, 'status', item.status === 'approved' ? theme.success(item.status) : item.status),
    field(theme, 'mode', report.dryRun ? theme.info('DRY RUN') : theme.success('PERSISTED')),
    '',
    theme.section('impact'),
    ...list(item.impact),
    '',
    theme.section('components'),
    ...item.components.map(
      component =>
        `  ${theme.info('◆')} ${theme.strong(component.name)} — ${component.responsibility}${
          component.changes.length > 0
            ? `\n    ${theme.muted(`changes: ${component.changes.join('; ')}`)}`
            : ''
        }`
    ),
    '',
    theme.section('contracts'),
    ...list(item.contracts),
    '',
    theme.section('decisions'),
    ...list(item.decisions),
    '',
    theme.section('risks'),
    ...list(item.risks),
    ...(item.status === 'proposed' && !report.dryRun
      ? ['', theme.muted(`  Human approval required: ordo architect approve ${item.id}`)]
      : []),
    ''
  ].join('\n')
}

export function formatBrainstormReport(
  report: BrainstormReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.action === 'list') {
    return [
      theme.brand('explore'),
      '',
      ...(report.explorations.length > 0
        ? report.explorations.map(
            item =>
              `  ${theme.info('◆')} ${theme.strong(item.id.padEnd(24))}${item.status}  ${item.title}`
          )
        : [`  ${theme.muted('○ no explorations')}`]),
      ''
    ].join('\n')
  }
  const item = report.exploration
  const alternatives = item.alternatives.map(alternative => {
    const selected = alternative.id === item.selectedAlternativeId
    return `  ${selected ? theme.success('●') : theme.muted('○')} ${theme.strong(alternative.id)} — ${alternative.summary}\n    ${theme.muted(`trade-offs: ${alternative.tradeoffs.join('; ')}`)}`
  })
  return [
    theme.brand(`brainstorm ${report.action}`),
    '',
    field(theme, 'id', item.id),
    field(theme, 'status', item.status),
    field(theme, 'mode', report.dryRun ? theme.info('DRY RUN') : theme.success('PERSISTED')),
    field(theme, 'spec', report.spec?.id ?? item.specId ?? 'not crystallized'),
    '',
    theme.section('problem'),
    `  ${item.problem}`,
    '',
    theme.section('alternatives'),
    ...(alternatives.length > 0 ? alternatives : [`  ${theme.muted('○ none yet')}`]),
    ''
  ].join('\n')
}

export function formatSpecReport(
  report: SpecCommandReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.action === 'list') {
    return [
      theme.brand('specifications'),
      '',
      ...(report.specs.length > 0
        ? report.specs.map(
            spec =>
              `  ${theme.info('◆')} ${theme.strong(spec.id.padEnd(24))}${spec.status}  ${spec.title}`
          )
        : [`  ${theme.muted('○ no specifications')}`]),
      ''
    ].join('\n')
  }
  if (report.action === 'validate') {
    return [
      theme.brand('spec validation'),
      '',
      field(
        theme,
        'status',
        report.validation.valid ? theme.success('VALID') : theme.danger('INVALID')
      ),
      ...(report.validation.errors.length > 0
        ? ['', ...report.validation.errors.map(error => `  ${theme.danger('×')} ${error}`)]
        : []),
      ''
    ].join('\n')
  }
  return [
    theme.brand(`spec ${report.action}`),
    '',
    field(theme, 'id', report.spec.id),
    field(theme, 'title', report.spec.title),
    field(theme, 'status', report.spec.status),
    field(theme, 'path', report.spec.path),
    field(theme, 'mode', report.dryRun ? theme.info('DRY RUN') : theme.success('WRITTEN')),
    '',
    theme.section('objective'),
    `  ${report.spec.objective}`,
    '',
    theme.section('acceptance criteria'),
    `  ${report.spec.acceptanceCriteria.replaceAll('\n', '\n  ')}`,
    ''
  ].join('\n')
}

export function formatPlanReport(
  report: PlanCommandReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.action === 'list') {
    return [
      theme.brand('plans'),
      '',
      ...(report.plans.length > 0
        ? report.plans.map(
            plan =>
              `  ${theme.info('◆')} ${theme.strong(plan.id.padEnd(24))}${plan.status}  ${plan.title}`
          )
        : [`  ${theme.muted('○ no plans')}`]),
      ''
    ].join('\n')
  }
  if (report.action === 'changes') {
    const { changes } = report
    const marks = { added: '+', modified: '~', deleted: '-' } as const
    const lines = changes.available
      ? changes.files.length > 0
        ? changes.files.map(file => {
            const counts =
              file.additions === undefined
                ? theme.muted('binary')
                : `${theme.success(`+${file.additions}`)} ${theme.danger(`-${file.deletions}`)}`
            return `  ${marks[file.change]} ${file.path}  ${counts}`
          })
        : [`  ${theme.muted('○ the agent changed no files')}`]
      : [`  ${theme.muted(`○ no diff: ${changes.reason}`)}`]
    return [
      theme.brand(`changes · ${report.planId} / ${report.stepId}`),
      '',
      ...lines,
      '',
      ...(changes.available && changes.files.length > 0
        ? [
            theme.muted(
              `  Undo files with: ordo plan review ${report.planId} --step-id ${report.stepId} --decision <decision> --reject <path>`
            ),
            ''
          ]
        : []),
      ...(report.diff ? [report.diff] : [])
    ].join('\n')
  }
  if (report.action === 'validate') {
    return [
      theme.brand('plan validation'),
      '',
      field(
        theme,
        'status',
        report.validation.valid ? theme.success('VALID') : theme.danger('INVALID')
      ),
      ...(report.validation.errors.length > 0
        ? ['', ...report.validation.errors.map(error => `  ${theme.danger('×')} ${error}`)]
        : []),
      ''
    ].join('\n')
  }
  const steps = report.plan.steps.map(step => {
    const marker =
      step.status === 'completed'
        ? theme.success('✓')
        : step.status === 'running'
          ? theme.info('●')
          : theme.muted('○')
    const dependencies =
      step.dependsOn.length > 0 ? theme.muted(` ← ${step.dependsOn.join(', ')}`) : ''
    return `  ${marker} ${theme.strong(step.id.padEnd(18))}${step.status.padEnd(12)}${step.description}${dependencies}`
  })
  return [
    theme.brand(`plan ${report.action}`),
    '',
    field(theme, 'id', report.plan.id),
    field(theme, 'spec', report.plan.specId),
    field(theme, 'status', report.plan.status),
    field(theme, 'mode', report.dryRun ? theme.info('DRY RUN') : theme.success('PERSISTED')),
    ...(report.selectedStepId ? [field(theme, 'selected step', report.selectedStepId)] : []),
    '',
    theme.section('steps'),
    ...steps,
    ''
  ].join('\n')
}

function field(theme: OutputTheme, label: string, value: string): string {
  return `  ${theme.muted(label.padEnd(16))}${theme.strong(value)}`
}

function summary(theme: OutputTheme, values: readonly [string, number, keyof OutputTheme][]) {
  return values
    .map(([label, value, tone]) => (theme[tone] as (text: string) => string)(`${value} ${label}`))
    .join(theme.muted('  ·  '))
}

function detectedPath(value: string | null): string {
  return value ?? 'not detected'
}

export function formatDetectReport(
  report: DetectReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  const packageManager = report.packageManager.selected
    ? `${report.packageManager.selected}${report.packageManager.version ? `@${report.packageManager.version}` : ''}`
    : report.packageManager.status
  const conflicts =
    report.packageManager.conflicts.length > 0 ? report.packageManager.conflicts.join(', ') : 'none'
  const technologies =
    report.stack.technologies.length > 0
      ? report.stack.technologies.map(
          item =>
            `  ${theme.info('◆')} ${theme.strong(item.name.padEnd(22))}${theme.muted(item.category)}`
        )
      : [`  ${theme.muted('○')} ${theme.muted('none detected')}`]
  const harnesses = report.harnesses.flatMap(item => {
    const marker = item.detected ? theme.success('●') : theme.muted('○')
    const status = item.detected ? theme.success('DETECTED') : theme.muted('NOT DETECTED')
    const lines = [`  ${marker} ${theme.strong(item.adapter.padEnd(12))}${status}`]
    if (item.evidence.length > 0) {
      lines.push(
        ...item.evidence.map(evidence => `    ${theme.muted('↳')} ${theme.muted(evidence)}`)
      )
    }

    return lines
  })

  return [
    theme.brand('repository detection'),
    '',
    field(theme, 'root', report.repository.rootDirectory),
    field(theme, 'project', report.repository.name ?? 'unnamed'),
    field(theme, 'workspace', report.repository.workspace ? 'yes' : 'no'),
    field(theme, 'git', detectedPath(report.repository.gitDirectory)),
    field(theme, 'manifest', detectedPath(report.repository.packageJsonPath)),
    field(theme, 'package manager', packageManager),
    field(
      theme,
      'conflicts',
      conflicts === 'none' ? theme.success(conflicts) : theme.warning(conflicts)
    ),
    '',
    theme.section('stack'),
    ...technologies,
    '',
    theme.section('harnesses'),
    ...harnesses,
    ''
  ].join('\n')
}

export function formatDoctorReport(
  report: DoctorReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  const severity = {
    pass: { marker: theme.success('✓'), tone: theme.success },
    info: { marker: theme.info('◆'), tone: theme.info },
    warning: { marker: theme.warning('!'), tone: theme.warning },
    error: { marker: theme.danger('×'), tone: theme.danger }
  } as const
  const findings = report.findings.flatMap(item => {
    const style = severity[item.severity]
    const itemPath = item.path ? ` ${theme.muted(`(${item.path})`)}` : ''
    const lines = [
      `  ${style.marker} ${style.tone(item.severity.toUpperCase().padEnd(7))}${theme.strong(item.checkId.padEnd(24))}${item.message}${itemPath}`
    ]
    if (item.remediation) {
      lines.push(`    ${theme.warning('↳')} ${theme.muted(item.remediation)}`)
    }

    return lines
  })
  const health = report.healthy ? theme.success('● HEALTHY') : theme.danger('× UNHEALTHY')

  return [
    theme.brand('doctor'),
    '',
    field(theme, 'repository', report.repositoryRoot ?? 'not found'),
    field(theme, 'health', health),
    '',
    theme.section('checks'),
    ...findings,
    '',
    theme.section('summary'),
    `  ${summary(theme, [
      ['pass', report.summary.pass, 'success'],
      ['info', report.summary.info, 'info'],
      ['warnings', report.summary.warning, 'warning'],
      ['errors', report.summary.error, 'danger']
    ])}`,
    ''
  ].join('\n')
}

export function formatInitReport(report: InitReport, options: OutputFormatOptions = {}): string {
  const theme = createOutputTheme(options.color ?? false)
  const status = report.overwritten
    ? theme.warning('● CONFIGURATION REPLACED')
    : theme.success('● CONFIGURATION CREATED')

  return [
    theme.brand('initialization'),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'configuration', report.configPath),
    field(theme, 'targets', report.targets.join(', ')),
    field(theme, 'content root', report.contentRoot),
    field(theme, 'conflicts', report.conflictStrategy),
    field(theme, 'prune', report.prune ? 'enabled' : 'disabled'),
    field(theme, 'status', status),
    ''
  ].join('\n')
}

export function formatInitContinuation(options: OutputFormatOptions = {}): string {
  const theme = createOutputTheme(options.color ?? false)

  return [
    '',
    theme.section('next step'),
    `  ${theme.muted('Installation was skipped. From the repository root, run:')}`,
    `  ${theme.info('ordo install --dry-run')}  ${theme.muted('// preview the installation plan')}`,
    `  ${theme.success('ordo install')}            ${theme.muted('// install the selected content')}`,
    ''
  ].join('\n')
}

function actionLine(theme: OutputTheme, action: InstallReport['actions'][number]): string {
  const styles = {
    create: { marker: theme.success('+'), tone: theme.success },
    update: { marker: theme.warning('~'), tone: theme.warning },
    remove: { marker: theme.danger('−'), tone: theme.danger },
    skip: { marker: theme.muted('·'), tone: theme.muted }
  } as const
  const style = styles[action.type]

  return `  ${style.marker} ${style.tone(action.type.toUpperCase().padEnd(7))}${theme.strong(action.path)} ${theme.muted(`// ${action.reason} · ${action.adapter}`)}`
}

function installNextSteps(theme: OutputTheme, report: InstallReport): readonly string[] {
  if (report.conflicts.length > 0) {
    return [
      theme.section('next step'),
      `  ${theme.warning('Resolve the conflicts listed above, then run:')}`,
      `  ${theme.info('ordo install')}`
    ]
  }

  if (report.dryRun) {
    return [
      theme.section('next step'),
      `  ${theme.muted('The repository was not changed. Apply this plan with:')}`,
      `  ${theme.success('ordo install')}`
    ]
  }

  const harnessCommands = report.targets
    .filter(target => target === 'claude' || target === 'codex')
    .map(target => {
      if (target === 'claude') {
        return `  ${theme.success('claude')}         ${theme.muted('// start Claude Code')}`
      }
      if (target === 'codex') {
        return `  ${theme.success('codex')}          ${theme.muted('// start Codex')}`
      }
      return ''
    })

  return [
    theme.section('ready'),
    `  ${theme.info('ordo doctor')}  ${theme.muted('// verify the installation')}`,
    ...harnessCommands
  ]
}

export function formatInstallReport(
  report: InstallReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  const actions =
    report.actions.length > 0
      ? report.actions.map(action => actionLine(theme, action))
      : [`  ${theme.muted('○ no actions')}`]
  const conflicts =
    report.conflicts.length > 0
      ? report.conflicts.map(
          conflict =>
            `  ${theme.danger('×')} ${theme.danger(conflict.code.padEnd(24))}${theme.strong(conflict.path)}\n    ${theme.muted('↳')} ${conflict.message}`
        )
      : [`  ${theme.success('✓')} ${theme.muted('none')}`]
  const warnings =
    report.warnings.length > 0
      ? report.warnings.map(
          warning =>
            `  ${theme.warning('!')} ${theme.warning(`${warning.adapter}:${warning.code}`)} ${warning.message}`
        )
      : [`  ${theme.success('✓')} ${theme.muted('none')}`]
  let status: string
  if (report.conflicts.length > 0) {
    status = theme.danger('× BLOCKED')
  } else if (report.dryRun) {
    status = theme.info('◆ DRY RUN')
  } else {
    status = theme.success('● INSTALLED')
  }

  return [
    theme.brand('installation'),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'configuration', report.configPath),
    field(theme, 'content', report.contentRoot),
    field(theme, 'targets', report.targets.join(', ')),
    field(theme, 'status', status),
    '',
    theme.section(`plan // ${report.actions.length} actions`),
    ...actions,
    '',
    theme.section('conflicts'),
    ...conflicts,
    '',
    theme.section('warnings'),
    ...warnings,
    '',
    theme.section('summary'),
    `  ${summary(theme, [
      ['created', report.summary.created, 'success'],
      ['updated', report.summary.updated, 'warning'],
      ['removed', report.summary.removed, 'danger'],
      ['skipped', report.summary.skipped, 'muted'],
      ['conflicts', report.summary.conflicts, 'danger']
    ])}`,
    '',
    ...installNextSteps(theme, report),
    ''
  ].join('\n')
}

const SINGULAR_CONTENT_KIND = {
  agents: 'agent',
  rules: 'rule',
  skills: 'skill',
  workflows: 'workflow'
} as const

export function formatCatalogReport(
  report: CatalogInspectionReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.selectedId) {
    const entry = report.entries[0]

    return [
      theme.brand(`${SINGULAR_CONTENT_KIND[report.command]} detail`),
      '',
      field(theme, 'repository', report.repositoryRoot),
      field(theme, 'content root', report.contentRoot),
      field(theme, 'id', entry?.id ?? report.selectedId),
      field(theme, 'name', entry?.name ?? report.selectedId),
      field(theme, 'description', entry?.description ?? 'not provided'),
      field(theme, 'path', entry?.path ?? 'not found'),
      '',
      theme.section('source'),
      '',
      entry?.content ?? '',
      ''
    ].join('\n')
  }

  const entries = report.entries.flatMap((entry, index) => {
    const branch = index === report.entries.length - 1 ? '└─' : '├─'

    return [
      `  ${theme.accent(branch)} ${theme.strong(entry.id)} — ${entry.description ?? theme.muted('no description')}`,
      `  ${index === report.entries.length - 1 ? '  ' : '│ '} ${theme.muted(`↳ ${entry.path}`)}`
    ]
  })

  return [
    theme.brand(`${report.command} catalog`),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'content root', report.contentRoot),
    field(theme, 'entries', String(report.count)),
    '',
    theme.section('catalog'),
    ...(entries.length > 0 ? entries : [`  ${theme.muted('○ empty')}`]),
    ''
  ].join('\n')
}

export function formatContextReport(
  report: ContextReport | ContextPreviewReport | ContextSnapshotReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  const entries = report.entries.map(entry => {
    const marker = !entry.exists
      ? theme.danger('×')
      : entry.visibility === 'visible'
        ? theme.success('●')
        : theme.muted('○')
    const status = !entry.exists ? 'missing' : entry.visibility
    return `  ${marker} ${theme.strong(entry.id)} ${theme.muted(`// ${status} · ~${entry.estimatedTokens} tokens · ${entry.path}`)}`
  })
  const preview =
    report.command === 'context-preview' || report.command === 'context-snapshot'
      ? [
          '',
          theme.section(`payload // ${report.blocks.length} blocks`),
          '',
          report.payload || theme.muted('  ○ empty')
        ]
      : []

  return [
    theme.brand(
      report.command === 'context-preview'
        ? 'context preview'
        : report.command === 'context-snapshot'
          ? 'context snapshot'
          : 'project context'
    ),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'memory', report.brainPath),
    field(theme, 'manifest', report.manifestPath),
    field(theme, 'initialized', report.initialized ? 'yes' : 'no'),
    field(theme, 'token estimate', `~${report.summary.estimatedTokens}`),
    '',
    theme.section('context entries'),
    ...(entries.length > 0 ? entries : [`  ${theme.muted('○ no tracked files')}`]),
    '',
    theme.section('summary'),
    `  ${summary(theme, [
      ['visible', report.summary.visible, 'success'],
      ['hidden', report.summary.hidden, 'muted'],
      ['missing', report.summary.missing, 'danger']
    ])}`,
    ...(report.command === 'context-snapshot'
      ? [
          '',
          theme.section('snapshot'),
          field(theme, 'id', report.snapshot.id),
          field(theme, 'path', report.snapshotPath),
          field(theme, 'status', report.created ? 'created' : 'reused')
        ]
      : []),
    ...preview,
    ''
  ].join('\n')
}

export function formatSessionReport(
  report: SessionCommandReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.command === 'session-run') {
    return [
      theme.brand('session run'),
      '',
      field(theme, 'session', report.session.id),
      field(theme, 'provider', report.session.runtime?.provider ?? 'unknown'),
      field(theme, 'model', report.session.runtime?.model ?? 'unknown'),
      field(theme, 'snapshot', report.contextSnapshotId),
      field(theme, 'tool iterations', String(report.toolIterations)),
      field(theme, 'tokens', String(report.usage.totalTokens ?? 'unknown')),
      '',
      theme.section('response'),
      '',
      report.text || theme.muted('  ○ empty'),
      ''
    ].join('\n')
  }
  if (report.command === 'session-list') {
    const sessions = report.sessions.map(
      session =>
        `  ${theme.success('●')} ${theme.strong(session.title)} ${theme.muted(`// ${session.status} · ${session.id}`)}`
    )
    return [
      theme.brand('sessions'),
      '',
      field(theme, 'repository', report.repositoryRoot),
      field(theme, 'sessions', String(report.sessions.length)),
      '',
      theme.section('history'),
      ...(sessions.length > 0 ? sessions : [`  ${theme.muted('○ no sessions')}`]),
      ''
    ].join('\n')
  }

  const session = report.session
  const events =
    'events' in report
      ? report.events.map(
          event =>
            `  ${theme.info(String(event.sequence).padStart(3, '0'))} ${theme.strong(event.type)} ${theme.muted(event.timestamp)}`
        )
      : []
  return [
    theme.brand(report.command.replace('-', ' ')),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'id', session.id),
    field(theme, 'title', session.title),
    field(theme, 'status', session.status),
    field(
      theme,
      'runtime',
      session.runtime ? `${session.runtime.provider}/${session.runtime.model}` : 'not selected'
    ),
    ...(session.profileSelection
      ? [
          field(theme, 'agent', session.profileSelection.agent?.id ?? 'not selected'),
          field(
            theme,
            'skills',
            session.profileSelection.skills.map(skill => skill.id).join(', ') || 'none'
          ),
          field(theme, 'profile', session.profileSelection.profileSha256)
        ]
      : []),
    field(theme, 'context', session.contextSnapshotId ?? 'not linked'),
    field(theme, 'updated', session.updatedAt),
    ...('events' in report
      ? ['', theme.section(`events // ${report.events.length}`), ...events]
      : []),
    ''
  ].join('\n')
}

export function formatProfileReport(
  report: ProfileCommandReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  const rows = (kind: 'agents' | 'rules' | 'skills' | 'workflows') =>
    report.profile[kind].length > 0
      ? report.profile[kind].map(
          entry => `  ${theme.info('◆')} ${entry.id.padEnd(24)}${entry.mode}`
        )
      : [`  ${theme.muted('○ none configured')}`]
  return [
    theme.brand(`profile ${report.command.replace('profile-', '')}`),
    '',
    field(theme, 'repository', report.repositoryRoot),
    field(theme, 'catalog', report.contentRoot),
    field(theme, 'schema', String(report.profile.schemaVersion)),
    field(theme, 'catalog hash', report.profile.catalogSha256),
    field(theme, 'mode', report.dryRun ? theme.info('DRY RUN') : theme.success('PERSISTED')),
    ...(report.valid === undefined ? [] : [field(theme, 'valid', report.valid ? 'yes' : 'no')]),
    ...(['agents', 'skills', 'rules', 'workflows'] as const).flatMap(kind => [
      '',
      theme.section(kind),
      ...rows(kind)
    ]),
    ...(report.errors && report.errors.length > 0
      ? [
          '',
          theme.section('validation errors'),
          ...report.errors.map(error => `  ${theme.danger(error)}`)
        ]
      : []),
    ''
  ].join('\n')
}

const PHASE_MARKS: Readonly<
  Record<WorkflowItem['phases'][number]['state'], readonly [string, keyof OutputTheme]>
> = {
  done: ['✔', 'success'],
  'in-progress': ['◐', 'info'],
  blocked: ['×', 'danger'],
  'not-started': ['○', 'muted'],
  skipped: ['–', 'muted'],
  unavailable: ['·', 'muted']
}

function formatWorkflowItem(theme: OutputTheme, item: WorkflowItem): readonly string[] {
  const phases = item.phases
    .map(phase => {
      const [mark, tone] = PHASE_MARKS[phase.state]
      const paint = theme[tone] as (value: string) => string
      return paint(`${mark} ${phase.phase}`)
    })
    .join('  ')
  const current = item.phases.find(phase => phase.phase === item.currentPhase)
  const detail = current
    ? [
        current.summary,
        current.blockedBy ? `blocked: ${current.blockedBy}` : undefined,
        current.nextAction ? `next: ${current.nextAction.label}` : undefined
      ]
        .filter(Boolean)
        .join(' · ')
    : 'every available phase is complete'
  const tokens = item.tokens
    ? `  ${theme.muted(`${formatTokens(item.tokens.total)}${item.tokens.unmeasuredSessions ? ` + ${item.tokens.unmeasuredSessions} run(s) not measured` : ''}`)}`
    : ''
  return [
    `  ${theme.strong(item.title)}  ${theme.muted(item.key)}${tokens}`,
    `    ${phases}`,
    `    ${theme.accent('→')} ${current ? `${current.phase}: ` : ''}${detail}`,
    ''
  ]
}

const CATEGORY_MARKS: Readonly<Record<TrailEntry['category'], string>> = {
  decision: '👤',
  agent: '🤖',
  system: '⚙️',
  activity: '·'
}

function formatTokens(value: number): string {
  return `${value.toLocaleString('en-US')} tokens`
}

function formatTrailEntry(theme: OutputTheme, entry: TrailEntry): readonly string[] {
  const when = entry.at.replace('T', ' ').slice(0, 16)
  const origin = [
    entry.actor,
    entry.source === 'artifact'
      ? `artifact${entry.approximate ? ', approximate time' : ''}`
      : undefined
  ]
    .filter(Boolean)
    .join(' · ')
  const tokens =
    entry.category === 'agent'
      ? entry.tokens
        ? `  ${entry.mostExpensive ? theme.warning(`${formatTokens(entry.tokens.total)} · most tokens`) : theme.muted(formatTokens(entry.tokens.total))}`
        : `  ${theme.muted('tokens not measured')}`
      : ''
  const title = entry.category === 'decision' ? theme.strong(entry.title) : entry.title
  return [
    `  ${theme.muted(when)}  ${CATEGORY_MARKS[entry.category]} ${theme.info(entry.phase.padEnd(10))} ${title}${tokens}  ${theme.muted(origin)}`,
    ...(entry.detail ? [`${' '.repeat(33)}${theme.muted(entry.detail)}`] : []),
    ...(entry.files
      ? [
          `${' '.repeat(33)}${theme.muted(`kept ${entry.files.accepted.length} file(s)${entry.files.rejected.length ? ` · undone: ${entry.files.rejected.join(', ')}` : ''}`)}`
        ]
      : []),
    ...(entry.rejected ?? []).map(
      option =>
        `${' '.repeat(33)}${theme.muted(`not chosen: ${option.title}${option.tradeoffs.length ? ` (${option.tradeoffs.join('; ')})` : ''}`)}`
    )
  ]
}

export function formatStatusReport(
  report: StatusReport,
  options: OutputFormatOptions = {}
): string {
  const theme = createOutputTheme(options.color ?? false)
  if (report.command === 'status-trail') {
    return [
      theme.brand(`decision trail · ${report.trail.title}`),
      '',
      ...(report.trail.entries.length > 0
        ? report.trail.entries.flatMap(entry => formatTrailEntry(theme, entry))
        : [`  ${theme.muted('○ no recorded history')}`]),
      '',
      `  ${theme.muted('👤 human decision  🤖 agent  ⚙️ Ordo  · recorded activity')}`,
      `  ${theme.muted(`agent tokens: ${formatTokens(report.trail.tokens.total)}${report.trail.tokens.unmeasuredSessions ? `, ${report.trail.tokens.unmeasuredSessions} run(s) not measured` : ''}`)}`,
      ''
    ].join('\n')
  }
  return [
    theme.brand('workflow'),
    '',
    ...(report.items.length > 0
      ? report.items.flatMap(item => formatWorkflowItem(theme, item))
      : [`  ${theme.muted('○ no requirements or explorations yet')}`, '']),
    `  ${theme.muted('✔ done  ◐ in progress  × blocked  ○ not started  – skipped  · not available yet')}`,
    ''
  ].join('\n')
}
