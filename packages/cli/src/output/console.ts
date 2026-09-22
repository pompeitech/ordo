import type { DoctorReport } from '@pompeitech/ordo-core'
import type { CatalogInspectionReport } from '../commands/catalog.js'
import type { DetectReport } from '../commands/detect.js'
import type { InitReport } from '../commands/init.js'
import type { InstallReport } from '../commands/install.js'
import { createOutputTheme, type OutputTheme } from './theme.js'

export interface OutputFormatOptions {
  readonly color?: boolean
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
