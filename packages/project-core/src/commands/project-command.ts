import { ProjectCommandError } from '@/commands/project-command-error'
import { parseMidiSourceId, parseNoteId, type MidiSourceId, type NoteId } from '@/model/ids'
import { createMidiNoteRecord } from '@/model/midi-note'
import type { ModelRevision } from '@/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'
import {
  parseMidiPitch,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
} from '@/model/scalars'
import { parseTick, type Tick } from '@/time/tick'

/** Canonical runtime discriminants for product-level project commands. */
export const PROJECT_COMMAND_TYPE = {
  MIDI_NOTE: {
    ADD: 'midi-note.add',
    MOVE: 'midi-note.move',
    REMOVE: 'midi-note.remove',
  },
} as const

type ProjectCommandTypeGroup = ValueOf<typeof PROJECT_COMMAND_TYPE>

export type ProjectCommandType = ValueOf<ProjectCommandTypeGroup>

interface ProjectCommandBase<Type extends ProjectCommandType> {
  readonly type: Type
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}

export interface AddNoteCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD
> {
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface MoveNoteCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE
> {
  readonly nextStartTick: Tick
  readonly nextPitch: MidiPitch
}

export type RemoveNoteCommand = ProjectCommandBase<typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE>

export type ProjectCommand = AddNoteCommand | MoveNoteCommand | RemoveNoteCommand

interface CreateNoteCommandInputBase {
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}

export interface CreateAddNoteCommandInput extends CreateNoteCommandInputBase {
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface CreateMoveNoteCommandInput extends CreateNoteCommandInputBase {
  readonly nextStartTick: Tick
  readonly nextPitch: MidiPitch
}

export type CreateRemoveNoteCommandInput = CreateNoteCommandInputBase

function parseCommandBaseRevision(value: ModelRevision): ModelRevision {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProjectCommandError(
      'invalid-base-revision',
      'ProjectCommand.baseRevision must be a non-negative safe integer',
      { baseRevision: value },
    )
  }

  return value
}

export function createAddNoteCommand(input: CreateAddNoteCommandInput): AddNoteCommand {
  const note = createMidiNoteRecord({
    id: input.noteId,
    startTick: input.startTick,
    durationTick: input.durationTick,
    pitch: input.pitch,
    velocity: input.velocity,
    channel: input.channel,
  })

  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteId: note.id,
    startTick: note.startTick,
    durationTick: note.durationTick,
    pitch: note.pitch,
    velocity: note.velocity,
    channel: note.channel,
  }
}

export function createMoveNoteCommand(input: CreateMoveNoteCommandInput): MoveNoteCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteId: parseNoteId(input.noteId),
    nextStartTick: parseTick(input.nextStartTick),
    nextPitch: parseMidiPitch(input.nextPitch),
  }
}

export function createRemoveNoteCommand(input: CreateRemoveNoteCommandInput): RemoveNoteCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteId: parseNoteId(input.noteId),
  }
}

function rejectUnknownCommand(command: never): never {
  const type = (command as { readonly type?: unknown }).type

  throw new ProjectCommandError(
    'unknown-command-type',
    `ProjectCommand has an unknown type: ${String(type)}`,
    { commandType: String(type) },
  )
}

/** @internal Revalidates structurally supplied commands before they read model state. */
export function normalizeProjectCommand(command: ProjectCommand): ProjectCommand {
  switch (command.type) {
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
      return createAddNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
      return createMoveNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return createRemoveNoteCommand(command)
    default:
      return rejectUnknownCommand(command)
  }
}
