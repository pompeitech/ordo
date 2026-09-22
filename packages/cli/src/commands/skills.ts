import {
  type CatalogInspectionReport,
  type InspectCatalogOptions,
  inspectCatalog
} from './catalog.js'

export type InspectSkillsOptions = Omit<InspectCatalogOptions, 'kind'>

export async function inspectSkills(
  options: InspectSkillsOptions
): Promise<CatalogInspectionReport> {
  return inspectCatalog({ ...options, kind: 'skills' })
}
