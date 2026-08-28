import type { MasterChannelRecord } from '#internal/model/channel'
import type { DeviceDescriptor } from '#internal/model/device'
import type { JsonObject, JsonValue } from '#internal/model/json-value'
import { parseJsonValue } from '#internal/model/json-value'
import type { ClipRecord, MidiLoop } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import type { MidiSustainPedalEventRecord } from '#internal/model/midi-sustain-pedal-event'
import type { TrackRecord } from '#internal/model/track'
import {
  PROJECT_FILE_FORMAT_VERSION,
  type ChannelStripDTO,
  type ClipDTO,
  type DeviceDTO,
  type MasterChannelDTO,
  type MidiLoopDTO,
  type MidiNoteDTO,
  type MidiSourceDTO,
  type MidiSustainPedalEventDTO,
  type ProjectFileDTO,
  type TempoEventDTO,
  type TimeSignatureEventDTO,
  type TrackDTO,
} from '#internal/persistence/project-file-dto'
import {
  ProjectFileProjectionError,
  type ProjectFileProjectionErrorDetails,
} from '#internal/persistence/project-file-projection-error'
import type {
  MidiNotePartitionSnapshot,
  MidiSustainPedalEventPartitionSnapshot,
  ProjectSnapshot,
} from '#internal/snapshots/project-snapshot'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

interface IdentifiedRecord {
  readonly id: string
}

interface IdentifiedDTO {
  readonly id: string
}

function rejectProjection(
  code: ProjectFileProjectionError['code'],
  message: string,
  details: ProjectFileProjectionErrorDetails = {},
): never {
  throw new ProjectFileProjectionError(code, message, details)
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function defineOwnDataProperty<Value>(
  target: Record<string, Value>,
  key: string,
  value: Value,
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  })
}

function createEntityTable<RecordType extends IdentifiedRecord, DTOType extends IdentifiedDTO>(
  entityKind: string,
  records: readonly RecordType[],
  project: (record: RecordType) => DTOType,
): Readonly<Record<string, DTOType>> {
  const table: Record<string, DTOType> = {}

  for (const record of records) {
    if (Object.hasOwn(table, record.id)) {
      rejectProjection(
        'duplicate-entity-id',
        `ProjectFileDTO cannot contain duplicate ${entityKind} ID ${record.id}`,
        { entityKind, entityId: record.id },
      )
    }

    const dto = project(record)

    // Opaque IDs such as "__proto__" must remain ordinary JSON object keys.
    defineOwnDataProperty(table, record.id, dto)
  }

  return Object.freeze(table)
}

function freezeJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJsonValue(item)))
  }

  if (value !== null && typeof value === 'object') {
    const output: Record<string, JsonValue> = {}
    const objectValue = value as JsonObject

    for (const key of Object.keys(objectValue).sort(compareStrings)) {
      defineOwnDataProperty(output, key, freezeJsonValue(objectValue[key]!))
    }

    return Object.freeze(output)
  }

  return value
}

function copyFrozenJsonValue(value: JsonValue, valueName: string): JsonValue {
  return freezeJsonValue(parseJsonValue(value, valueName))
}

function copyFrozenJsonObject(
  value: Readonly<Record<string, JsonValue>>,
  valueName: string,
): Readonly<Record<string, JsonValue>> {
  const copied = copyFrozenJsonValue(value, valueName)

  if (copied === null || typeof copied !== 'object' || Array.isArray(copied)) {
    return rejectProjection(
      'invalid-device-json',
      `${valueName} must remain a JSON object during ProjectFileDTO projection`,
    )
  }

  return copied as JsonObject
}

function copyStringArray(values: readonly string[]): readonly string[] {
  return Object.freeze([...values])
}

function createChannelStripDTO(track: TrackRecord): ChannelStripDTO {
  return Object.freeze({
    gain: track.channel.gain,
    pan: track.channel.pan,
    muted: track.channel.muted,
    soloed: track.channel.soloed,
  })
}

function rejectTrackKind(track: never): never {
  const candidate = track as { readonly id?: unknown; readonly kind?: unknown }

  return rejectProjection(
    'unsupported-record-kind',
    `Track ${String(candidate.id)} has unsupported kind ${String(candidate.kind)}`,
    {
      entityKind: 'track',
      entityId: String(candidate.id),
      recordKind: String(candidate.kind),
    },
  )
}

