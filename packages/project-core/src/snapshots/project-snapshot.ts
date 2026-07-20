import type { MasterChannelRecord } from '@/model/channel'
import type { DeviceDescriptor } from '@/model/device'
import type { MidiSourceId, TrackId } from '@/model/ids'
import type { ClipRecord } from '@/model/midi-clip'
import type { MidiNoteRecord } from '@/model/midi-note'
import type { MidiSourceRecord } from '@/model/midi-source'
import type { ModelRevision } from '@/model/model-revision'
import type { ModelStoreReader } from '@/model/model-store'
import type { ProjectRecord } from '@/model/project'
import type { TrackRecord } from '@/model/track'
import type { TempoEventRecord } from '@/time/tempo-event'
import type { Tick } from '@/time/tick'
import type { TimeSignatureEventRecord } from '@/time/time-signature-event'

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
    tempoEvents: copySortedTimelineRecords(reader.tempoEventEntries()),
    timeSignatureEvents: copySortedTimelineRecords(reader.timeSignatureEventEntries()),
    devices: copySortedRecords(reader.deviceEntries()),
  })
}
