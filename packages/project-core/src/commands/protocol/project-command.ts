import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import {
  parseClipId,
  parseMidiSourceId,
  parseNoteId,
  parseTempoEventId,
  parseTrackId,
  type ClipId,
  type MidiSourceId,
  type NoteId,
  type TempoEventId,
  type TrackId,
} from '#internal/model/ids'
import {
  createDeviceDescriptor,
  type CreateDeviceDescriptorInput,
  type DeviceDescriptor,
} from '#internal/model/device'
import { createMidiNoteRecord, type MidiNoteRecord } from '#internal/model/midi-note'
import {
  ModelRevisionError,
  parseModelRevision,
  type ModelRevision,
} from '#internal/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'
import {
  type ProjectColor,
  type MidiChannel,
  type MidiPitch,
  type MidiPitchDelta,
  type MidiVelocity,
  parseMidiPitchDelta,
} from '#internal/model/scalars'
import { createInstrumentTrackRecord, type InstrumentTrackRecord } from '#internal/model/track'
import {
  createMidiClipRecord,
  type CreateMidiLoopInput,
  type MidiClipRecord,
} from '#internal/model/midi-clip'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { CreateChannelStripDescriptorInput } from '#internal/model/channel'
import {
  addTicks,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
  type Tick,
  type TickDelta,
} from '#internal/time/tick'
import { parseTempoBpm, type TempoBpm } from '#internal/time/tempo-event'