function createTrackDTO(track: TrackRecord): TrackDTO {
  const base = {
    id: track.id,
    name: track.name,
    color: track.color,
    channel: createChannelStripDTO(track),
    audioEffectIds: copyStringArray(track.audioEffectIds),
  }

  switch (track.kind) {
    case 'instrument':
      return Object.freeze({
        ...base,
        kind: track.kind,
        midiEffectIds: copyStringArray(track.midiEffectIds),
        instrumentDeviceId: track.instrumentDeviceId,
      })
    case 'audio':
      return Object.freeze({ ...base, kind: track.kind })
    default:
      return rejectTrackKind(track)
  }
}

function createMidiLoopDTO(loop: MidiLoop): MidiLoopDTO {
  return Object.freeze({
    sourceStartTick: loop.sourceStartTick,
    sourceSpanTick: loop.sourceSpanTick,
  })
}

function rejectClipKind(clip: ClipRecord): never {
  const candidate = clip as { readonly id?: unknown; readonly kind?: unknown }

  return rejectProjection(
    'unsupported-record-kind',
    `Clip ${String(candidate.id)} has unsupported kind ${String(candidate.kind)}`,
    {
      entityKind: 'clip',
      entityId: String(candidate.id),
      recordKind: String(candidate.kind),
    },
  )
}

function createClipDTO(clip: ClipRecord): ClipDTO {
  switch (clip.kind) {
    case 'midi':
      return Object.freeze({
        id: clip.id,
        kind: clip.kind,
        trackId: clip.trackId,
        name: clip.name,
        color: clip.color,
        muted: clip.muted,
        startTick: clip.startTick,
        spanTick: clip.spanTick,
        sourceId: clip.sourceId,
        sourceOffsetTick: clip.sourceOffsetTick,
        loop: clip.loop === null ? null : createMidiLoopDTO(clip.loop),
      })
    default:
      return rejectClipKind(clip)
  }
}

function createMidiNoteDTO(note: MidiNoteRecord): MidiNoteDTO {
  return Object.freeze({
    id: note.id,
    startTick: note.startTick,
    durationTick: note.durationTick,
    pitch: note.pitch,
    velocity: note.velocity,
    channel: note.channel,
  })
}

function createMidiSourceDTO(
  source: MidiSourceRecord,
  notePartition: MidiNotePartitionSnapshot,
  sustainPedalEventPartition: MidiSustainPedalEventPartitionSnapshot,
): MidiSourceDTO {
  return Object.freeze({
    id: source.id,
    lengthTick: source.lengthTick,
    notes: createEntityTable('midi-note', notePartition.notes, createMidiNoteDTO),
    sustainPedalEvents: createEntityTable(
      'midi-sustain-pedal-event',
      sustainPedalEventPartition.events,
      createMidiSustainPedalEventDTO,
    ),
  })
}

function createMidiSustainPedalEventDTO(
  event: MidiSustainPedalEventRecord,
): MidiSustainPedalEventDTO {
  return Object.freeze({
    id: event.id,
    tick: event.tick,
    value: event.value,
    channel: event.channel,
  })
}

function createTempoEventDTO(event: TempoEventRecord): TempoEventDTO {
  return Object.freeze({ id: event.id, tick: event.tick, bpm: event.bpm })
}

function createTimeSignatureEventDTO(event: TimeSignatureEventRecord): TimeSignatureEventDTO {
  return Object.freeze({
    id: event.id,
    tick: event.tick,
    numerator: event.numerator,
    denominator: event.denominator,
  })
}

function createDeviceDTO(device: DeviceDescriptor): DeviceDTO {
  return Object.freeze({
    id: device.id,
    typeId: device.typeId,
    definitionVersion: device.definitionVersion,
    enabled: device.enabled,
    parameters: copyFrozenJsonObject(
      device.parameters,
      `Device ${device.id} ProjectFileDTO parameters`,
    ),
    opaqueState:
      device.opaqueState === null
        ? null
        : copyFrozenJsonValue(device.opaqueState, `Device ${device.id} ProjectFileDTO opaqueState`),
  })
}

function createMasterChannelDTO(master: MasterChannelRecord): MasterChannelDTO {
  return Object.freeze({
    gain: master.gain,
    muted: master.muted,
    audioEffectIds: copyStringArray(master.audioEffectIds),
  })
}

