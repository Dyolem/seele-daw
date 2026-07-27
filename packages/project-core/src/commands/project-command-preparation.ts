import type { ProjectCommand } from '#internal/commands/project-command'
import type { ModelRevision } from '#internal/model/model-revision'
import type { MutationPlan } from '#internal/mutation/mutation-plan'

export interface ReadyProjectCommandPreparation {
  readonly status: 'ready'
  /**
   * The normalized Command that produced this plan. Aggregate records in the
   * plan deliberately share references with this Command.
   */
  readonly command: ProjectCommand
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
