import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import {
  parseClipId,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseNoteId,
  parseTempoEventId,
  parseTrackId,
  type ClipId,
  type MidiSourceId,
  type MidiSustainPedalEventId,
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
  createMidiSustainPedalEventRecord,
  type MidiSustainPedalEventRecord,
} from '#internal/model/midi-sustain-pedal-event'
import { DomainValueError } from '#internal/model/domain-value-error'
import { parseModelRevision, type ModelRevision } from '#internal/model/model-revision'
import type { ValueOf } from '@seele-daw/type-utils'
import {
  type ProjectColor,
  type MidiChannel,
  type MidiControlValue,
  type MidiPitch,
  type MidiPitchDelta,
  type MidiVelocity,
  parseMidiControlValue,
  parseMidiPitchDelta,
} from '#internal/model/scalars'
import { createInstrumentTrackRecord, type InstrumentTrackRecord } from '#internal/model/track'
import { createMidiClipRecord, type MidiClipRecord } from '#internal/model/midi-clip'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { CreateChannelStripDescriptorInput } from '#internal/model/channel'
import {
  addTicks,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
  type Tick,
  type TickDelta,
} from '#internal/model/tick'
import {
  createTempoEventRecord,
  parseTempoBpm,
  type TempoBpm,
  type TempoEventRecord,
} from '#internal/model/tempo-event'

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
  MIDI_SUSTAIN_PEDAL_EVENT: {
    ADD: 'midi-sustain-pedal-event.add',
    MOVE: 'midi-sustain-pedal-event.move',
    REMOVE: 'midi-sustain-pedal-event.remove',
    REPLACE_VALUE: 'midi-sustain-pedal-event.replace-value',
  },
  TEMPO_EVENT: {
    ADD: 'tempo-event.add',
    MOVE: 'tempo-event.move',
    REMOVE: 'tempo-event.remove',
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

interface MidiSustainPedalEventCommandBase<
  Type extends ProjectCommandType,
> extends ProjectCommandBase<Type> {
  readonly sourceId: MidiSourceId
  readonly eventId: MidiSustainPedalEventId
}

interface MidiSustainPedalEventCollectionCommandBase<
  Type extends ProjectCommandType,
> extends ProjectCommandBase<Type> {
  readonly sourceId: MidiSourceId
  readonly eventIds: readonly MidiSustainPedalEventId[]
}

export interface ReplaceTempoEventBpmCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM
> {
  readonly tempoEventId: TempoEventId
  readonly bpm: TempoBpm
}

export interface AddTempoEventCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD
> {
  readonly tempoEvent: TempoEventRecord
}

export interface MoveTempoEventCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE
> {
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
}

export interface RemoveTempoEventCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE
> {
  readonly tempoEventId: TempoEventId
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
  readonly sustainPedalEvents: readonly MidiSustainPedalEventRecord[]
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
  /** Final Clip span after the right-edge extension. */
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

export interface AddMidiSustainPedalEventCommand extends ProjectCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD
> {
  readonly sourceId: MidiSourceId
  readonly event: MidiSustainPedalEventRecord
}

export interface MoveMidiSustainPedalEventsCommand extends MidiSustainPedalEventCollectionCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE
> {
  readonly deltaTick: TickDelta
}

export type RemoveMidiSustainPedalEventsCommand = MidiSustainPedalEventCollectionCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE
>

export interface ReplaceMidiSustainPedalEventValueCommand extends MidiSustainPedalEventCommandBase<
  typeof PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE
> {
  readonly value: MidiControlValue
}

export type ProjectCommand =
  | AddTempoEventCommand
  | MoveTempoEventCommand
  | RemoveTempoEventCommand
  | ReplaceTempoEventBpmCommand
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
  | AddMidiSustainPedalEventCommand
  | MoveMidiSustainPedalEventsCommand
  | RemoveMidiSustainPedalEventsCommand
  | ReplaceMidiSustainPedalEventValueCommand

export interface CreateAddTempoEventCommandInput {
  readonly baseRevision: ModelRevision
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
  readonly bpm: TempoBpm
}

export interface CreateMoveTempoEventCommandInput {
  readonly baseRevision: ModelRevision
  readonly tempoEventId: TempoEventId
  readonly tick: Tick
}

export interface CreateRemoveTempoEventCommandInput {
  readonly baseRevision: ModelRevision
  readonly tempoEventId: TempoEventId
}

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
}

export interface CreateAddMidiClipWithNoteCommandInput extends CreateAddMidiClipCommandInput {
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
  /** Final Clip span after the right-edge extension. */
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

interface CreateMidiSustainPedalEventCommandInputBase {
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly eventId: MidiSustainPedalEventId
}

export interface CreateAddMidiSustainPedalEventCommandInput extends CreateMidiSustainPedalEventCommandInputBase {
  readonly tick: Tick
  readonly value: MidiControlValue
  readonly channel: MidiChannel
}

interface CreateMidiSustainPedalEventCollectionCommandInputBase {
  readonly baseRevision: ModelRevision
  readonly sourceId: MidiSourceId
  readonly eventIds: readonly MidiSustainPedalEventId[]
}

export interface CreateMoveMidiSustainPedalEventsCommandInput extends CreateMidiSustainPedalEventCollectionCommandInputBase {
  readonly deltaTick: TickDelta
}

export type CreateRemoveMidiSustainPedalEventsCommandInput =
  CreateMidiSustainPedalEventCollectionCommandInputBase

export interface CreateReplaceMidiSustainPedalEventValueCommandInput extends CreateMidiSustainPedalEventCommandInputBase {
  readonly value: MidiControlValue
}

function parseCommandBaseRevision(value: ModelRevision): ModelRevision {
  try {
    return parseModelRevision(value)
  } catch (cause) {
    if (!(cause instanceof DomainValueError)) throw cause

    throw new ProjectCommandError(
      'invalid-base-revision',
      'ProjectCommand.baseRevision must be a non-negative safe integer',
    )
  }
}

function parseTrackOrderIndex(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ProjectCommandError(
      'invalid-track-order-index',
      'Instrument Track command insertAt must be a non-negative safe integer',
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

export function createAddTempoEventCommand(
  input: CreateAddTempoEventCommandInput,
): AddTempoEventCommand {
  return {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    tempoEvent: createTempoEventRecord({
      id: input.tempoEventId,
      tick: input.tick,
      bpm: input.bpm,
    }),
  }
}

export function createMoveTempoEventCommand(
  input: CreateMoveTempoEventCommandInput,
): MoveTempoEventCommand {
  return {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    tempoEventId: parseTempoEventId(input.tempoEventId),
    tick: parseTick(input.tick),
  }
}

export function createRemoveTempoEventCommand(
  input: CreateRemoveTempoEventCommandInput,
): RemoveTempoEventCommand {
  return {
    type: PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    tempoEventId: parseTempoEventId(input.tempoEventId),
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
    instrumentDeviceId: instrumentDevice.id,
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
    sustainPedalEvents: Object.freeze(
      input.sustainPedalEvents.map((event) => createMidiSustainPedalEventRecord(event)),
    ),
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

export function createAddMidiSustainPedalEventCommand(
  input: CreateAddMidiSustainPedalEventCommandInput,
): AddMidiSustainPedalEventCommand {
  const event = createMidiSustainPedalEventRecord({
    id: input.eventId,
    tick: input.tick,
    value: input.value,
    channel: input.channel,
  })

  return {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    event,
  }
}

function parseDistinctMidiSustainPedalEventIds(
  eventIds: readonly MidiSustainPedalEventId[],
  commandName: 'MoveMidiSustainPedalEventsCommand' | 'RemoveMidiSustainPedalEventsCommand',
): readonly MidiSustainPedalEventId[] {
  if (eventIds.length === 0) {
    throw new ProjectCommandError(
      'empty-sustain-pedal-event-id-list',
      `${commandName}.eventIds must contain at least one MIDI Sustain Pedal Event ID`,
    )
  }

  const parsedEventIds = eventIds.map(parseMidiSustainPedalEventId)
  const uniqueEventIds = new Set<MidiSustainPedalEventId>()

  for (const eventId of parsedEventIds) {
    if (uniqueEventIds.has(eventId)) {
      throw new ProjectCommandError(
        'duplicate-sustain-pedal-event-id',
        `${commandName}.eventIds contains duplicate MIDI Sustain Pedal Event ID ${eventId}`,
      )
    }
    uniqueEventIds.add(eventId)
  }

  return Object.freeze(parsedEventIds)
}

export function createMoveMidiSustainPedalEventsCommand(
  input: CreateMoveMidiSustainPedalEventsCommandInput,
): MoveMidiSustainPedalEventsCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    eventIds: parseDistinctMidiSustainPedalEventIds(
      input.eventIds,
      'MoveMidiSustainPedalEventsCommand',
    ),
    deltaTick: parseTickDelta(input.deltaTick),
  }
}

export function createRemoveMidiSustainPedalEventsCommand(
  input: CreateRemoveMidiSustainPedalEventsCommandInput,
): RemoveMidiSustainPedalEventsCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    eventIds: parseDistinctMidiSustainPedalEventIds(
      input.eventIds,
      'RemoveMidiSustainPedalEventsCommand',
    ),
  }
}

export function createReplaceMidiSustainPedalEventValueCommand(
  input: CreateReplaceMidiSustainPedalEventValueCommandInput,
): ReplaceMidiSustainPedalEventValueCommand {
  return {
    type: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE,
    baseRevision: parseCommandBaseRevision(input.baseRevision),
    sourceId: parseMidiSourceId(input.sourceId),
    eventId: parseMidiSustainPedalEventId(input.eventId),
    value: parseMidiControlValue(input.value),
  }
}
