import {
  type CatalogInspectionReport,
  type InspectCatalogOptions,
  inspectCatalog
} from './catalog.js'

export type InspectRulesOptions = Omit<InspectCatalogOptions, 'kind'>

export async function inspectRules(options: InspectRulesOptions): Promise<CatalogInspectionReport> {
  return inspectCatalog({ ...options, kind: 'rules' })
}
