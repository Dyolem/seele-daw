import type { AddMidiClipWithNoteCommand } from '#internal/commands/protocol/project-command'
import type { ReadyProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import { assertNewMidiClipGraphCanBeAdded } from '#internal/commands/midi-clip/command-handler'
import {
  assertNoteWithinClipWindow,
  createPlacementNoteValidationContext,
} from '#internal/commands/midi-clip-note-placement/note-placement-validation'
import {
  assertMidiNoteIdAvailable,
  assertMidiNoteWithinSource,
} from '#internal/commands/midi-note/command-validation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'

export function prepareAddMidiClipWithNoteCommand(
  reader: ModelStoreReader,
  command: AddMidiClipWithNoteCommand,
): ReadyProjectCommandPreparation {
  assertNewMidiClipGraphCanBeAdded(reader, command)

  const context = createPlacementNoteValidationContext(command, command.source.id)
  assertMidiNoteIdAvailable(reader, context)
  assertMidiNoteWithinSource(context, command.source, command.note)
  assertNoteWithinClipWindow(command, command.clip, command.note)

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, [
      {
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: command.source,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: command.source.id,
        after: [command.note],
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
        after: command.clip,
      },
    ]),
  }
}
