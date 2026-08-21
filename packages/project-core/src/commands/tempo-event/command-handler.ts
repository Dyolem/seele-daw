import type { ReplaceTempoEventBpmCommand } from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/preparation/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { createTempoEventRecord } from '#internal/time/tempo-event'

/** Prepares an identity- and position-preserving Tempo Event BPM replacement. */
export function prepareReplaceTempoEventBpmCommand(
  reader: ModelStoreReader,
  command: ReplaceTempoEventBpmCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const before = reader.getTempoEvent(command.tempoEventId)
  if (before === undefined) {
    throw new ProjectCommandError(
      'tempo-event-not-found',
      `Tempo Event ${command.tempoEventId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        tempoEventId: command.tempoEventId,
      },
    )
  }

  if (before.bpm === command.bpm) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const after = createTempoEventRecord({ ...before, bpm: command.bpm })
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before,
        after,
      },
    ]),
  }
}
