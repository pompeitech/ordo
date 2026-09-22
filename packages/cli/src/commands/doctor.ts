import { claudeAdapter } from '@pompeitech/ordo-adapter-claude'
import { codexAdapter } from '@pompeitech/ordo-adapter-codex'
import { AdapterRegistry, type DoctorReport, runDoctor } from '@pompeitech/ordo-core'

const adapters = new AdapterRegistry([claudeAdapter, codexAdapter])

export interface DiagnoseRepositoryOptions {
  readonly directory: string
  readonly contentRoot?: string
}

export async function diagnoseRepository(
  options: DiagnoseRepositoryOptions
): Promise<DoctorReport> {
  return runDoctor({
    cwd: options.directory,
    contentRoot: options.contentRoot,
    adapters
  })
}
