import {
  findRepositoryRoot,
  initializeProjectProfile,
  loadConfig,
  type ProfileCatalogKind,
  type ProfileEntryMode,
  type ProjectProfile,
  previewProjectProfile,
  previewProjectProfileEntry,
  readProjectProfile,
  resolveContentRoot,
  updateProjectProfileEntry,
  validateProjectProfile
} from '@pompeitech/ordo-core'
import { discoverDefaultContentRoot } from '../prompts/init.js'

export type ProfileAction = 'init' | 'show' | 'validate' | 'set'

export interface ManageProfileOptions {
  readonly directory: string
  readonly action: ProfileAction
  readonly contentRoot?: string
  readonly agentIds?: readonly string[]
  readonly ruleIds?: readonly string[]
  readonly skillIds?: readonly string[]
  readonly defaultAgentId?: string
  readonly kind?: ProfileCatalogKind
  readonly id?: string
  readonly mode?: ProfileEntryMode
  readonly dryRun?: boolean
}

export interface ProfileCommandReport {
  readonly schemaVersion: 1
  readonly command: 'profile-init' | 'profile-show' | 'profile-validate' | 'profile-set'
  readonly repositoryRoot: string
  readonly contentRoot: string
  readonly dryRun: boolean
  readonly profile: ProjectProfile
  readonly valid?: boolean
  readonly errors?: readonly string[]
}

export async function manageProfile(options: ManageProfileOptions): Promise<ProfileCommandReport> {
  const repositoryRoot = await findRepositoryRoot(options.directory)
  const configured = await loadConfig({ cwd: repositoryRoot, optional: true })
  const contentRoot = options.contentRoot
    ? resolveContentRoot(repositoryRoot, configured.config.contentRoot, options.contentRoot)
    : await discoverDefaultContentRoot(repositoryRoot, configured.config.contentRoot)

  if (options.action === 'show') {
    return {
      schemaVersion: 1,
      command: 'profile-show',
      repositoryRoot,
      contentRoot,
      dryRun: false,
      profile: await readProjectProfile(repositoryRoot)
    }
  }
  if (options.action === 'validate') {
    const validation = await validateProjectProfile(repositoryRoot, contentRoot)
    return {
      schemaVersion: 1,
      command: 'profile-validate',
      repositoryRoot,
      contentRoot,
      dryRun: false,
      profile: validation.profile as ProjectProfile,
      valid: validation.valid,
      errors: validation.errors
    }
  }
  if (options.action === 'set') {
    const kind = options.kind ?? 'agents'
    const id = options.id ?? ''
    const mode = options.mode ?? 'enabled'
    const profile = options.dryRun
      ? await previewProjectProfileEntry(repositoryRoot, contentRoot, kind, id, mode)
      : await updateProjectProfileEntry(repositoryRoot, contentRoot, kind, id, mode)
    return {
      schemaVersion: 1,
      command: 'profile-set',
      repositoryRoot,
      contentRoot,
      dryRun: options.dryRun ?? false,
      profile
    }
  }
  const input = {
    agentIds: options.agentIds,
    ruleIds: options.ruleIds,
    skillIds: options.skillIds,
    defaultAgentId: options.defaultAgentId
  }
  const profile = options.dryRun
    ? await previewProjectProfile(repositoryRoot, contentRoot, input)
    : await initializeProjectProfile(repositoryRoot, contentRoot, input)
  return {
    schemaVersion: 1,
    command: 'profile-init',
    repositoryRoot,
    contentRoot,
    dryRun: options.dryRun ?? false,
    profile
  }
}
