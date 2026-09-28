import type {
  ArchitectureProposal,
  ContextReport,
  DecisionTrail,
  ExploreRecord,
  FileChange,
  PlanRecord,
  SessionRecord,
  SpecRecord,
  WorkflowItem
} from '@pompeitech/ordo-core'
import type {
  AgentAdapterId,
  ChatHandoff,
  ChatSummary,
  ChatThread,
  PromptEstimate
} from '@pompeitech/ordo-runtime'
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
  | { readonly type: 'review'; readonly review: ReviewPanelData }
  | {
      readonly type: 'reviewResult'
      readonly planId: string
      readonly stepId: string
      readonly ok: boolean
      readonly message?: string
    }
  | { readonly type: 'runSetup'; readonly run: RunSetupData }
  | {
      readonly type: 'runPreview'
      readonly planId: string
      readonly stepId: string
      readonly harness: AgentAdapterId
      readonly estimate?: PromptEstimate
      readonly selection?: RunSelection
      readonly error?: string
    }
  | { readonly type: 'runStarted'; readonly harness: AgentAdapterId }
  | { readonly type: 'runOutput'; readonly text: string }
  | { readonly type: 'runApproval'; readonly approval: RunApproval }
  | { readonly type: 'runFinished'; readonly changedFiles?: number }
  | { readonly type: 'runFailed'; readonly message: string; readonly stopped: boolean }
  | {
      readonly type: 'chats'
      readonly chats: readonly ChatSummary[]
      readonly harnesses: readonly RunHarnessOption[]
      readonly running?: string
    }
  | { readonly type: 'chat'; readonly chat: ChatView }
  | { readonly type: 'chatStarted'; readonly chat: ChatView }
  | { readonly type: 'chatOutput'; readonly chatId: string; readonly text: string }
  | { readonly type: 'chatReply'; readonly chat: ChatView }
  | { readonly type: 'chatError'; readonly message: string }

/** A chat with what switching to each agent would hand over. */
export interface ChatView {
  readonly thread: ChatThread
  readonly handoff: Readonly<Record<AgentAdapterId, ChatHandoff>>
}

export interface ReviewPanelData {
  readonly planId: string
  readonly stepId: string
  readonly specId: string
  readonly available: boolean
  readonly reason?: string
  readonly files: readonly FileChange[]
}

export interface RunHarnessOption {
  readonly id: AgentAdapterId
  readonly name: string
  readonly connected: boolean
  readonly detail: string
}

export interface RunSetupData {
  readonly planId: string
  readonly stepId: string
  readonly specId: string
  readonly harnesses: readonly RunHarnessOption[]
  readonly running: boolean
}

export interface RunSelection {
  readonly agent?: string
  readonly skills: readonly string[]
  readonly rules: readonly string[]
}

export interface RunApproval {
  readonly id: string
  readonly summary: string
  readonly command?: string
  readonly cwd?: string
  readonly reason?: string
}

export type OrdoTab =
  | 'overview'
  | 'chat'
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
      readonly type: 'openReview'
      readonly planId: unknown
      readonly stepId: unknown
      readonly specId: unknown
    }
  | {
      readonly type: 'openDiff'
      readonly planId: unknown
      readonly stepId: unknown
      readonly path: unknown
    }
  | {
      readonly type: 'submitReview'
      readonly planId: unknown
      readonly stepId: unknown
      readonly specId: unknown
      readonly decision: unknown
      readonly note: unknown
      readonly rejectFiles: unknown
    }
  | {
      readonly type: 'openRun'
      readonly planId: unknown
      readonly stepId: unknown
      readonly specId: unknown
    }
  | {
      readonly type: 'prepareRun'
      readonly planId: unknown
      readonly stepId: unknown
      readonly specId: unknown
      readonly harness: unknown
    }
  | {
      readonly type: 'startRun'
      readonly planId: unknown
      readonly stepId: unknown
      readonly specId: unknown
      readonly harness: unknown
      readonly prompt: unknown
    }
  | { readonly type: 'stopRun' }
  | { readonly type: 'loadChats' }
  | { readonly type: 'openChat'; readonly id: unknown }
  | { readonly type: 'deleteChat'; readonly id: unknown }
  | {
      readonly type: 'sendChat'
      readonly chatId: unknown
      readonly harness: unknown
      readonly text: unknown
    }
  | { readonly type: 'stopChat' }
  | { readonly type: 'approvalDecision'; readonly id: unknown; readonly decision: unknown }
  | {
      readonly type: 'workflowAction'
      readonly action: unknown
      readonly targetKind: unknown
      readonly targetId: unknown
      readonly stepId: unknown
      readonly specId: unknown
    }
