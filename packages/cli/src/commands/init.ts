import { rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  type AdapterId,
  assertNoSymlinkTraversal,
  type ConflictStrategy,
  type ContentSelectionConfig,
  findConfigPath,
  inspectRepository,
  OrdoError
} from '@pompeitech/ordo-core'

export interface InitializeRepositoryOptions {
  readonly directory: string
  readonly adapters: readonly AdapterId[]
  readonly contentRoot?: string
  readonly content?: ContentSelectionConfig
  readonly conflictStrategy?: ConflictStrategy
  readonly prune?: boolean
  readonly force?: boolean
}

export interface InitReport {
  readonly schemaVersion: 1
  readonly command: 'init'
  readonly repositoryRoot: string
  readonly configPath: string
  readonly targets: readonly AdapterId[]
  readonly contentRoot: string
  readonly conflictStrategy: ConflictStrategy
  readonly prune: boolean
  readonly created: boolean
  readonly overwritten: boolean
}

function configurationContentRoot(repositoryRoot: string, contentRoot?: string): string {
  const absoluteRoot = path.resolve(repositoryRoot, contentRoot ?? 'content')
  const relativeRoot = path.relative(repositoryRoot, absoluteRoot)
  const insideRepository = relativeRoot !== '..' && !relativeRoot.startsWith(`..${path.sep}`)

  return insideRepository
    ? (relativeRoot || '.').split(path.sep).join('/')
    : absoluteRoot.split(path.sep).join('/')
}

async function writeConfiguration(filePath: string, content: string, overwrite: boolean) {
  if (!overwrite) {
    try {
      await writeFile(filePath, content, { flag: 'wx' })

      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new OrdoError('CONFIG_INVALID', `Configuration already exists: ${filePath}`)
      }

      throw error
    }
  }

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  try {
    await writeFile(temporaryPath, content, { flag: 'wx' })
    await rename(temporaryPath, filePath)
  } catch (error) {
    try {
      await unlink(temporaryPath)
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new AggregateError([error, cleanupError], 'Unable to clean up configuration write')
      }
    }

    throw error
  }
}

export async function initializeRepository(
  options: InitializeRepositoryOptions
): Promise<InitReport> {
  const repository = await inspectRepository(options.directory)
  const existingConfigPath = await findConfigPath(repository.rootDirectory)
  if (existingConfigPath && !options.force) {
    throw new OrdoError(
      'CONFIG_INVALID',
      `Configuration already exists: ${existingConfigPath}. Use --force to replace it.`
    )
  }

  const configPath = existingConfigPath ?? path.join(repository.rootDirectory, 'ordo.config.json')
  await assertNoSymlinkTraversal(repository.rootDirectory, configPath)
  const targets = [...new Set(options.adapters)].sort((left, right) => left.localeCompare(right))
  const contentRoot = configurationContentRoot(repository.rootDirectory, options.contentRoot)
  const conflictStrategy = options.conflictStrategy ?? 'error'
  const prune = options.prune ?? false
  const config = {
    schemaVersion: 1,
    targets: targets.map(adapter => ({ adapter })),
    contentRoot,
    ...(options.content ? { content: options.content } : {}),
    installation: {
      conflictStrategy,
      prune
    }
  }
  await writeConfiguration(
    configPath,
    `${JSON.stringify(config, null, 2)}\n`,
    Boolean(existingConfigPath)
  )

  return Object.freeze({
    schemaVersion: 1,
    command: 'init',
    repositoryRoot: repository.rootDirectory,
    configPath,
    targets: Object.freeze(targets),
    contentRoot,
    conflictStrategy,
    prune,
    created: existingConfigPath === null,
    overwritten: existingConfigPath !== null
  })
}
