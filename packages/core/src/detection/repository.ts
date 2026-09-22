import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'

export interface PackageManifest {
  readonly name?: string
  readonly private?: boolean
  readonly packageManager?: string
  readonly workspaces?: unknown
  readonly dependencies: Readonly<Record<string, string>>
  readonly devDependencies: Readonly<Record<string, string>>
}

export interface RepositoryInfo {
  readonly rootDirectory: string
  readonly gitDirectory: string | null
  readonly packageJsonPath: string | null
  readonly manifest: PackageManifest | null
  readonly workspace: boolean
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate)
    return true
  } catch {
    return false
  }
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  )
}

export async function readPackageManifest(packageJsonPath: string): Promise<PackageManifest> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  } catch (error) {
    throw new OrdoError('CONFIG_INVALID', `Invalid package manifest: ${packageJsonPath}`, {
      cause: error
    })
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OrdoError('CONFIG_INVALID', `Package manifest must be an object: ${packageJsonPath}`)
  }

  const manifest = value as Record<string, unknown>
  return Object.freeze({
    name: typeof manifest.name === 'string' ? manifest.name : undefined,
    private: typeof manifest.private === 'boolean' ? manifest.private : undefined,
    packageManager:
      typeof manifest.packageManager === 'string' ? manifest.packageManager : undefined,
    workspaces: manifest.workspaces,
    dependencies: stringRecord(manifest.dependencies),
    devDependencies: stringRecord(manifest.devDependencies)
  })
}

export async function findRepositoryRoot(startDirectory = process.cwd()): Promise<string> {
  let current = path.resolve(startDirectory)
  let nearestManifest: string | null = null
  while (true) {
    if (await exists(path.join(current, '.git'))) {
      return current
    }

    if (!nearestManifest && (await exists(path.join(current, 'package.json')))) {
      nearestManifest = current
    }

    const parent = path.dirname(current)
    if (parent === current) {
      break
    }

    current = parent
  }

  if (nearestManifest) {
    return nearestManifest
  }

  throw new OrdoError('REPOSITORY_NOT_FOUND', `Repository not found from: ${startDirectory}`)
}

export async function inspectRepository(startDirectory = process.cwd()): Promise<RepositoryInfo> {
  const rootDirectory = await findRepositoryRoot(startDirectory)
  const gitPath = path.join(rootDirectory, '.git')
  const manifestPath = path.join(rootDirectory, 'package.json')
  const packageJsonPath = (await exists(manifestPath)) ? manifestPath : null
  const manifest = packageJsonPath ? await readPackageManifest(packageJsonPath) : null
  const workspace = Boolean(
    manifest?.workspaces ||
      (await exists(path.join(rootDirectory, 'pnpm-workspace.yaml'))) ||
      (await exists(path.join(rootDirectory, 'lerna.json'))) ||
      (await exists(path.join(rootDirectory, 'nx.json')))
  )
  return Object.freeze({
    rootDirectory,
    gitDirectory: (await exists(gitPath)) ? gitPath : null,
    packageJsonPath,
    manifest,
    workspace
  })
}
