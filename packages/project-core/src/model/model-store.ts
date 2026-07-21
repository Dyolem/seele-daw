import type { MasterChannelRecord } from './channel'
import type { DeviceDescriptor } from './device'
import type {
  ClipId,
  DeviceId,
  MidiSourceId,
  NoteId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from './ids'
import type { ClipRecord } from './midi-clip'
import type { MidiNoteRecord } from './midi-note'
import type { MidiSourceRecord } from './midi-source'
import { INITIAL_MODEL_REVISION, nextModelRevision, type ModelRevision } from './model-revision'
import {
  ModelStoreWriteAccessError,
  registerModelStoreWriteAccess,
} from './model-store-write-access'
import type { ProjectRecord } from './project'
import type { TrackRecord } from './track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

interface IdentifiedRecord<Id extends string> {
  readonly id: Id
}

function rejectStoreWrite(detail: string): never {
  throw new ModelStoreWriteAccessError('write-precondition-failed', detail)
}

/**
 * Performs an entity-table compare-and-swap without exposing the table itself.
 * All checks finish before the single set/delete that changes authoritative state.
 */
function writeEntityRecord<Id extends string, RecordType extends IdentifiedRecord<Id>>(
  table: Map<Id, RecordType>,
  entityName: string,
  expected: RecordType | undefined,
  next: RecordType | undefined,
): void {
  if (expected === undefined && next === undefined) {
    rejectStoreWrite(`${entityName} write requires an expected or next record`)
  }

  if (expected !== undefined && next !== undefined && expected.id !== next.id) {
    rejectStoreWrite(`${entityName} write cannot change record identity`)
  }

  const id = expected?.id ?? next?.id

  if (id === undefined) {
    rejectStoreWrite(`${entityName} write could not resolve a record identity`)
  }

  const current = table.get(id)

  if (expected === undefined) {
    if (current !== undefined) {
      rejectStoreWrite(`${entityName} ${id} already exists`)
    }
  } else if (current !== expected) {
    rejectStoreWrite(`${entityName} ${id} no longer matches the expected record`)
  }

  if (next === undefined) {
    table.delete(id)
  } else {
    table.set(id, next)
  }
}

function createMidiNoteTable(notes: readonly MidiNoteRecord[]): Map<NoteId, MidiNoteRecord> {
  const noteTable = new Map<NoteId, MidiNoteRecord>()

  for (const note of notes) {
    if (noteTable.has(note.id)) {
      rejectStoreWrite(`MIDI Note partition contains duplicate Note ID ${note.id}`)
    }

    noteTable.set(note.id, note)
  }

  return noteTable
}

function midiNotePartitionMatches(
  noteTable: ReadonlyMap<NoteId, MidiNoteRecord>,
  expectedNotes: readonly MidiNoteRecord[],
): boolean {
  if (noteTable.size !== expectedNotes.length) {
    return false
  }

  const expectedById = new Map(expectedNotes.map((note) => [note.id, note] as const))

  if (expectedById.size !== expectedNotes.length) {
    return false
  }

  for (const [noteId, note] of noteTable) {
    if (expectedById.get(noteId) !== note) {
      return false
    }
  }

  return true
}

export interface ModelStoreSeed {
  readonly project: ProjectRecord
  readonly trackOrder: readonly TrackId[]
  readonly tracks: ReadonlyMap<TrackId, TrackRecord>
  readonly clips: ReadonlyMap<ClipId, ClipRecord>
  readonly midiSources: ReadonlyMap<MidiSourceId, MidiSourceRecord>
  readonly midiNotesBySource: ReadonlyMap<MidiSourceId, ReadonlyMap<NoteId, MidiNoteRecord>>
  readonly tempoEvents: ReadonlyMap<TempoEventId, TempoEventRecord>
  readonly timeSignatureEvents: ReadonlyMap<TimeSignatureEventId, TimeSignatureEventRecord>
  readonly devices: ReadonlyMap<DeviceId, DeviceDescriptor>
  readonly master: MasterChannelRecord
}

export interface ModelStoreReader {
  readonly modelRevision: ModelRevision
  readonly project: ProjectRecord
  readonly master: MasterChannelRecord

  orderedTrackIds(): IterableIterator<TrackId>

  getTrack(id: TrackId): TrackRecord | undefined
  trackEntries(): IterableIterator<readonly [TrackId, TrackRecord]>

  getClip(id: ClipId): ClipRecord | undefined
  clipEntries(): IterableIterator<readonly [ClipId, ClipRecord]>

  getMidiSource(id: MidiSourceId): MidiSourceRecord | undefined
  midiSourceEntries(): IterableIterator<readonly [MidiSourceId, MidiSourceRecord]>

  hasMidiNotePartition(sourceId: MidiSourceId): boolean
  midiNotePartitionIds(): IterableIterator<MidiSourceId>
  getMidiNote(sourceId: MidiSourceId, noteId: NoteId): MidiNoteRecord | undefined
  midiNoteEntries(sourceId: MidiSourceId): IterableIterator<readonly [NoteId, MidiNoteRecord]>

  getTempoEvent(id: TempoEventId): TempoEventRecord | undefined
  tempoEventEntries(): IterableIterator<readonly [TempoEventId, TempoEventRecord]>

  getTimeSignatureEvent(id: TimeSignatureEventId): TimeSignatureEventRecord | undefined
  timeSignatureEventEntries(): IterableIterator<
    readonly [TimeSignatureEventId, TimeSignatureEventRecord]
  >

  getDevice(id: DeviceId): DeviceDescriptor | undefined
  deviceEntries(): IterableIterator<readonly [DeviceId, DeviceDescriptor]>
}

export class ModelStore implements ModelStoreReader {
  #modelRevision: ModelRevision
  #project: ProjectRecord
  #trackOrder: TrackId[]

  #tracks: Map<TrackId, TrackRecord>
  #clips: Map<ClipId, ClipRecord>

  #midiSources: Map<MidiSourceId, MidiSourceRecord>
  #midiNotesBySource: Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>

  #tempoEvents: Map<TempoEventId, TempoEventRecord>
  #timeSignatureEvents: Map<TimeSignatureEventId, TimeSignatureEventRecord>

  #devices: Map<DeviceId, DeviceDescriptor>
  #master: MasterChannelRecord

  constructor(seed: ModelStoreSeed) {
    this.#modelRevision = INITIAL_MODEL_REVISION
    this.#project = seed.project
    this.#trackOrder = [...seed.trackOrder]

    this.#tracks = new Map(seed.tracks)
    this.#clips = new Map(seed.clips)

    this.#midiSources = new Map(seed.midiSources)
    this.#midiNotesBySource = new Map()

    for (const [sourceId, noteTable] of seed.midiNotesBySource) {
      this.#midiNotesBySource.set(sourceId, new Map(noteTable))
    }

    this.#tempoEvents = new Map(seed.tempoEvents)
    this.#timeSignatureEvents = new Map(seed.timeSignatureEvents)

    this.#devices = new Map(seed.devices)
    this.#master = seed.master

    // The closures retain #private access while the registry hands them to one applier only.
    registerModelStoreWriteAccess(this, {
      writeProject: (expected, next) => {
        if (this.#project !== expected) {
          rejectStoreWrite('Project no longer matches the expected record')
        }

        this.#project = next
      },
      writeMaster: (expected, next) => {
        if (this.#master !== expected) {
          rejectStoreWrite('Master Channel no longer matches the expected record')
        }

        this.#master = next
      },
      writeTrack: (expected, next) => {
        writeEntityRecord(this.#tracks, 'Track', expected, next)
      },
      writeClip: (expected, next) => {
        writeEntityRecord(this.#clips, 'Clip', expected, next)
      },
      writeMidiSource: (expected, next) => {
        writeEntityRecord(this.#midiSources, 'MIDI Source', expected, next)
      },
      writeTempoEvent: (expected, next) => {
        writeEntityRecord(this.#tempoEvents, 'Tempo Event', expected, next)
      },
      writeTimeSignatureEvent: (expected, next) => {
        writeEntityRecord(this.#timeSignatureEvents, 'Time Signature Event', expected, next)
      },
      writeDevice: (expected, next) => {
        writeEntityRecord(this.#devices, 'Device', expected, next)
      },
      insertTrackOrder: (index, trackId) => {
        if (!Number.isSafeInteger(index) || index < 0 || index > this.#trackOrder.length) {
          rejectStoreWrite(
            `Cannot insert Track ${trackId} at index ${index} for length ${this.#trackOrder.length}`,
          )
        }

        this.#trackOrder.splice(index, 0, trackId)
      },
      removeTrackOrder: (index, trackId) => {
        if (!Number.isSafeInteger(index) || index < 0 || index >= this.#trackOrder.length) {
          rejectStoreWrite(
            `Cannot remove Track ${trackId} at index ${index} for length ${this.#trackOrder.length}`,
          )
        }

        if (this.#trackOrder[index] !== trackId) {
          rejectStoreWrite(
            `Track order index ${index} no longer contains the expected Track ${trackId}`,
          )
        }

        this.#trackOrder.splice(index, 1)
      },
      insertMidiNotePartition: (sourceId, notes) => {
        if (this.#midiNotesBySource.has(sourceId)) {
          rejectStoreWrite(`MIDI Note partition ${sourceId} already exists`)
        }

        // Build first so duplicate IDs or allocation failures cannot leave a partial partition.
        const noteTable = createMidiNoteTable(notes)

        this.#midiNotesBySource.set(sourceId, noteTable)
      },
      removeMidiNotePartition: (sourceId, expectedNotes) => {
        const noteTable = this.#midiNotesBySource.get(sourceId)

        if (noteTable === undefined) {
          rejectStoreWrite(`MIDI Note partition ${sourceId} does not exist`)
        }

        if (!midiNotePartitionMatches(noteTable, expectedNotes)) {
          rejectStoreWrite(`MIDI Note partition ${sourceId} no longer matches the expected records`)
        }

        this.#midiNotesBySource.delete(sourceId)
      },
      writeMidiNote: (sourceId, expected, next) => {
        const noteTable = this.#midiNotesBySource.get(sourceId)

        if (noteTable === undefined) {
          rejectStoreWrite(`MIDI Note partition ${sourceId} does not exist`)
        }

        writeEntityRecord(noteTable, `MIDI Note in partition ${sourceId}`, expected, next)
      },
      commitModelRevision: (expected, next) => {
        if (this.#modelRevision !== expected) {
          rejectStoreWrite(
            `Model revision ${this.#modelRevision} no longer matches expected revision ${expected}`,
          )
        }

        if (nextModelRevision(expected) !== next) {
          rejectStoreWrite(`Model revision must advance exactly once from ${expected} to ${next}`)
        }

        // This assignment is deliberately the last state change in a successful transaction.
        this.#modelRevision = next
      },
    })
  }

  get modelRevision(): ModelRevision {
    return this.#modelRevision
  }

  get project(): ProjectRecord {
    return this.#project
  }

  get master(): MasterChannelRecord {
    return this.#master
  }

  orderedTrackIds(): IterableIterator<TrackId> {
    return this.#trackOrder.values()
  }

  getTrack(id: TrackId): TrackRecord | undefined {
    return this.#tracks.get(id)
  }

  trackEntries(): IterableIterator<readonly [TrackId, TrackRecord]> {
    return this.#tracks.entries()
  }

  getClip(id: ClipId): ClipRecord | undefined {
    return this.#clips.get(id)
  }

  clipEntries(): IterableIterator<readonly [ClipId, ClipRecord]> {
    return this.#clips.entries()
  }

  getMidiSource(id: MidiSourceId): MidiSourceRecord | undefined {
    return this.#midiSources.get(id)
  }

  midiSourceEntries(): IterableIterator<readonly [MidiSourceId, MidiSourceRecord]> {
    return this.#midiSources.entries()
  }

  hasMidiNotePartition(sourceId: MidiSourceId): boolean {
    return this.#midiNotesBySource.has(sourceId)
  }

  midiNotePartitionIds(): IterableIterator<MidiSourceId> {
    return this.#midiNotesBySource.keys()
  }

  getMidiNote(sourceId: MidiSourceId, noteId: NoteId): MidiNoteRecord | undefined {
    return this.#midiNotesBySource.get(sourceId)?.get(noteId)
  }

  *midiNoteEntries(sourceId: MidiSourceId): IterableIterator<readonly [NoteId, MidiNoteRecord]> {
    const noteTable = this.#midiNotesBySource.get(sourceId)

    if (noteTable !== undefined) {
      yield* noteTable.entries()
    }
  }

  getTempoEvent(id: TempoEventId): TempoEventRecord | undefined {
    return this.#tempoEvents.get(id)
  }

  tempoEventEntries(): IterableIterator<readonly [TempoEventId, TempoEventRecord]> {
    return this.#tempoEvents.entries()
  }

  getTimeSignatureEvent(id: TimeSignatureEventId): TimeSignatureEventRecord | undefined {
    return this.#timeSignatureEvents.get(id)
  }

  timeSignatureEventEntries(): IterableIterator<
    readonly [TimeSignatureEventId, TimeSignatureEventRecord]
  > {
    return this.#timeSignatureEvents.entries()
  }

  getDevice(id: DeviceId): DeviceDescriptor | undefined {
    return this.#devices.get(id)
  }

  deviceEntries(): IterableIterator<readonly [DeviceId, DeviceDescriptor]> {
    return this.#devices.entries()
  }
}
