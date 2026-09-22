import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { RepositoryInfo } from './repository.js'

export type TechnologyCategory =
  | 'language'
  | 'runtime'
  | 'framework'
  | 'database'
  | 'testing'
  | 'build'

export interface DetectedTechnology {
  readonly id: string
  readonly name: string
  readonly category: TechnologyCategory
  readonly evidence: readonly string[]
}

export interface StackDetection {
  readonly technologies: readonly DetectedTechnology[]
}

interface DependencyTechnology {
  readonly id: string
  readonly name: string
  readonly category: TechnologyCategory
  readonly packages: readonly string[]
}

const DEPENDENCY_TECHNOLOGIES: readonly DependencyTechnology[] = [
  { id: 'fastify', name: 'Fastify', category: 'framework', packages: ['fastify'] },
  { id: 'react', name: 'React', category: 'framework', packages: ['react'] },
  { id: 'nextjs', name: 'Next.js', category: 'framework', packages: ['next'] },
  { id: 'express', name: 'Express', category: 'framework', packages: ['express'] },
  { id: 'mongodb', name: 'MongoDB', category: 'database', packages: ['mongodb', 'mongoose'] },
  { id: 'vitest', name: 'Vitest', category: 'testing', packages: ['vitest'] },
  { id: 'jest', name: 'Jest', category: 'testing', packages: ['jest'] },
  { id: 'playwright', name: 'Playwright', category: 'testing', packages: ['@playwright/test'] },
  { id: 'vite', name: 'Vite', category: 'build', packages: ['vite'] },
  { id: 'typescript', name: 'TypeScript', category: 'language', packages: ['typescript'] }
]

async function isFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

export async function detectStack(repository: RepositoryInfo): Promise<StackDetection> {
  const dependencies = {
    ...repository.manifest?.dependencies,
    ...repository.manifest?.devDependencies
  }
  const technologies: DetectedTechnology[] = []

  if (repository.packageJsonPath) {
    technologies.push({
      id: 'nodejs',
      name: 'Node.js',
      category: 'runtime',
      evidence: Object.freeze([repository.packageJsonPath])
    })
  }

  for (const technology of DEPENDENCY_TECHNOLOGIES) {
    const matches = technology.packages.filter(
      packageName => dependencies[packageName] !== undefined
    )
    if (matches.length === 0) {
      continue
    }

    technologies.push({
      id: technology.id,
      name: technology.name,
      category: technology.category,
      evidence: Object.freeze(matches.map(packageName => `package:${packageName}`))
    })
  }

  const hasTypeScript = technologies.some(item => item.id === 'typescript')
  const tsconfigPath = path.join(repository.rootDirectory, 'tsconfig.json')
  if (!hasTypeScript && (await isFile(tsconfigPath))) {
    technologies.push({
      id: 'typescript',
      name: 'TypeScript',
      category: 'language',
      evidence: Object.freeze([tsconfigPath])
    })
  }

  if (repository.packageJsonPath && !technologies.some(item => item.category === 'language')) {
    technologies.push({
      id: 'javascript',
      name: 'JavaScript',
      category: 'language',
      evidence: Object.freeze([repository.packageJsonPath])
    })
  }

  return Object.freeze({
    technologies: Object.freeze(
      technologies.sort((left, right) =>
        `${left.category}:${left.id}`.localeCompare(`${right.category}:${right.id}`)
      )
    )
  })
}
