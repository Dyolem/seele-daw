import type {
  ProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/project-command-preparation'
import type { MutationPlan } from '#internal/mutation/mutation-plan'

/** Narrows a command preparation in specs without adding test-only production exports. */
export function requireReadyProjectCommandPlan(
  preparation: ProjectCommandPreparation,
): MutationPlan {
  if (preparation.status !== 'ready') {
    throw new Error('Expected a ready ProjectCommand preparation')
  }

  return preparation.plan
}

/** Preserves the normalized Command / plan pair when a spec exercises commit preparation. */
export function requireReadyProjectCommandPreparation(
  preparation: ProjectCommandPreparation,
): ReadyProjectCommandPreparation {
  if (preparation.status !== 'ready') {
    throw new Error('Expected a ready ProjectCommand preparation')
  }

  return preparation
}
