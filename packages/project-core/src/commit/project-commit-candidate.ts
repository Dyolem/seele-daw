import {
  type ProjectCommand,
  type ProjectCommandType,
} from '#internal/commands/protocol/project-command'
import {
  PROJECT_COMMIT_ORIGIN_KIND,
  type ProjectCommit,
  type ProjectCommandCommitOrigin,
  type ProjectHistoryCommitOrigin,
  type ProjectHistoryDirection,
} from '#internal/commit/project-commit'
import { nextModelRevision } from '#internal/model/model-revision'
import type { MutationPlan } from '#internal/mutation/mutation-plan'

/** A commit publishes the plan's normalized forward changes as they are. */
function createCandidate(
  plan: MutationPlan,
  origin: ProjectCommandCommitOrigin | ProjectHistoryCommitOrigin,
): ProjectCommit {
  return Object.freeze({
    baseRevision: plan.baseRevision,
    modelRevision: nextModelRevision(plan.baseRevision),
    origin,
    changes: plan.forward,
  })
}

/**
 * Builds an immutable candidate before MutationApplier runs. The Command must be the normalized
 * instance returned beside this plan by prepareProjectCommand; its type labels the commit, while
 * consumers read what changed from the changes. command-properties.spec pins every command's plan.
 */
export function createProjectCommitCandidate(
  normalizedCommand: ProjectCommand,
  plan: MutationPlan,
): ProjectCommit {
  return createCandidate(
    plan,
    Object.freeze<ProjectCommandCommitOrigin>({
      kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
      commandType: normalizedCommand.type,
    }),
  )
}

export interface CreateHistoryProjectCommitCandidateInput {
  readonly direction: ProjectHistoryDirection
  readonly commandType: ProjectCommandType
}

/** @internal Builds the new commit produced by executing one History replay plan. */
export function createHistoryProjectCommitCandidate(
  input: CreateHistoryProjectCommitCandidateInput,
  plan: MutationPlan,
): ProjectCommit {
  return createCandidate(
    plan,
    Object.freeze<ProjectHistoryCommitOrigin>({
      kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
      direction: input.direction,
      commandType: input.commandType,
    }),
  )
}
