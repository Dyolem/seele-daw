import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import {
  assertMidiNoteIdAvailable,
  assertMidiNoteWithinSource,
  type MidiNoteCommandValidationContext,
} from '#internal/commands/midi-note/command-validation'
import {
  type AddNoteCommand,
  type MoveNotesCommand,
  type RemoveNotesCommand,
  type ResizeNoteCommand,
} from '#internal/commands/protocol/project-command'
import type {
  NoChangeProjectCommandPreparation,
  ReadyProjectCommandPreparation,
} from '#internal/commands/preparation/project-command-preparation'
import type { NoteId } from '#internal/model/ids'
import { createMidiNoteRecord, type MidiNoteRecord } from '#internal/model/midi-note'
import { MIDI_PITCH_MAX, MIDI_PITCH_MIN, parseMidiPitch } from '#internal/model/scalars'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import { parseTick } from '#internal/time/tick'

type MidiNoteCommand = AddNoteCommand | MoveNotesCommand | RemoveNotesCommand | ResizeNoteCommand

function requireMidiSource(reader: ModelStoreReader, command: MidiNoteCommand): MidiSourceRecord {
  const source = reader.getMidiSource(command.sourceId)

  if (source === undefined) {
    throw new ProjectCommandError(
      'midi-source-not-found',
      `MidiSource ${command.sourceId} does not exist`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        sourceId: command.sourceId,
        ...('noteId' in command ? { noteId: command.noteId } : {}),
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
        sourceId: command.sourceId,
        ...('noteId' in command ? { noteId: command.noteId } : {}),
      },
    )
  }
}

function requireMidiNote(
  reader: ModelStoreReader,
  command: MoveNotesCommand | RemoveNotesCommand | ResizeNoteCommand,
  noteId: NoteId,
): MidiNoteRecord {
  const note = reader.getMidiNote(command.sourceId, noteId)

  if (note === undefined) {
    throw new ProjectCommandError(
      'midi-note-not-found',
      `MIDI Note ${noteId} does not exist in MidiSource ${command.sourceId}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId,
        sourceId: command.sourceId,
      },
    )
  }

  return note
}

function validationContext(
  command: AddNoteCommand | MoveNotesCommand | ResizeNoteCommand,
  noteId: NoteId,
): MidiNoteCommandValidationContext {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    noteId,
    sourceId: command.sourceId,
  }
}

function ready(
  command: MidiNoteCommand,
  mutations: readonly ProjectMutation[],
): ReadyProjectCommandPreparation {
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, mutations),
  }
}

export function prepareAddNoteCommand(
  reader: ModelStoreReader,
  command: AddNoteCommand,
): ReadyProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  assertMidiNoteIdAvailable(reader, validationContext(command, command.noteId))

  const note = createMidiNoteRecord({
    id: command.noteId,
    startTick: command.startTick,
    durationTick: command.durationTick,
    pitch: command.pitch,
    velocity: command.velocity,
    channel: command.channel,
  })

  assertMidiNoteWithinSource(validationContext(command, note.id), source, note)

  return ready(command, [
    {
      type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
      sourceId: command.sourceId,
      after: note,
    },
  ])
}

export function prepareRemoveNotesCommand(
  reader: ModelStoreReader,
  command: RemoveNotesCommand,
): ReadyProjectCommandPreparation {
  requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)

  const mutations = command.noteIds.map<ProjectMutation>((noteId) => ({
    type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
    sourceId: command.sourceId,
    before: requireMidiNote(reader, command, noteId),
  }))

  return ready(command, mutations)
}

function createMovedNote(command: MoveNotesCommand, before: MidiNoteRecord): MidiNoteRecord {
  const nextStartTick = before.startTick + command.deltaTick
  if (!Number.isSafeInteger(nextStartTick) || nextStartTick < 0) {
    throw new ProjectCommandError(
      'note-out-of-source-range',
      `MIDI Note ${before.id} cannot move to Tick ${nextStartTick}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: before.id,
        noteStartTick: nextStartTick,
        sourceId: command.sourceId,
      },
    )
  }

  const nextPitch = before.pitch + command.deltaPitch
  if (nextPitch < MIDI_PITCH_MIN || nextPitch > MIDI_PITCH_MAX) {
    throw new ProjectCommandError(
      'note-pitch-out-of-range',
      `MIDI Note ${before.id} cannot move to MIDI Pitch ${nextPitch}`,
      {
        baseRevision: command.baseRevision,
        commandType: command.type,
        noteId: before.id,
        notePitch: nextPitch,
        sourceId: command.sourceId,
      },
    )
  }

  return createMidiNoteRecord({
    ...before,
    startTick: parseTick(nextStartTick),
    pitch: parseMidiPitch(nextPitch),
  })
}

export function prepareMoveNotesCommand(
  reader: ModelStoreReader,
  command: MoveNotesCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  const notes = command.noteIds.map((noteId) => requireMidiNote(reader, command, noteId))

  if (command.deltaTick === 0 && command.deltaPitch === 0) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const mutations = notes.map<ProjectMutation>((before) => {
    const after = createMovedNote(command, before)
    assertMidiNoteWithinSource(validationContext(command, before.id), source, after)

    return {
      type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
      sourceId: command.sourceId,
      before,
      after,
    }
  })

  return ready(command, mutations)
}

export function prepareResizeNoteCommand(
  reader: ModelStoreReader,
  command: ResizeNoteCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
  assertNotePartitionExists(reader, command)
  const before = requireMidiNote(reader, command, command.noteId)

  if (command.startTick === before.startTick && command.durationTick === before.durationTick) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const after = createMidiNoteRecord({
    ...before,
    startTick: command.startTick,
    durationTick: command.durationTick,
  })
  assertMidiNoteWithinSource(validationContext(command, before.id), source, after)

  return ready(command, [
    {
      type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
      sourceId: command.sourceId,
      before,
      after,
    },
  ])
}
