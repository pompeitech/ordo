import path from 'node:path'
import { findRepositoryRoot, loadConfig, resolveContentRoot } from '@pompeitech/ordo-core'
import {
  type AgentAdapterId,
  type AgentApprovalDecision,
  type AgentApprovalRequest,
  type PlanStepRunReport,
  runPlanStep
} from '@pompeitech/ordo-runtime'
import { discoverDefaultContentRoot } from '../prompts/init.js'

export interface RunAgentOptions {
  readonly harness?: AgentAdapterId
  readonly directory: string
  readonly prompt?: string
  readonly specId?: string
  readonly planId?: string
  readonly stepId?: string
  readonly agentId?: string
  readonly skillIds?: readonly string[]
  readonly ruleIds?: readonly string[]
  readonly contentRoot?: string
  readonly now?: () => Date
  readonly command?: string
  /** Where observed plan usage is kept; defaults to the per-user Ordo state directory. */
  readonly usageStatePath?: string
  readonly signal?: AbortSignal
  readonly onText?: (text: string) => void
  readonly onApprovalRequest?: (
    request: AgentApprovalRequest
  ) => AgentApprovalDecision | Promise<AgentApprovalDecision>
}

/** `ordo agent`: runs a ready plan step through the shared runtime used by the editor too. */
export async function runAgent(options: RunAgentOptions): Promise<PlanStepRunReport> {
  const repositoryRoot = await findRepositoryRoot(path.resolve(options.directory))
  const configured = await loadConfig({ cwd: repositoryRoot, optional: true })
  const contentRoot = options.contentRoot
    ? resolveContentRoot(repositoryRoot, configured.config.contentRoot, options.contentRoot)
    : await discoverDefaultContentRoot(repositoryRoot, configured.config.contentRoot)
  return runPlanStep(
    {
      harness: options.harness ?? 'claude-code',
      directory: repositoryRoot,
      specId: options.specId ?? '',
      planId: options.planId ?? '',
      stepId: options.stepId,
      agentId: options.agentId,
      skillIds: options.skillIds,
      ruleIds: options.ruleIds,
      contentRoot,
      prompt: options.prompt,
      command: options.command,
      usageStatePath: options.usageStatePath,
      now: options.now
    },
    {
      signal: options.signal,
      onText: options.onText,
      onApprovalRequest: options.onApprovalRequest
    }
  )
}
