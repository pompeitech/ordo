import { OrdoError } from '../errors/ordo-error.js'
import type {
  ChoiceRequest,
  Decision,
  DecisionAuditEvent,
  DecisionAuditSink,
  DecisionKind,
  DecisionResolution,
  NoulRequest,
  ScoreRequest
} from './types.js'

export interface DecisionProvider {
  readonly id: string
  choose<T extends string>(request: ChoiceRequest<T>): Promise<Decision<T>>
  score(request: ScoreRequest): Promise<Decision<number>>
  assert(request: NoulRequest): Promise<Decision<boolean>>
}

export interface RuleBasedDecisionHandlers {
  readonly choose: <T extends string>(request: ChoiceRequest<T>) => T | Promise<T>
  readonly score: (request: ScoreRequest) => number | Promise<number>
  readonly assert: (request: NoulRequest) => boolean | Promise<boolean>
}

function validateConfidence(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new OrdoError('DECISION_INVALID', 'Decision confidence must be between 0 and 1')
  }
}

function deterministicDecision<T>(value: T, provider: string): Decision<T> {
  return Object.freeze({ value, confidence: 1, provider, fallbackUsed: false })
}

export class RuleBasedDecisionProvider implements DecisionProvider {
  readonly id: string
  readonly #handlers: RuleBasedDecisionHandlers

  constructor(handlers: RuleBasedDecisionHandlers, id = 'rule-based') {
    this.id = id
    this.#handlers = handlers
  }

  async choose<T extends string>(request: ChoiceRequest<T>): Promise<Decision<T>> {
    const value = await this.#handlers.choose(request)
    if (!request.choices.some(choice => choice.value === value)) {
      throw new OrdoError('DECISION_INVALID', `Rule returned an unknown choice for: ${request.id}`)
    }

    return deterministicDecision(value, this.id)
  }

  async score(request: ScoreRequest): Promise<Decision<number>> {
    const value = await this.#handlers.score(request)
    if (!Number.isFinite(value) || value < request.minimum || value > request.maximum) {
      throw new OrdoError(
        'DECISION_INVALID',
        `Rule returned an out-of-range score for: ${request.id}`
      )
    }

    return deterministicDecision(value, this.id)
  }

  async assert(request: NoulRequest): Promise<Decision<boolean>> {
    return deterministicDecision(await this.#handlers.assert(request), this.id)
  }
}

export class AuditedDecisionProvider implements DecisionProvider {
  readonly id: string
  readonly #provider: DecisionProvider
  readonly #sink: DecisionAuditSink

  constructor(provider: DecisionProvider, sink: DecisionAuditSink) {
    this.id = provider.id
    this.#provider = provider
    this.#sink = sink
  }

  async #record<T>(requestId: string, kind: DecisionKind, decision: Decision<T>): Promise<void> {
    const event: DecisionAuditEvent<T> = {
      requestId,
      kind,
      value: decision.value,
      confidence: decision.confidence,
      provider: decision.provider,
      fallbackUsed: decision.fallbackUsed
    }
    await this.#sink.record(event)
  }

  async choose<T extends string>(request: ChoiceRequest<T>): Promise<Decision<T>> {
    const decision = await this.#provider.choose(request)
    await this.#record(request.id, 'choice', decision)
    return decision
  }

  async score(request: ScoreRequest): Promise<Decision<number>> {
    const decision = await this.#provider.score(request)
    await this.#record(request.id, 'score', decision)
    return decision
  }

  async assert(request: NoulRequest): Promise<Decision<boolean>> {
    const decision = await this.#provider.assert(request)
    await this.#record(request.id, 'noul', decision)
    return decision
  }
}

export function resolveDecision<T>(
  decision: Decision<T>,
  threshold: number,
  fallback?: T
): DecisionResolution<T> {
  validateConfidence(decision.confidence)
  validateConfidence(threshold)
  if (decision.confidence >= threshold) {
    return { status: 'accepted', decision, value: decision.value }
  }

  if (fallback !== undefined) {
    return {
      status: 'fallback',
      decision: { ...decision, fallbackUsed: true },
      value: fallback
    }
  }

  return { status: 'escalate', decision, value: null }
}
