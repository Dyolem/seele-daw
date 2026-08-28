import type { DeviceDescriptor } from '#internal/model/device'
import type {
  ClipId,
  DeviceId,
  MidiSourceId,
  MidiSustainPedalEventId,
  NoteId,
  TempoEventId,
  TrackId,
} from '#internal/model/ids'
import type { MidiClipRecord } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import type { InstrumentTrackRecord } from '#internal/model/track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { Tick } from '#internal/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

/** Canonical runtime discriminants for semantic project changes. */
export const PROJECT_CHANGE_TYPE = {
  INSTRUMENT_DEVICE: {
    UPDATED: 'instrument-device.updated',
  },
  INSTRUMENT_TRACK: {
    ADDED: 'instrument-track.added',
    REMOVED: 'instrument-track.removed',
  },
  MIDI_CLIP: {
    ADDED: 'midi-clip.added',
    REMOVED: 'midi-clip.removed',
    UPDATED: 'midi-clip.updated',
  },
  MIDI_NOTE: {
    ADDED: 'midi-note.added',
    REMOVED: 'midi-note.removed',
    UPDATED: 'midi-note.updated',
  },
  MIDI_SUSTAIN_PEDAL_EVENT: {
    ADDED: 'midi-sustain-pedal-event.added',
    REMOVED: 'midi-sustain-pedal-event.removed',
    UPDATED: 'midi-sustain-pedal-event.updated',
  },
  TEMPO_EVENT: {
    ADDED: 'tempo-event.added',
    REMOVED: 'tempo-event.removed',
    UPDATED: 'tempo-event.updated',
  },
} as const

type ProjectChangeTypeGroup = ValueOf<typeof PROJECT_CHANGE_TYPE>

export type ProjectChangeType = ValueOf<ProjectChangeTypeGroup>

/** A conservative half-open timeline interval affected by one semantic change. */
export interface AffectedTickRange {
  readonly startTick: Tick
  readonly endTick: Tick
}

/** Complete placement created or removed by one Instrument Track product intent. */
export interface InstrumentTrackPlacement {
  readonly track: InstrumentTrackRecord
  readonly instrumentDevice: DeviceDescriptor
  readonly index: number
}

export interface InstrumentDeviceUpdatedChange {
  readonly type: typeof PROJECT_CHANGE_TYPE.INSTRUMENT_DEVICE.UPDATED
  readonly trackId: TrackId
  readonly deviceId: DeviceId
  readonly before: DeviceDescriptor
  readonly after: DeviceDescriptor
}

interface InstrumentTrackChangeBase<Type extends ProjectChangeType> {
  readonly type: Type
  readonly trackId: TrackId
}

export interface InstrumentTrackAddedChange extends InstrumentTrackChangeBase<
  typeof PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.ADDED
> {
  readonly after: InstrumentTrackPlacement
}

export interface InstrumentTrackRemovedChange extends InstrumentTrackChangeBase<
  typeof PROJECT_CHANGE_TYPE.INSTRUMENT_TRACK.REMOVED
> {
  readonly before: InstrumentTrackPlacement
}

/** Complete ownership graph created or removed by one MIDI Clip product intent. */
export interface MidiClipPlacement {
  readonly clip: MidiClipRecord
  readonly source: MidiSourceRecord
  readonly notes: readonly MidiNoteRecord[]
  readonly sustainPedalEvents: readonly MidiSustainPedalEventRecord[]
}

interface MidiClipChangeBase<Type extends ProjectChangeType> {
  readonly type: Type
  readonly clipId: ClipId
  readonly sourceId: MidiSourceId
  readonly trackId: TrackId
  readonly affected: AffectedTickRange
}

export interface MidiClipAddedChange extends MidiClipChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_CLIP.ADDED
> {
  readonly after: MidiClipPlacement
}

export interface MidiClipRemovedChange extends MidiClipChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_CLIP.REMOVED
> {
  readonly before: MidiClipPlacement
}

export interface MidiClipSourceUpdate {
  readonly before: MidiSourceRecord
  readonly after: MidiSourceRecord
}

export interface MidiClipUpdatedChange extends MidiClipChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_CLIP.UPDATED
> {
  readonly before: MidiClipRecord
  readonly after: MidiClipRecord
  /** Null when the existing Source already covers the extended Clip window. */
  readonly sourceUpdate: MidiClipSourceUpdate | null
}

interface MidiNoteChangeBase<Type extends ProjectChangeType> {
  readonly type: Type
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
  readonly affected: AffectedTickRange
}

export interface MidiNoteAddedChange extends MidiNoteChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_NOTE.ADDED
> {
  readonly after: MidiNoteRecord
}

export interface MidiNoteRemovedChange extends MidiNoteChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_NOTE.REMOVED
> {
  readonly before: MidiNoteRecord
}

export interface MidiNoteUpdatedChange extends MidiNoteChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_NOTE.UPDATED
> {
  readonly before: MidiNoteRecord
  readonly after: MidiNoteRecord
}

interface MidiSustainPedalEventChangeBase<Type extends ProjectChangeType> {
  readonly type: Type
  readonly sourceId: MidiSourceId
  readonly sustainPedalEventId: MidiSustainPedalEventId
  /** CC64 changes can alter pedal state for every later event on the same channel. */
  readonly affectedFromTick: Tick
}

export interface MidiSustainPedalEventAddedChange extends MidiSustainPedalEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADDED
> {
  readonly after: MidiSustainPedalEventRecord
}

export interface MidiSustainPedalEventRemovedChange extends MidiSustainPedalEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVED
> {
  readonly before: MidiSustainPedalEventRecord
}

export interface MidiSustainPedalEventUpdatedChange extends MidiSustainPedalEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.UPDATED
> {
  readonly before: MidiSustainPedalEventRecord
  readonly after: MidiSustainPedalEventRecord
}

interface TempoEventChangeBase<Type extends ProjectChangeType> {
  readonly type: Type
  readonly tempoEventId: TempoEventId
}

export interface TempoEventAddedChange extends TempoEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.TEMPO_EVENT.ADDED
> {
  readonly after: TempoEventRecord
}

export interface TempoEventRemovedChange extends TempoEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.TEMPO_EVENT.REMOVED
> {
  readonly before: TempoEventRecord
}

export interface TempoEventUpdatedChange extends TempoEventChangeBase<
  typeof PROJECT_CHANGE_TYPE.TEMPO_EVENT.UPDATED
> {
  readonly before: TempoEventRecord
  readonly after: TempoEventRecord
}

export type ProjectChange =
  | InstrumentDeviceUpdatedChange
  | InstrumentTrackAddedChange
  | InstrumentTrackRemovedChange
  | MidiClipAddedChange
  | MidiClipRemovedChange
  | MidiClipUpdatedChange
  | MidiNoteAddedChange
  | MidiNoteRemovedChange
  | MidiNoteUpdatedChange
  | MidiSustainPedalEventAddedChange
  | MidiSustainPedalEventRemovedChange
  | MidiSustainPedalEventUpdatedChange
  | TempoEventAddedChange
  | TempoEventRemovedChange
  | TempoEventUpdatedChange
