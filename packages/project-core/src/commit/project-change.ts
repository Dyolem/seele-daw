import type { DeviceDescriptor } from '#internal/model/device'
import type { MidiSourceId, NoteId, TrackId } from '#internal/model/ids'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { InstrumentTrackRecord } from '#internal/model/track'
import type { Tick } from '#internal/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

/** Canonical runtime discriminants for semantic project changes. */
export const PROJECT_CHANGE_TYPE = {
  INSTRUMENT_TRACK: {
    ADDED: 'instrument-track.added',
    REMOVED: 'instrument-track.removed',
  },
  MIDI_NOTE: {
    ADDED: 'midi-note.added',
    REMOVED: 'midi-note.removed',
    UPDATED: 'midi-note.updated',
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

export type ProjectChange =
  | InstrumentTrackAddedChange
  | InstrumentTrackRemovedChange
  | MidiNoteAddedChange
  | MidiNoteRemovedChange
  | MidiNoteUpdatedChange