/** Canonical runtime discriminants for product-level project commands. */
export const PROJECT_COMMAND_TYPE = {
  INSTRUMENT_DEVICE: {
    REPLACE: 'instrument-device.replace',
  },
  INSTRUMENT_TRACK: {
    ADD: 'instrument-track.add',
    ADD_COLLECTION: 'instrument-track.add-collection',
  },
  MIDI_CLIP: {
    ADD: 'midi-clip.add',
    ADD_WITH_NOTE: 'midi-clip.add-with-note',
    EXTEND_WITH_NOTE: 'midi-clip.extend-with-note',
  },
  MIDI_NOTE: {
    ADD: 'midi-note.add',
    MOVE: 'midi-note.move',
    REMOVE: 'midi-note.remove',
    RESIZE: 'midi-note.resize',
  },
  TEMPO_EVENT: {
    REPLACE_BPM: 'tempo-event.replace-bpm',
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

interface MidiNoteCollectionCommandBase<
  Type extends ProjectCommandType,
> extends ProjectCommandBase<Type> {
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}

export interface ReplaceTempoEventBpmCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM
> {
  readonly tempoEventId: TempoEventId
  readonly bpm: TempoBpm
}

export interface AddInstrumentTrackCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD
> {
  readonly track: InstrumentTrackRecord
  readonly instrumentDevice: DeviceDescriptor
  readonly insertAt: number
}

/** One owned MIDI Clip graph carried by an atomic Instrument Track collection command. */
export interface InstrumentTrackCollectionClip {
  readonly clip: MidiClipRecord
  readonly source: MidiSourceRecord
  readonly notes: readonly MidiNoteRecord[]
}

/** One complete Instrument Track graph, including every newly owned MIDI Clip. */
export interface InstrumentTrackCollectionEntry {
  readonly track: InstrumentTrackRecord
  readonly instrumentDevice: DeviceDescriptor
  readonly clips: readonly InstrumentTrackCollectionClip[]
}

export interface AddInstrumentTrackCollectionCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION
> {
  readonly entries: readonly InstrumentTrackCollectionEntry[]
  readonly insertAt: number
}

export interface ReplaceInstrumentDeviceCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE
> {
  readonly trackId: TrackId
  readonly instrumentDevice: DeviceDescriptor
}

export interface AddMidiClipCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD
> {
  readonly clip: MidiClipRecord
  readonly source: MidiSourceRecord
}

export interface AddMidiClipWithNoteCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE
> {
  readonly clip: MidiClipRecord
  readonly source: MidiSourceRecord
  readonly note: MidiNoteRecord
}

export interface ExtendMidiClipWithNoteCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE
> {
  readonly clipId: ClipId
  /** Final non-looped Clip span after the right-edge extension. */
  readonly spanTick: Tick
  readonly note: MidiNoteRecord
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

export interface MoveNotesCommand extends MidiNoteCollectionCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE
> {
  readonly deltaTick: TickDelta
  readonly deltaPitch: MidiPitchDelta
}

export type RemoveNotesCommand = MidiNoteCollectionCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE
>

export interface ResizeNoteCommand extends MidiNoteCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE
> {
  readonly startTick: Tick
  readonly durationTick: Tick
}

export type ProjectCommand =
  | AddInstrumentTrackCommand
  | AddInstrumentTrackCollectionCommand
  | ReplaceInstrumentDeviceCommand
  | AddMidiClipCommand
  | AddMidiClipWithNoteCommand
  | ExtendMidiClipWithNoteCommand
  | AddNoteCommand
  | MoveNotesCommand
  | RemoveNotesCommand
  | ResizeNoteCommand
  | ReplaceTempoEventBpmCommand

export interface CreateReplaceTempoEventBpmCommandInput {
  readonly baseRevision: ModelRevision
  readonly tempoEventId: TempoEventId
  readonly bpm: TempoBpm
}

export interface CreateAddInstrumentTrackCommandInput {
  readonly baseRevision: ModelRevision
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly channel: CreateChannelStripDescriptorInput
  readonly instrumentDevice: CreateDeviceDescriptorInput
  readonly insertAt: number
}

export interface CreateAddInstrumentTrackCollectionCommandInput {
  readonly baseRevision: ModelRevision
  readonly entries: readonly InstrumentTrackCollectionEntry[]
  readonly insertAt: number
}

export interface CreateReplaceInstrumentDeviceCommandInput {
  readonly baseRevision: ModelRevision
  readonly trackId: TrackId
  readonly instrumentDevice: CreateDeviceDescriptorInput
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

export interface CreateAddMidiClipWithNoteCommandInput extends CreateAddMidiClipCommandInput {
  readonly loop: null
  readonly noteId: NoteId
  readonly noteStartTick: Tick
  readonly noteDurationTick: Tick
  readonly notePitch: MidiPitch
  readonly noteVelocity: MidiVelocity
  readonly noteChannel: MidiChannel
}

export interface CreateExtendMidiClipWithNoteCommandInput {
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
  /** Final non-looped Clip span after the right-edge extension. */
  readonly spanTick: Tick
  readonly noteId: NoteId
  readonly noteStartTick: Tick
  readonly noteDurationTick: Tick
  readonly notePitch: MidiPitch
  readonly noteVelocity: MidiVelocity
  readonly noteChannel: MidiChannel
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

interface CreateNoteCollectionCommandInputBase {
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly noteIds: readonly NoteId[]
}

export interface CreateMoveNotesCommandInput extends CreateNoteCollectionCommandInputBase {
  readonly deltaTick: TickDelta
  readonly deltaPitch: MidiPitchDelta
}

export type CreateRemoveNotesCommandInput = CreateNoteCollectionCommandInputBase

export interface CreateResizeNoteCommandInput extends CreateNoteCommandInputBase {
  readonly startTick: Tick
  readonly durationTick: Tick
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
      'Instrument Track command insertAt must be a non-negative safe integer',
      { insertAt: value },
    )
  }

  return value
}

export function createReplaceTempoEventBpmCommand(
  input: CreateReplaceTempoEventBpmCommandInput,
): ReplaceTempoEventBpmCommand {
  return {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    tempoEventId: parseTempoEventId(input.tempoEventId),
    bpm: parseTempoBpm(input.bpm),
  }
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

function normalizeInstrumentTrackCollectionClip(
  input: InstrumentTrackCollectionClip,
): InstrumentTrackCollectionClip {
  return Object.freeze({
    clip: createMidiClipRecord(input.clip),
    source: createMidiSourceRecord(input.source),
    notes: Object.freeze(input.notes.map((note) => createMidiNoteRecord(note))),
  })
}

function normalizeInstrumentTrackCollectionEntry(
  input: InstrumentTrackCollectionEntry,
): InstrumentTrackCollectionEntry {
  return Object.freeze({
    track: createInstrumentTrackRecord(input.track),
    instrumentDevice: createDeviceDescriptor(input.instrumentDevice),
    clips: Object.freeze(input.clips.map(normalizeInstrumentTrackCollectionClip)),
  })
}

export function createAddInstrumentTrackCollectionCommand(
  input: CreateAddInstrumentTrackCollectionCommandInput,
): AddInstrumentTrackCollectionCommand {
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new ProjectCommandError(
      'empty-instrument-track-collection',
      'AddInstrumentTrackCollectionCommand.entries must contain at least one Track graph',
      { baseRevision: input.baseRevision },
    )
  }

  return {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    entries: Object.freeze(input.entries.map(normalizeInstrumentTrackCollectionEntry)),
    insertAt: parseTrackOrderIndex(input.insertAt),
  }
}

export function createReplaceInstrumentDeviceCommand(
  input: CreateReplaceInstrumentDeviceCommandInput,
): ReplaceInstrumentDeviceCommand {
  return {
    type: PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    trackId: parseTrackId(input.trackId),
    instrumentDevice: createDeviceDescriptor(input.instrumentDevice),
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

function createPlacementNote(
  input: Pick<
    CreateAddMidiClipWithNoteCommandInput,
    'noteId' | 'noteStartTick' | 'noteDurationTick' | 'notePitch' | 'noteVelocity' | 'noteChannel'
  >,
): MidiNoteRecord {
  return createMidiNoteRecord({
    id: input.noteId,
    startTick: input.noteStartTick,
    durationTick: input.noteDurationTick,
    pitch: input.notePitch,
    velocity: input.noteVelocity,
    channel: input.noteChannel,
  })
}

export function createAddMidiClipWithNoteCommand(
  input: CreateAddMidiClipWithNoteCommandInput,
): AddMidiClipWithNoteCommand {
  if (input.loop !== null) {
    throw new ProjectCommandError(
      'looped-midi-clip-unsupported',
      'AddMidiClipWithNoteCommand only creates a non-looped MIDI Clip',
      {
        baseRevision: input.baseRevision,
        clipId: input.clipId,
        commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
        noteId: input.noteId,
        sourceId: input.sourceId,
        trackId: input.trackId,
      },
    )
  }

  const clipCommand = createAddMidiClipCommand(input)

  return {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE,
    baseRevision: clipCommand.baseRevision,
    clip: clipCommand.clip,
    source: clipCommand.source,
    note: createPlacementNote(input),
  }
}

export function createExtendMidiClipWithNoteCommand(
  input: CreateExtendMidiClipWithNoteCommandInput,
): ExtendMidiClipWithNoteCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    clipId: parseClipId(input.clipId),
    spanTick: parsePositiveTick(input.spanTick),
    note: createPlacementNote(input),
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

function parseDistinctNoteIds(
  noteIds: readonly NoteId[],
  commandName: 'MoveNotesCommand' | 'RemoveNotesCommand',
): readonly NoteId[] {
  if (noteIds.length === 0) {
    throw new ProjectCommandError(
      'empty-note-id-list',
      `${commandName}.noteIds must contain at least one MIDI Note ID`,
    )
  }

  const parsedNoteIds = noteIds.map(parseNoteId)
  const uniqueNoteIds = new Set<NoteId>()
  for (const noteId of parsedNoteIds) {
    if (uniqueNoteIds.has(noteId)) {
      throw new ProjectCommandError(
        'duplicate-note-id',
        `${commandName}.noteIds contains duplicate MIDI Note ID ${noteId}`,
        { noteId },
      )
    }
    uniqueNoteIds.add(noteId)
  }

  return Object.freeze(parsedNoteIds)
}

export function createMoveNotesCommand(input: CreateMoveNotesCommandInput): MoveNotesCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteIds: parseDistinctNoteIds(input.noteIds, 'MoveNotesCommand'),
    deltaTick: parseTickDelta(input.deltaTick),
    deltaPitch: parseMidiPitchDelta(input.deltaPitch),
  }
}

export function createRemoveNotesCommand(input: CreateRemoveNotesCommandInput): RemoveNotesCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteIds: parseDistinctNoteIds(input.noteIds, 'RemoveNotesCommand'),
  }
}

export function createResizeNoteCommand(input: CreateResizeNoteCommandInput): ResizeNoteCommand {
  const startTick = parseTick(input.startTick)
  const durationTick = parsePositiveTick(input.durationTick)
  addTicks(startTick, durationTick)

  return {
    type: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    noteId: parseNoteId(input.noteId),
    startTick,
    durationTick,
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
    case PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM:
      return createReplaceTempoEventBpmCommand(command)
    case PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE:
      return createReplaceInstrumentDeviceCommand(command)
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
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION:
      return createAddInstrumentTrackCollectionCommand({
        baseRevision: command.baseRevision,
        entries: command.entries,
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
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE: {
      if (command.clip.loop !== null) {
        throw new ProjectCommandError(
          'looped-midi-clip-unsupported',
          `AddMidiClipWithNoteCommand cannot normalize looped MIDI Clip ${command.clip.id}`,
          {
            baseRevision: command.baseRevision,
            clipId: command.clip.id,
            commandType: command.type,
            noteId: command.note.id,
            sourceId: command.source.id,
            trackId: command.clip.trackId,
          },
        )
      }

      return createAddMidiClipWithNoteCommand({
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
        noteId: command.note.id,
        noteStartTick: command.note.startTick,
        noteDurationTick: command.note.durationTick,
        notePitch: command.note.pitch,
        noteVelocity: command.note.velocity,
        noteChannel: command.note.channel,
      })
    }
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE:
      return createExtendMidiClipWithNoteCommand({
        baseRevision: command.baseRevision,
        clipId: command.clipId,
        spanTick: command.spanTick,
        noteId: command.note.id,
        noteStartTick: command.note.startTick,
        noteDurationTick: command.note.durationTick,
        notePitch: command.note.pitch,
        noteVelocity: command.note.velocity,
        noteChannel: command.note.channel,
      })
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
      return createAddNoteCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
      return createMoveNotesCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return createRemoveNotesCommand(command)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE:
      return createResizeNoteCommand(command)
    default:
      return rejectUnknownCommand(command)
  }
}
