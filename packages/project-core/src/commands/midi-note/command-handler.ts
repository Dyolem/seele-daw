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
import type { ProjectChange } from '#internal/mutation/project-change'
import { parseTick } from '#internal/time/tick'

type MidiNoteCommand = AddNoteCommand | MoveNotesCommand | RemoveNotesCommand | ResizeNoteCommand

function requireMidiSource(reader: ModelStoreReader, command: MidiNoteCommand): MidiSourceRecord {
  const source = reader.getMidiSource(command.sourceId)

  if (source === undefined) {
    throw new ProjectCommandError(
      'midi-source-not-found',
      `MidiSource ${command.sourceId} does not exist`,
    )
  }

  return source
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
  changes: readonly ProjectChange[],
): ReadyProjectCommandPreparation {
  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, changes),
  }
}

export function prepareAddNoteCommand(
  reader: ModelStoreReader,
  command: AddNoteCommand,
): ReadyProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
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
      op: 'insert',
      table: 'midiNotes',
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

  const changes = command.noteIds.map<ProjectChange>((noteId) => ({
    op: 'remove',
    table: 'midiNotes',
    sourceId: command.sourceId,
    before: requireMidiNote(reader, command, noteId),
  }))

  return ready(command, changes)
}

function createMovedNote(command: MoveNotesCommand, before: MidiNoteRecord): MidiNoteRecord {
  const nextStartTick = before.startTick + command.deltaTick
  if (!Number.isSafeInteger(nextStartTick) || nextStartTick < 0) {
    throw new ProjectCommandError(
      'note-out-of-source-range',
      `MIDI Note ${before.id} cannot move to Tick ${nextStartTick}`,
    )
  }

  const nextPitch = before.pitch + command.deltaPitch
  if (nextPitch < MIDI_PITCH_MIN || nextPitch > MIDI_PITCH_MAX) {
    throw new ProjectCommandError(
      'note-pitch-out-of-range',
      `MIDI Note ${before.id} cannot move to MIDI Pitch ${nextPitch}`,
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
  const notes = command.noteIds.map((noteId) => requireMidiNote(reader, command, noteId))

  if (command.deltaTick === 0 && command.deltaPitch === 0) {
    return {
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: command.baseRevision,
    }
  }

  const changes = notes.map<ProjectChange>((before) => {
    const after = createMovedNote(command, before)
    assertMidiNoteWithinSource(validationContext(command, before.id), source, after)

    return {
      op: 'replace',
      table: 'midiNotes',
      sourceId: command.sourceId,
      before,
      after,
    }
  })

  return ready(command, changes)
}

export function prepareResizeNoteCommand(
  reader: ModelStoreReader,
  command: ResizeNoteCommand,
): ReadyProjectCommandPreparation | NoChangeProjectCommandPreparation {
  const source = requireMidiSource(reader, command)
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
      op: 'replace',
      table: 'midiNotes',
      sourceId: command.sourceId,
      before,
      after,
    },
  ])
}
