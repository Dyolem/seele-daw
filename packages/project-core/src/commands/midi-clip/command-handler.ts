import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type {
  AddMidiClipCommand,
  AddMidiClipWithNoteCommand,
} from '#internal/commands/protocol/project-command'
import type { ReadyProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { addTicks } from '#internal/time/tick'

type NewMidiClipCommand = AddMidiClipCommand | AddMidiClipWithNoteCommand

function requireInstrumentTrack(reader: ModelStoreReader, command: NewMidiClipCommand): void {
  const track = reader.getTrack(command.clip.trackId)

  if (track === undefined) {
    throw new ProjectCommandError('track-not-found', `Track ${command.clip.trackId} does not exist`)
  }

  if (track.kind !== 'instrument') {
    throw new ProjectCommandError(
      'midi-clip-track-kind-mismatch',
      `MIDI Clip ${command.clip.id} cannot belong to non-Instrument Track ${track.id}`,
    )
  }
}

function assertClipGraphIdentitiesAvailable(
  reader: ModelStoreReader,
  command: NewMidiClipCommand,
): void {
  if (reader.getClip(command.clip.id) !== undefined) {
    throw new ProjectCommandError(
      'clip-id-already-exists',
      `Clip ID ${command.clip.id} is already used in this project`,
    )
  }

  if (reader.getMidiSource(command.source.id) !== undefined) {
    throw new ProjectCommandError(
      'midi-source-id-already-exists',
      `MidiSource ID ${command.source.id} is already used in this project`,
    )
  }
}

function assertClipWithinSource(command: NewMidiClipCommand): void {
  const sourceReadEndTick =
    command.clip.loop === null
      ? addTicks(command.clip.sourceOffsetTick, command.clip.spanTick)
      : addTicks(command.clip.loop.sourceStartTick, command.clip.loop.sourceSpanTick)

  if (sourceReadEndTick > command.source.lengthTick) {
    throw new ProjectCommandError(
      'midi-clip-out-of-source-range',
      `MIDI Clip ${command.clip.id} reads through Tick ${sourceReadEndTick}, beyond MidiSource ${command.source.id} length ${command.source.lengthTick}`,
    )
  }
}

/** Validates a complete new non-shared MIDI Clip ownership graph before planning content. */
export function assertNewMidiClipGraphCanBeAdded(
  reader: ModelStoreReader,
  command: NewMidiClipCommand,
): void {
  requireInstrumentTrack(reader, command)
  assertClipGraphIdentitiesAvailable(reader, command)
  assertClipWithinSource(command)
}

/** Prepares one complete empty MIDI Clip ownership graph without taking write access. */
export function prepareAddMidiClipCommand(
  reader: ModelStoreReader,
  command: AddMidiClipCommand,
): ReadyProjectCommandPreparation {
  assertNewMidiClipGraphCanBeAdded(reader, command)

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
        records: [],
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
