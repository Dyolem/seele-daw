import type { ModelRevision } from '#internal/model/model-revision'
import type { MutationPlan } from '#internal/mutation/mutation-plan'

export interface ReadyProjectCommandPreparation {
  readonly status: 'ready'
  readonly plan: MutationPlan
}

export interface NoChangeProjectCommandPreparation {
  readonly status: 'no-change'
  readonly reason: 'already-at-target'
  readonly baseRevision: ModelRevision
}

export type ProjectCommandPreparation =
  | ReadyProjectCommandPreparation
  | NoChangeProjectCommandPreparation
