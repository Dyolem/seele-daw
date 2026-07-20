import type { MidiSourceId, NoteId } from '@/model/ids'
import type { MidiNoteRecord } from '@/model/midi-note'
import type { Tick } from '@/time/tick'
import type { ValueOf } from '@seele-daw/type-utils'

/** Canonical runtime discriminants for semantic project changes. */
export const PROJECT_CHANGE_TYPE = {
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

export type ProjectChange = MidiNoteAddedChange | MidiNoteRemovedChange | MidiNoteUpdatedChange
