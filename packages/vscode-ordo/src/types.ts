import type {
  ArchitectureProposal,
  ContextReport,
  DecisionTrail,
  ExploreRecord,
  PlanRecord,
  SessionRecord,
  SpecRecord,
  WorkflowItem
} from '@pompeitech/ordo-core'
import type { AgentAdapterId } from '@pompeitech/ordo-runtime'
import type { ConnectionView, UsageView } from './connections.js'
import type { ProfileSummary, ProfileView } from './profile-model.js'

export type TeamProfileState =
  | { readonly state: 'missing' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'ok'; readonly summary: ProfileSummary }

export interface WorkspaceSnapshot {
  readonly repositoryName: string
  readonly repositoryRoot: string
  readonly context: ContextReport
  readonly specs: readonly SpecRecord[]
  readonly explorations: readonly ExploreRecord[]
  readonly architectures: readonly ArchitectureProposal[]
  readonly plans: readonly PlanRecord[]
  readonly sessions: readonly SessionRecord[]
  readonly profile: TeamProfileState
}

export type HostMessage =
  | { readonly type: 'snapshot'; readonly snapshot: WorkspaceSnapshot }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'connections'; readonly connections: readonly ConnectionView[] }
  | { readonly type: 'profile'; readonly view: ProfileView }
  | { readonly type: 'usage'; readonly usage: readonly UsageView[] }
  | { readonly type: 'profileError'; readonly message: string }
  | { readonly type: 'showTab'; readonly tab: OrdoTab }
  | { readonly type: 'workflow'; readonly items: readonly WorkflowItem[] }
  | { readonly type: 'trail'; readonly trail: DecisionTrail }
  | { readonly type: 'workflowError'; readonly message: string }

export type OrdoTab =
  | 'overview'
  | 'workflow'
  | 'requirements'
  | 'plans'
  | 'decisions'
  | 'sessions'
  | 'profile'
  | 'connections'

export type WebviewMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'refresh' }
  | { readonly type: 'initializeContext' }
  | { readonly type: 'createRequirement' }
  | { readonly type: 'createPlan' }
  | { readonly type: 'openFile'; readonly path: string }
  | { readonly type: 'checkConnections' }
  | { readonly type: 'setExecutablePath'; readonly id: AgentAdapterId }
  | { readonly type: 'setApiKey'; readonly id: AgentAdapterId }
  | { readonly type: 'clearApiKey'; readonly id: AgentAdapterId }
  | { readonly type: 'createProfile' }
  | { readonly type: 'saveProfile'; readonly changes: unknown }
  | { readonly type: 'openCatalogEntry'; readonly kind: unknown; readonly id: unknown }
  | { readonly type: 'loadWorkflow' }
  | { readonly type: 'loadTrail'; readonly specId: unknown }
  | {
      readonly type: 'workflowAction'
      readonly action: unknown
      readonly targetKind: unknown
      readonly targetId: unknown
      readonly stepId: unknown
      readonly specId: unknown
    }
