import type { ProjectCommandPreparation } from '@/commands/project-command-preparation'
import type { MutationPlan } from '@/mutation/mutation-plan'

/** Narrows a command preparation in specs without adding test-only production exports. */
export function requireReadyProjectCommandPlan(
  preparation: ProjectCommandPreparation,
): MutationPlan {
  if (preparation.status !== 'ready') {
    throw new Error('Expected a ready ProjectCommand preparation')
  }

  return preparation.plan
}
