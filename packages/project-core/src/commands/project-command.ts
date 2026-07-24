import { ProjectCommandError } from '#internal/commands/project-command-error'
import {
  parseMidiSourceId,
  parseNoteId,
  type MidiSourceId,
  type NoteId,
  type TrackId,
} from '#internal/model/ids'
import {
  createDeviceDescriptor,
  type CreateDeviceDescriptorInput,
  type DeviceDescriptor,
} from '#internal/model/device'
import { createMidiNoteRecord } from '#internal/model/midi-note'
import { ModelRevisionError, parseModelRevision, type ModelRevision } from '#internal/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'
import {
  parseMidiPitch,
  type ProjectColor,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
} from '#internal/model/scalars'
import {
  createInstrumentTrackRecord,
  type InstrumentTrackRecord,
} from '#internal/model/track'
import type { CreateChannelStripDescriptorInput } from '#internal/model/channel'
import { parseTick, type Tick } from '#internal/time/tick'

/** Canonical runtime discriminants for product-level project commands. */
export const PROJECT_COMMAND_TYPE = {
  INSTRUMENT_TRACK: {
    ADD: 'instrument-track.add',
  },
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
}

interface MidiNoteCommandBase<Type extends ProjectCommandType>
  extends ProjectCommandBase<Type> {
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}

export interface AddInstrumentTrackCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD
> {
  readonly track: InstrumentTrackRecord
  readonly instrumentDevice: DeviceDescriptor
  readonly insertAt: number
}

export interface AddNoteCommand extends MidiNoteCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD
> {
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface MoveNoteCommand extends MidiNoteCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE
> {
  readonly nextStartTick: Tick
  readonly nextPitch: MidiPitch
}

export type RemoveNoteCommand = MidiNoteCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE
>

export type ProjectCommand =
  | AddInstrumentTrackCommand
  | AddNoteCommand
  | MoveNoteCommand
  | RemoveNoteCommand

export interface CreateAddInstrumentTrackCommandInput {
  readonly baseRevision: ModelRevision
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: CreateChannelStripDescriptorInput
  readonly instrumentDevice: CreateDeviceDescriptorInput
  readonly insertAt: number
}

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
  try {
    return parseModelRevision(value)
  } catch (cause) {
    if (!(cause instanceof ModelRevisionError)) throw cause

    throw new ProjectCommandError(
      'invalid-base-revision',
      'ProjectCommand.baseRevision must be a non-negative safe integer',
      { baseRevision: value },
    )
  }
}

function parseTrackOrderIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProjectCommandError(
      'invalid-track-order-index',
      'AddInstrumentTrackCommand.insertAt must be a non-negative safe integer',
      { insertAt: value },
    )
  }

  return value
}

export function createAddInstrumentTrackCommand(
  input: CreateAddInstrumentTrackCommandInput,
): AddInstrumentTrackCommand {
  const instrumentDevice = createDeviceDescriptor(input.instrumentDevice)
  const track = createInstrumentTrackRecord({
    id: input.trackId,
    name: input.name,
    color: input.color,
    channel: input.channel,
    midiEffectIds: [],
    instrumentDeviceId: instrumentDevice.id,
    audioEffectIds: [],
  })

  return {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    track,
    instrumentDevice,
    insertAt: parseTrackOrderIndex(input.insertAt),
  }
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
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD:
      return createAddInstrumentTrackCommand({
        baseRevision: command.baseRevision,
        trackId: command.track.id,
        name: command.track.name,
        color: command.track.color,
        channel: command.track.channel,
        instrumentDevice: command.instrumentDevice,
        insertAt: command.insertAt,
      })
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
