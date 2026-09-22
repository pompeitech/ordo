import {
  detectHarnesses,
  detectPackageManager,
  detectStack,
  type HarnessDetection,
  inspectRepository,
  type PackageManagerDetection,
  type StackDetection
} from '@pompeitech/ordo-core'

export interface DetectReport {
  readonly schemaVersion: 1
  readonly command: 'detect'
  readonly repository: {
    readonly rootDirectory: string
    readonly gitDirectory: string | null
    readonly packageJsonPath: string | null
    readonly name: string | null
    readonly workspace: boolean
  }
  readonly packageManager: PackageManagerDetection
  readonly stack: StackDetection
  readonly harnesses: readonly HarnessDetection[]
}

export async function detectRepository(directory: string): Promise<DetectReport> {
  const repository = await inspectRepository(directory)
  const [packageManager, stack, harnesses] = await Promise.all([
    detectPackageManager(repository),
    detectStack(repository),
    detectHarnesses(repository)
  ])

  return Object.freeze({
    schemaVersion: 1,
    command: 'detect',
    repository: Object.freeze({
      rootDirectory: repository.rootDirectory,
      gitDirectory: repository.gitDirectory,
      packageJsonPath: repository.packageJsonPath,
      name: repository.manifest?.name ?? null,
      workspace: repository.workspace
    }),
    packageManager,
    stack,
    harnesses
  })
}
