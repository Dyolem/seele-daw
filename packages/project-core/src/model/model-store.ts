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
import { INITIAL_MODEL_REVISION, type ModelRevision } from './model-revision'
import type { ProjectRecord } from './project'
import type { TrackRecord } from './track'
import type { TempoEventRecord } from '../time/tempo-event'
import type { TimeSignatureEventRecord } from '../time/time-signature-event'

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
