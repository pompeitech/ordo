import { createHash } from 'node:crypto'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { OrdoError } from '../errors/ordo-error.js'

export function checksum(content: string | NodeJS.ArrayBufferView): string {
  return createHash('sha256').update(content).digest('hex')
}

export function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/')
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    normalized.split('/').some(segment => segment === '..' || segment === '')
  ) {
    throw new OrdoError('PATH_UNSAFE', `Unsafe relative path: ${value}`)
  }

  return normalized
}

export function assertPathInside(rootDirectory: string, relativePath: string): string {
  const root = path.resolve(rootDirectory)
  if (path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) {
    throw new OrdoError('PATH_UNSAFE', `Absolute paths are not allowed: ${relativePath}`)
  }

  const candidate = path.resolve(root, relativePath.replaceAll('\\', '/'))
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new OrdoError('PATH_UNSAFE', `Path escapes repository root: ${relativePath}`)
  }

  return candidate
}

export function relativePathInside(rootDirectory: string, candidatePath: string): string {
  const root = path.resolve(rootDirectory)
  const candidate = path.resolve(candidatePath)
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new OrdoError('PATH_UNSAFE', `Path is outside repository root: ${candidatePath}`)
  }

  return relative.length === 0 ? '.' : relative.split(path.sep).join('/')
}

export async function assertNoSymlinkTraversal(
  rootDirectory: string,
  candidatePath: string
): Promise<void> {
  const relative = relativePathInside(rootDirectory, candidatePath)
  if (relative === '.') {
    return
  }

  let current = path.resolve(rootDirectory)
  for (const segment of relative.split('/')) {
    current = path.join(current, segment)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw new OrdoError('PATH_UNSAFE', `Symlink traversal is not allowed: ${current}`)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }

      throw error
    }
  }
}

export async function checksumFile(filePath: string): Promise<string | null> {
  try {
    return checksum(await readFile(filePath))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}
