import {
  type CatalogInspectionReport,
  type InspectCatalogOptions,
  inspectCatalog
} from './catalog.js'

export type InspectAgentsOptions = Omit<InspectCatalogOptions, 'kind'>

export async function inspectAgents(
  options: InspectAgentsOptions
): Promise<CatalogInspectionReport> {
  return inspectCatalog({ ...options, kind: 'agents' })
}
