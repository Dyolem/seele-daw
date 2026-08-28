import type { MasterChannelRecord } from '#internal/model/channel'
import type { DeviceDescriptor } from '#internal/model/device'
import type { MidiSourceId, TrackId } from '#internal/model/ids'
import type { ClipRecord } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import type { ModelRevision } from '#internal/model/model-revision'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { ProjectRecord } from '#internal/model/project'
import type { TrackRecord } from '#internal/model/track'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { Tick } from '#internal/time/tick'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

interface IdentifiedRecord {
  readonly id: string
}

interface TimelineRecord extends IdentifiedRecord {
  readonly tick: Tick
}

export interface MidiNotePartitionSnapshot {
  readonly sourceId: MidiSourceId
  readonly notes: readonly MidiNoteRecord[]
}

export interface MidiSustainPedalEventPartitionSnapshot {
  readonly sourceId: MidiSourceId
  readonly events: readonly MidiSustainPedalEventRecord[]
}

/** Complete read-only project facts captured at one ModelStore revision. */
export interface ProjectSnapshot {
  readonly modelRevision: ModelRevision
  readonly project: ProjectRecord
  readonly master: MasterChannelRecord
  readonly trackOrder: readonly TrackId[]
  readonly tracks: readonly TrackRecord[]
  readonly clips: readonly ClipRecord[]
  readonly midiSources: readonly MidiSourceRecord[]
  readonly midiNotePartitions: readonly MidiNotePartitionSnapshot[]
  readonly midiSustainPedalEventPartitions: readonly MidiSustainPedalEventPartitionSnapshot[]
  readonly tempoEvents: readonly TempoEventRecord[]
  readonly timeSignatureEvents: readonly TimeSignatureEventRecord[]
  readonly devices: readonly DeviceDescriptor[]
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareIdentifiedRecords(left: IdentifiedRecord, right: IdentifiedRecord): number {
  return compareStrings(left.id, right.id)
}

function compareTimelineRecords(left: TimelineRecord, right: TimelineRecord): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  return compareStrings(left.id, right.id)
}

function copySortedRecords<RecordType extends IdentifiedRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  const records = Array.from(entries, ([, record]) => record)
  records.sort(compareIdentifiedRecords)
  return Object.freeze(records)
}

function copySortedTimelineRecords<RecordType extends TimelineRecord>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly RecordType[] {
  const records = Array.from(entries, ([, record]) => record)
  records.sort(compareTimelineRecords)
  return Object.freeze(records)
}

function createMidiNotePartitionSnapshots(
  reader: ModelStoreReader,
): readonly MidiNotePartitionSnapshot[] {
  const sourceIds = [...reader.midiNotePartitionIds()].sort(compareStrings)
  const partitions = sourceIds.map((sourceId) =>
    Object.freeze<MidiNotePartitionSnapshot>({
      sourceId,
      notes: copySortedRecords(reader.midiNoteEntries(sourceId)),
    }),
  )

  return Object.freeze(partitions)
}

function createMidiSustainPedalEventPartitionSnapshots(
  reader: ModelStoreReader,
): readonly MidiSustainPedalEventPartitionSnapshot[] {
  const sourceIds = [...reader.midiSustainPedalEventPartitionIds()].sort(compareStrings)
  const partitions = sourceIds.map((sourceId) =>
    Object.freeze<MidiSustainPedalEventPartitionSnapshot>({
      sourceId,
      events: copySortedTimelineRecords(reader.midiSustainPedalEventEntries(sourceId)),
    }),
  )

  return Object.freeze(partitions)
}

/** @internal Creates a low-frequency stable projection without exposing Store containers. */
export function createProjectSnapshot(reader: ModelStoreReader): ProjectSnapshot {
  return Object.freeze({
    modelRevision: reader.modelRevision,
    project: reader.project,
    master: reader.master,
    trackOrder: Object.freeze([...reader.orderedTrackIds()]),
    tracks: copySortedRecords(reader.trackEntries()),
    clips: copySortedRecords(reader.clipEntries()),
    midiSources: copySortedRecords(reader.midiSourceEntries()),
    midiNotePartitions: createMidiNotePartitionSnapshots(reader),
    midiSustainPedalEventPartitions: createMidiSustainPedalEventPartitionSnapshots(reader),
    tempoEvents: copySortedTimelineRecords(reader.tempoEventEntries()),
    timeSignatureEvents: copySortedTimelineRecords(reader.timeSignatureEventEntries()),
    devices: copySortedRecords(reader.deviceEntries()),
  })
}
