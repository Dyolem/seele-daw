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
        op: 'insert',
        table: 'midiSources',
        after: command.source,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: command.source.id,
        records: [command.note],
      },
      {
        op: 'insert-partition',
        table: 'midiSustainPedalEvents',
        sourceId: command.source.id,
        records: [],
      },
      {
        op: 'insert',
        table: 'clips',
        after: command.clip,
      },
    ]),
  }
}
