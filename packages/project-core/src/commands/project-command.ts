import { ProjectCommandError } from '#internal/commands/project-command-error'
import {
  parseClipId,
  parseMidiSourceId,
  parseNoteId,
  type ClipId,
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
import {
  ModelRevisionError,
  parseModelRevision,
  type ModelRevision,
} from '#internal/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'
import {
  parseMidiPitch,
  type ProjectColor,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
} from '#internal/model/scalars'
import { createInstrumentTrackRecord, type InstrumentTrackRecord } from '#internal/model/track'
import {
  createMidiClipRecord,
  type CreateMidiLoopInput,
  type MidiClipRecord,
} from '#internal/model/midi-clip'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { CreateChannelStripDescriptorInput } from '#internal/model/channel'
import { parseTick, type Tick } from '#internal/time/tick'

/** Canonical runtime discriminants for product-level project commands. */
export const PROJECT_COMMAND_TYPE = {
  INSTRUMENT_TRACK: {
    ADD: 'instrument-track.add',
  },
  MIDI_CLIP: {
    ADD: 'midi-clip.add',
  },
  MIDI_NOTE: {
    ADD: 'midi-note.add',
    MOVE: 'midi-note.move',
    REMOVE: 'midi-note.remove',
    REMOVE_MANY: 'midi-note.remove-many',
  },
} as const

type ProjectCommandTypeGroup = ValueOf<typeof PROJECT_COMMAND_TYPE>

export type ProjectCommandType = ValueOf<ProjectCommandTypeGroup>

interface ProjectCommandBase<Type extends ProjectCommandType> {
  readonly type: Type
  readonly baseRevision: ModelRevision
}

interface MidiNoteCommandBase<Type extends ProjectCommandType> extends ProjectCommandBase<Type> {
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

export interface AddMidiClipCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD
> {
  readonly clip: MidiClipRecord
  readonly source: MidiSourceRecord
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

export type RemoveNoteCommand = MidiNoteCommandBase<typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE>

export interface RemoveNotesCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE_MANY
> {
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}

export type ProjectCommand =
  | AddInstrumentTrackCommand
  | AddMidiClipCommand
  | AddNoteCommand
  | MoveNoteCommand
  | RemoveNoteCommand
  | RemoveNotesCommand

export interface CreateAddInstrumentTrackCommandInput {
  readonly baseRevision: ModelRevision
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: CreateChannelStripDescriptorInput
  readonly instrumentDevice: CreateDeviceDescriptorInput
  readonly insertAt: number
}

export interface CreateAddMidiClipCommandInput {
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly startTick: Tick
  readonly spanTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceLengthTick: Tick
  readonly sourceOffsetTick: Tick
  readonly loop: CreateMidiLoopInput | null
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

export interface CreateRemoveNotesCommandInput {
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}

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

export function createAddMidiClipCommand(input: CreateAddMidiClipCommandInput): AddMidiClipCommand {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId(input.sourceId),
    lengthTick: input.sourceLengthTick,
  })
  const clip = createMidiClipRecord({
    id: parseClipId(input.clipId),
    trackId: input.trackId,
    name: input.name,
    color: input.color,
    muted: input.muted,
    startTick: input.startTick,
    spanTick: input.spanTick,
    sourceId: source.id,
    sourceOffsetTick: input.sourceOffsetTick,
    loop: input.loop,
  })

  return {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    clip,
    source,
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

function parseDistinctNoteIds(noteIds: readonly NoteId[]): readonly NoteId[] {
  if (noteIds.length === 0) {
    throw new ProjectCommandError(
      'empty-note-id-list',
      'RemoveNotesCommand.noteIds must contain at least one MIDI Note ID',
    )
  }

  const parsedNoteIds = noteIds.map(parseNoteId)
  const uniqueNoteIds = new Set<NoteId>()
  for (const noteId of parsedNoteIds) {
    if (uniqueNoteIds.has(noteId)) {
      throw new ProjectCommandError(
        'duplicate-note-id',
        `RemoveNotesCommand.noteIds contains duplicate MIDI Note ID ${noteId}`,
        { noteId },
      )
    }
    uniqueNoteIds.add(noteId)
  }

  return Object.freeze(parsedNoteIds)
}

export function createRemoveNotesCommand(
  input: CreateRemoveNotesCommandInput,
): RemoveNotesCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE_MANY,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteIds: parseDistinctNoteIds(input.noteIds),
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
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD:
      return createAddMidiClipCommand({
        baseRevision: command.baseRevision,
        clipId: command.clip.id,
        trackId: command.clip.trackId,
        name: command.clip.name,
        color: command.clip.color,
        muted: command.clip.muted,
        startTick: command.clip.startTick,
        spanTick: command.clip.spanTick,
        sourceId: command.source.id,
        sourceLengthTick: command.source.lengthTick,
        sourceOffsetTick: command.clip.sourceOffsetTick,
        loop: command.clip.loop,
      })
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
      return createAddNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
      return createMoveNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return createRemoveNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE_MANY:
      return createRemoveNotesCommand(command)
    default:
      return rejectUnknownCommand(command)
  }
}
