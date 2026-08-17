import type {
  AddMidiClipCommand,
  AddMidiClipWithNoteCommand,
} from '#internal/commands/project-command'
import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { ReadyProjectCommandPreparation } from '#internal/commands/project-command-preparation'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { addTicks } from '#internal/time/tick'

type NewMidiClipCommand = AddMidiClipCommand | AddMidiClipWithNoteCommand

function commandDetails(command: NewMidiClipCommand) {
  return {
    baseRevision: command.baseRevision,
    clipId: command.clip.id,
    commandType: command.type,
    sourceId: command.source.id,
    trackId: command.clip.trackId,
  } as const
}

function requireInstrumentTrack(reader: ModelStoreReader, command: NewMidiClipCommand): void {
  const track = reader.getTrack(command.clip.trackId)

  if (track === undefined) {
    throw new ProjectCommandError(
      'track-not-found',
      `Track ${command.clip.trackId} does not exist`,
      commandDetails(command),
    )
  }

  if (track.kind !== 'instrument') {
    throw new ProjectCommandError(
      'midi-clip-track-kind-mismatch',
      `MIDI Clip ${command.clip.id} cannot belong to non-Instrument Track ${track.id}`,
      { ...commandDetails(command), trackKind: track.kind },
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
      commandDetails(command),
    )
  }

  if (reader.getMidiSource(command.source.id) !== undefined) {
    throw new ProjectCommandError(
      'midi-source-id-already-exists',
      `MidiSource ID ${command.source.id} is already used in this project`,
      commandDetails(command),
    )
  }

  if (reader.hasMidiNotePartition(command.source.id)) {
    throw new ProjectCommandError(
      'midi-note-partition-already-exists',
      `MidiSource ID ${command.source.id} already has a MIDI Note partition`,
      commandDetails(command),
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
      {
        ...commandDetails(command),
        sourceLengthTick: command.source.lengthTick,
        sourceReadEndTick,
      },
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
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: command.source,
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: command.source.id,
        after: [],
      },
      {
        type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
        after: command.clip,
      },
    ]),
  }
}
