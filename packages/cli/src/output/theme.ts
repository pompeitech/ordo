export interface OutputTheme {
  readonly color: boolean
  brand(label: string): string
  section(label: string): string
  accent(value: string): string
  strong(value: string): string
  muted(value: string): string
  success(value: string): string
  info(value: string): string
  warning(value: string): string
  danger(value: string): string
}

function decorate(color: boolean, codes: readonly number[], value: string): string {
  if (!color) {
    return value
  }

  return `\u001B[${codes.join(';')}m${value}\u001B[0m`
}

const LOGO_MARK = [
  '   ██████╗        ██████╗ ██████╗ ██████╗  ██████╗',
  '  ██╔═══██╗      ██╔═══██╗██╔══██╗██╔══██╗██╔═══██╗',
  '  ██║ █ ██║      ██║   ██║██████╔╝██║  ██║██║   ██║',
  '  ██║   ██║      ██║   ██║██╔══██╗██║  ██║██║   ██║',
  '  ╚██████╔╝      ╚██████╔╝██║  ██║██████╔╝╚██████╔╝',
  '   ╚═════╝        ╚═════╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝'
] as const

export function formatLogo(color = false): string {
  const mark = LOGO_MARK.map((line, index) =>
    index === 2
      ? `${decorate(color, [96, 1], '  ██║ ')}${decorate(color, [38, 5, 208, 1], '█')}${decorate(color, [96, 1], ' ██║      ██║   ██║██████╔╝██║  ██║██║   ██║')}`
      : decorate(color, [96, 1], line)
  )
  const tagline = [
    '                    ╔═══════════════════╗',
    '                    ║  ORDER · CONTROL  ║',
    '                    ║  VERIFY · REPEAT  ║',
    '                    ╚═══════════════════╝'
  ].map(line => decorate(color, [90], line))

  return [...mark, '', ...tagline].join('\n')
}

export function createOutputTheme(color: boolean): OutputTheme {
  return Object.freeze({
    color,
    brand: (label: string) =>
      `${decorate(color, [96, 1], '◆ ORDO')}${decorate(color, [90], ' // ')}${decorate(color, [1], label.toUpperCase())}`,
    section: (label: string) => decorate(color, [96, 1], `┌─ ${label.toUpperCase()}`),
    accent: (value: string) => decorate(color, [96], value),
    strong: (value: string) => decorate(color, [1], value),
    muted: (value: string) => decorate(color, [90], value),
    success: (value: string) => decorate(color, [92], value),
    info: (value: string) => decorate(color, [94], value),
    warning: (value: string) => decorate(color, [93], value),
    danger: (value: string) => decorate(color, [91], value)
  })
}
