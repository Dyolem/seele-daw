import { ProjectCommandError } from '@/commands/project-command-error'
import {
  type AddNoteCommand,
  type MoveNoteCommand,
  type RemoveNoteCommand,
} from '@/commands/project-command'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '@/commands/project-command-preparation'
import type { NoteId } from '@/model/ids'
import { createMidiNoteRecord, type MidiNoteRecord } from '@/model/midi-note'
import type { ModelRevision } from '@/model/model-revision'
import type { MidiSourceRecord } from '@/model/midi-source'
import type { ModelStoreReader } from '@/model/model-store'
import { createMutationPlan } from '@/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'
import type { ProjectMutation } from '@/mutation/project-mutation'
import { addTicks } from '@/time/tick'

type MidiNoteCommand = AddNoteCommand | MoveNoteCommand | RemoveNoteCommand

function requireMidiSource(reader: ModelStoreReader, command: MidiNoteCommand): MidiSourceRecord {
  const source = reader.getMidiSource(command.sourceId)

  if (source === undefined) {
    throw new ProjectCommandError(
      'midi-source-not-found',
      `MidiSource ${command.sourceId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: command.noteId,
        sourceId: command.sourceId,
      },
    )
  }

  return source
}

function assertNotePartitionExists(reader: ModelStoreReader, command: MidiNoteCommand): void {
  if (!reader.hasMidiNotePartition(command.sourceId)) {
    throw new ProjectCommandError(
      'midi-note-partition-missing',
      `MidiSource ${command.sourceId} does not have a MIDI Note partition`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: command.noteId,
        sourceId: command.sourceId,
      },
    )
  }
}

function requireMidiNote(
  reader: ModelStoreReader,
  command: MoveNoteCommand | RemoveNoteCommand,
): MidiNoteRecord {
  const note = reader.getMidiNote(command.sourceId, command.noteId)

  if (note === undefined) {
    throw new ProjectCommandError(
      'midi-note-not-found',
      `MIDI Note ${command.noteId} does not exist in MidiSource ${command.sourceId}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: command.noteId,
        sourceId: command.sourceId,
      },
    )
  }

  return note
}

function noteIdExists(reader: ModelStoreReader, noteId: NoteId): boolean {
  for (const sourceId of reader.midiNotePartitionIds()) {
    if (reader.getMidiNote(sourceId, noteId) !== undefined) return true
  }

  return false
}

function assertNoteIdAvailable(reader: ModelStoreReader, command: AddNoteCommand): void {
  if (noteIdExists(reader, command.noteId)) {
    throw new ProjectCommandError(
      'note-id-already-exists',
      `MIDI Note ID ${command.noteId} is already used in this project`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: command.noteId,
        sourceId: command.sourceId,
      },
    )
  }
}

function assertNoteWithinSource(
  command: AddNoteCommand | MoveNoteCommand,
  source: MidiSourceRecord,
  note: MidiNoteRecord,
): void {
  const noteEndTick = addTicks(note.startTick, note.durationTick)

  if (noteEndTick > source.lengthTick) {
    throw new ProjectCommandError(
      'note-out-of-source-range',
      `MIDI Note ${note.id} ends at Tick ${noteEndTick}, beyond MidiSource ${source.id} length ${source.lengthTick}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteEndTick,
        noteId: note.id,
        sourceId: source.id,
        sourceLengthTick: source.lengthTick,
      },
    )
  }
}

function ready(
  baseRevision: ModelRevision,
  mutation: ProjectMutation,
): ReadyProjectCommandPreparation {
  return {
    status: 'ready',
    plan: createMutationPlan(baseRevision, [mutation]),
  }
}

export function prepareAddNoteCommand(
  reader: ModelStoreReader,
  command: AddNoteCommand,
): ReadyProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  assertNoteIdAvailable(reader, command)

  const note = createMidiNoteRecord({
    id: command.noteId,
    startTick: command.startTick,
    durationTick: command.durationTick,
    pitch: command.pitch,
    velocity: command.velocity,
    channel: command.channel,
  })

  assertNoteWithinSource(command, source, note)

  return ready(command.baseRevision, {
    type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
    sourceId: command.sourceId,
    after: note,
  })
}

export function prepareRemoveNoteCommand(
  reader: ModelStoreReader,
  command: RemoveNoteCommand,
): ReadyProjectCommandPreparation {
  requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  const note = requireMidiNote(reader, command)

  return ready(command.baseRevision, {
    type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
    sourceId: command.sourceId,
    before: note,
  })
}

export function prepareMoveNoteCommand(
  reader: ModelStoreReader,
  command: MoveNoteCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  const before = requireMidiNote(reader, command)

  if (before.startTick === command.nextStartTick && before.pitch === command.nextPitch) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const after = createMidiNoteRecord({
    ...before,
    startTick: command.nextStartTick,
    pitch: command.nextPitch,
  })

  assertNoteWithinSource(command, source, after)

  return ready(command.baseRevision, {
    type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
    sourceId: command.sourceId,
    before,
    after,
  })
}