function indexMidiNotePartitions(
  partitions: readonly MidiNotePartitionSnapshot[],
): Map<string, MidiNotePartitionSnapshot> {
  const indexed = new Map<string, MidiNotePartitionSnapshot>()

  for (const partition of partitions) {
    if (indexed.has(partition.sourceId)) {
      rejectProjection(
        'duplicate-midi-note-partition',
        `ProjectSnapshot contains duplicate MIDI Note partition ${partition.sourceId}`,
        { sourceId: partition.sourceId },
      )
    }

    indexed.set(partition.sourceId, partition)
  }

  return indexed
}

function indexMidiSustainPedalEventPartitions(
  partitions: readonly MidiSustainPedalEventPartitionSnapshot[],
): Map<string, MidiSustainPedalEventPartitionSnapshot> {
  const indexed = new Map<string, MidiSustainPedalEventPartitionSnapshot>()

  for (const partition of partitions) {
    if (indexed.has(partition.sourceId)) {
      rejectProjection(
        'duplicate-midi-sustain-pedal-event-partition',
        `ProjectSnapshot contains duplicate MIDI Sustain Pedal Event partition ${partition.sourceId}`,
        { sourceId: partition.sourceId },
      )
    }

    indexed.set(partition.sourceId, partition)
  }

  return indexed
}

/** Projects one trusted runtime Snapshot into a detached, frozen current file value. */
export function createProjectFileDTO(snapshot: ProjectSnapshot): ProjectFileDTO {
  const notePartitionsBySource = indexMidiNotePartitions(snapshot.midiNotePartitions)
  const sustainPedalEventPartitionsBySource = indexMidiSustainPedalEventPartitions(
    snapshot.midiSustainPedalEventPartitions,
  )
  const midiSources = createEntityTable('midi-source', snapshot.midiSources, (source) => {
    const notePartition = notePartitionsBySource.get(source.id)

    if (notePartition === undefined) {
      return rejectProjection(
        'midi-note-partition-missing',
        `MIDI Source ${source.id} has no Note partition in ProjectSnapshot`,
        { sourceId: source.id },
      )
    }

    const sustainPedalEventPartition = sustainPedalEventPartitionsBySource.get(source.id)
    if (sustainPedalEventPartition === undefined) {
      return rejectProjection(
        'midi-sustain-pedal-event-partition-missing',
        `MIDI Source ${source.id} has no Sustain Pedal Event partition in ProjectSnapshot`,
        { sourceId: source.id },
      )
    }

    notePartitionsBySource.delete(source.id)
    sustainPedalEventPartitionsBySource.delete(source.id)
    return createMidiSourceDTO(source, notePartition, sustainPedalEventPartition)
  })
  const orphanPartition = notePartitionsBySource.values().next().value

  if (orphanPartition !== undefined) {
    rejectProjection(
      'orphan-midi-note-partition',
      `MIDI Note partition ${orphanPartition.sourceId} has no Source in ProjectSnapshot`,
      { sourceId: orphanPartition.sourceId },
    )
  }
  const orphanSustainPedalEventPartition = sustainPedalEventPartitionsBySource.values().next().value
  if (orphanSustainPedalEventPartition !== undefined) {
    rejectProjection(
      'orphan-midi-sustain-pedal-event-partition',
      `MIDI Sustain Pedal Event partition ${orphanSustainPedalEventPartition.sourceId} has no Source in ProjectSnapshot`,
      { sourceId: orphanSustainPedalEventPartition.sourceId },
    )
  }

  return Object.freeze({
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    requiredFeatures: Object.freeze([]),
    projectId: snapshot.project.id,
    name: snapshot.project.name,
    trackOrder: copyStringArray(snapshot.trackOrder),
    tracks: createEntityTable('track', snapshot.tracks, createTrackDTO),
    clips: createEntityTable('clip', snapshot.clips, createClipDTO),
    midiSources,
    tempoEvents: createEntityTable('tempo-event', snapshot.tempoEvents, createTempoEventDTO),
    timeSignatureEvents: createEntityTable(
      'time-signature-event',
      snapshot.timeSignatureEvents,
      createTimeSignatureEventDTO,
    ),
    devices: createEntityTable('device', snapshot.devices, createDeviceDTO),
    master: createMasterChannelDTO(snapshot.master),
  })
}
