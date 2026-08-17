import type { ProjectCommandType } from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type { MidiSourceId, NoteId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import { addTicks } from '#internal/time/tick'

export interface MidiNoteCommandValidationContext {
  readonly baseRevision: ModelRevision
  readonly commandType: ProjectCommandType
  readonly noteId: NoteId
  readonly sourceId: MidiSourceId
}

function midiNoteIdExists(reader: ModelStoreReader, noteId: NoteId): boolean {
  for (const sourceId of reader.midiNotePartitionIds()) {
    if (reader.getMidiNote(sourceId, noteId) !== undefined) return true
  }

  return false
}

export function assertMidiNoteIdAvailable(
  reader: ModelStoreReader,
  context: MidiNoteCommandValidationContext,
): void {
  if (!midiNoteIdExists(reader, context.noteId)) return

  throw new ProjectCommandError(
    'note-id-already-exists',
    `MIDI Note ID ${context.noteId} is already used in this project`,
    context,
  )
}

export function assertMidiNoteWithinSource(
  context: MidiNoteCommandValidationContext,
  source: MidiSourceRecord,
  note: MidiNoteRecord,
): void {
  const noteEndTick = addTicks(note.startTick, note.durationTick)

  if (noteEndTick <= source.lengthTick) return

  throw new ProjectCommandError(
    'note-out-of-source-range',
    `MIDI Note ${note.id} ends at Tick ${noteEndTick}, beyond MidiSource ${source.id} length ${source.lengthTick}`,
    {
      ...context,
      noteEndTick,
      sourceLengthTick: source.lengthTick,
    },
  )
}
