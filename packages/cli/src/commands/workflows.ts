import {
  type CatalogInspectionReport,
  type InspectCatalogOptions,
  inspectCatalog
} from './catalog.js'

export type InspectWorkflowsOptions = Omit<InspectCatalogOptions, 'kind'>

export async function inspectWorkflows(
  options: InspectWorkflowsOptions
): Promise<CatalogInspectionReport> {
  return inspectCatalog({ ...options, kind: 'workflows' })
}
