export interface DecisionRequest {
  readonly id: string
  readonly state: unknown
  readonly instructions: string
}

export interface ChoiceOption<T extends string> {
  readonly value: T
  readonly description: string
}

export interface ChoiceRequest<T extends string> extends DecisionRequest {
  readonly choices: readonly ChoiceOption<T>[]
}

export interface ScoreRequest extends DecisionRequest {
  readonly minimum: number
  readonly maximum: number
}

export type NoulRequest = DecisionRequest

export interface Decision<T> {
  readonly value: T
  readonly confidence: number
  readonly provider: string
  readonly fallbackUsed: boolean
}

export type DecisionResolution<T> =
  | { readonly status: 'accepted'; readonly decision: Decision<T>; readonly value: T }
  | { readonly status: 'fallback'; readonly decision: Decision<T>; readonly value: T }
  | { readonly status: 'escalate'; readonly decision: Decision<T>; readonly value: null }

export type DecisionKind = 'choice' | 'score' | 'noul'

export interface DecisionAuditEvent<T = unknown> {
  readonly requestId: string
  readonly kind: DecisionKind
  readonly value: T
  readonly confidence: number
  readonly provider: string
  readonly fallbackUsed: boolean
}

export interface DecisionAuditSink {
  record(event: DecisionAuditEvent): void | Promise<void>
}
