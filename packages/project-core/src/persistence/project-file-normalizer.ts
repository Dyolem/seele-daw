import {
  createChannelStripDescriptor,
  createMasterChannelRecord,
  type ChannelStripDescriptor,
  type MasterChannelRecord,
} from '#internal/model/channel'
import { createDeviceDescriptor, type DeviceDescriptor } from '#internal/model/device'
import { DomainValueError } from '#internal/model/domain-value-error'
import {
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseMidiSourceId,
  parseNoteId,
  parseParameterId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
  type ClipId,
  type DeviceId,
  type MidiSourceId,
  type NoteId,
  type ParameterId,
  type TempoEventId,
  type TimeSignatureEventId,
  type TrackId,
} from '#internal/model/ids'
import { parseJsonValue, type JsonValue } from '#internal/model/json-value'
import { createMidiClipRecord, createMidiLoop, type ClipRecord } from '#internal/model/midi-clip'
import { createMidiNoteRecord, type MidiNoteRecord } from '#internal/model/midi-note'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelStoreSeed } from '#internal/model/model-store'
import { createProjectRecord } from '#internal/model/project'
import {
  parseBipolarValue,
  parseEntityName,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseProjectColor,
} from '#internal/model/scalars'
import {
  createAudioTrackRecord,
  createInstrumentTrackRecord,
  type TrackRecord,
} from '#internal/model/track'
import type {
  ChannelStripDTO,
  DeviceDTO,
  MasterChannelDTO,
  MidiClipDTO,
  MidiNoteDTO,
  ProjectFileDTO,
  TrackDTO,
} from '#internal/persistence/project-file-dto'
import {
  ProjectFileLoadError,
  type ProjectFileLoadPathSegment,
} from '#internal/persistence/project-file-load-error'
import { createTempoEventRecord, parseTempoBpm, type TempoEventRecord } from '#internal/time/tempo-event'
import {
  createTimeSignatureEventRecord,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
  type TimeSignatureEventRecord,
} from '#internal/time/time-signature-event'
import { parsePositiveTick, parseTick } from '#internal/time/tick'

type LoadPath = readonly ProjectFileLoadPathSegment[]

function formatLoadPath(path: LoadPath): string {
  return path.length === 0
    ? '$'
    : `$${path.map((segment) => `[${JSON.stringify(segment)}]`).join('')}`
}

function parseDomainValue<Value>(path: LoadPath, parse: () => Value): Value {
  try {
    return parse()
  } catch (error) {
    if (!(error instanceof DomainValueError)) throw error

    throw new ProjectFileLoadError(
      'invalid-domain-value',
      `Project file contains an invalid domain value at ${formatLoadPath(path)}`,
      { path, cause: error },
    )
  }
}

function parseDeviceIds(values: readonly string[], path: LoadPath): readonly DeviceId[] {
  return values.map((value, index) =>
    parseDomainValue([...path, index], () => parseDeviceId(value)),
  )
}

function normalizeChannelStrip(dto: ChannelStripDTO, path: LoadPath): ChannelStripDescriptor {
  const input = {
    gain: parseDomainValue([...path, 'gain'], () => parseLinearGain(dto.gain)),
    pan: parseDomainValue([...path, 'pan'], () => parseBipolarValue(dto.pan)),
    muted: dto.muted,
    soloed: dto.soloed,
  }

  return parseDomainValue(path, () => createChannelStripDescriptor(input))
}

function normalizeTrack(dto: TrackDTO, path: LoadPath): TrackRecord {
  const base = {
    id: parseDomainValue([...path, 'id'], () => parseTrackId(dto.id)),
    name: parseDomainValue([...path, 'name'], () => parseEntityName(dto.name)),
    color:
      dto.color === null
        ? null
        : parseDomainValue([...path, 'color'], () => parseProjectColor(dto.color)),
    channel: normalizeChannelStrip(dto.channel, [...path, 'channel']),
    audioEffectIds: parseDeviceIds(dto.audioEffectIds, [...path, 'audioEffectIds']),
  }

  switch (dto.kind) {
    case 'instrument':
      return parseDomainValue(path, () =>
        createInstrumentTrackRecord({
          ...base,
          midiEffectIds: parseDeviceIds(dto.midiEffectIds, [...path, 'midiEffectIds']),
          instrumentDeviceId: parseDomainValue([...path, 'instrumentDeviceId'], () =>
            parseDeviceId(dto.instrumentDeviceId),
          ),
        }),
      )
    case 'audio':
      return parseDomainValue(path, () => createAudioTrackRecord(base))
  }
}

function normalizeMidiClip(dto: MidiClipDTO, path: LoadPath): ClipRecord {
  const loopDTO = dto.loop
  const loop =
    loopDTO === null
      ? null
      : parseDomainValue([...path, 'loop'], () =>
          createMidiLoop({
            sourceStartTick: parseDomainValue([...path, 'loop', 'sourceStartTick'], () =>
              parseTick(loopDTO.sourceStartTick),
            ),
            sourceSpanTick: parseDomainValue([...path, 'loop', 'sourceSpanTick'], () =>
              parsePositiveTick(loopDTO.sourceSpanTick),
            ),
          }),
        )

  return parseDomainValue(path, () =>
    createMidiClipRecord({
      id: parseDomainValue([...path, 'id'], () => parseClipId(dto.id)),
      trackId: parseDomainValue([...path, 'trackId'], () => parseTrackId(dto.trackId)),
      name: parseDomainValue([...path, 'name'], () => parseEntityName(dto.name)),
      color:
        dto.color === null
          ? null
          : parseDomainValue([...path, 'color'], () => parseProjectColor(dto.color)),
      muted: dto.muted,
      startTick: parseDomainValue([...path, 'startTick'], () => parseTick(dto.startTick)),
      spanTick: parseDomainValue([...path, 'spanTick'], () => parsePositiveTick(dto.spanTick)),
      sourceId: parseDomainValue([...path, 'sourceId'], () => parseMidiSourceId(dto.sourceId)),
      sourceOffsetTick: parseDomainValue([...path, 'sourceOffsetTick'], () =>
        parseTick(dto.sourceOffsetTick),
      ),
      loop,
    }),
  )
}

function normalizeMidiNote(dto: MidiNoteDTO, path: LoadPath): MidiNoteRecord {
  return parseDomainValue(path, () =>
    createMidiNoteRecord({
      id: parseDomainValue([...path, 'id'], () => parseNoteId(dto.id)),
      startTick: parseDomainValue([...path, 'startTick'], () => parseTick(dto.startTick)),
      durationTick: parseDomainValue([...path, 'durationTick'], () =>
        parsePositiveTick(dto.durationTick),
      ),
      pitch: parseDomainValue([...path, 'pitch'], () => parseMidiPitch(dto.pitch)),
      velocity: parseDomainValue([...path, 'velocity'], () => parseMidiVelocity(dto.velocity)),
      channel: parseDomainValue([...path, 'channel'], () => parseMidiChannel(dto.channel)),
    }),
  )
}

function normalizeDeviceParameters(
  dto: DeviceDTO,
  path: LoadPath,
): Readonly<Record<ParameterId, JsonValue>> {
  const parameters: Record<string, JsonValue> = {}

  for (const key of Object.keys(dto.parameters)) {
    const parameterId = parseDomainValue([...path, key], () => parseParameterId(key))
    const value = parseDomainValue([...path, key], () =>
      parseJsonValue(dto.parameters[key], `DeviceDTO.parameters[${JSON.stringify(key)}]`),
    )

    // Each key has crossed the ParameterId parser; this assertion only describes the container.
    Object.defineProperty(parameters, parameterId, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    })
  }

  return parameters as Readonly<Record<ParameterId, JsonValue>>
}

function normalizeDevice(dto: DeviceDTO, path: LoadPath): DeviceDescriptor {
  return parseDomainValue(path, () =>
    createDeviceDescriptor({
      id: parseDomainValue([...path, 'id'], () => parseDeviceId(dto.id)),
      typeId: parseDomainValue([...path, 'typeId'], () => parseDeviceTypeId(dto.typeId)),
      definitionVersion: dto.definitionVersion,
      enabled: dto.enabled,
      parameters: normalizeDeviceParameters(dto, [...path, 'parameters']),
      opaqueState: parseDomainValue([...path, 'opaqueState'], () =>
        parseJsonValue(dto.opaqueState, 'DeviceDTO.opaqueState'),
      ),
    }),
  )
}

function normalizeMaster(dto: MasterChannelDTO): MasterChannelRecord {
  return parseDomainValue(['master'], () =>
    createMasterChannelRecord({
      gain: parseDomainValue(['master', 'gain'], () => parseLinearGain(dto.gain)),
      muted: dto.muted,
      audioEffectIds: parseDeviceIds(dto.audioEffectIds, ['master', 'audioEffectIds']),
    }),
  )
}

function createEntityMap<Id extends string, DTO, RecordType extends { readonly id: Id }>(
  table: Readonly<Record<string, DTO>>,
  tableName: string,
  normalize: (dto: DTO, path: LoadPath) => RecordType,
): Map<Id, RecordType> {
  const records = new Map<Id, RecordType>()

  for (const key of Object.keys(table)) {
    const record = normalize(table[key]!, [tableName, key])
    records.set(record.id, record)
  }

  return records
}

/** @internal Maps the stable V1 protocol explicitly into the current normalized Store shape. */
export function normalizeProjectFileDTO(dto: ProjectFileDTO): ModelStoreSeed {
  const project = parseDomainValue([], () =>
    createProjectRecord({
      id: parseDomainValue(['projectId'], () => parseProjectId(dto.projectId)),
      name: parseDomainValue(['name'], () => parseEntityName(dto.name)),
    }),
  )
  const trackOrder = dto.trackOrder.map((trackId, index) =>
    parseDomainValue(['trackOrder', index], () => parseTrackId(trackId)),
  )
  const tracks = createEntityMap<TrackId, TrackDTO, TrackRecord>(
    dto.tracks,
    'tracks',
    normalizeTrack,
  )
  const clips = createEntityMap<ClipId, MidiClipDTO, ClipRecord>(
    dto.clips,
    'clips',
    normalizeMidiClip,
  )
  const midiSources = new Map<MidiSourceId, MidiSourceRecord>()
  const midiNotesBySource = new Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>()

  for (const key of Object.keys(dto.midiSources)) {
    const sourceDTO = dto.midiSources[key]!
    const path: LoadPath = ['midiSources', key]
    const source = parseDomainValue(path, () =>
      createMidiSourceRecord({
        id: parseDomainValue([...path, 'id'], () => parseMidiSourceId(sourceDTO.id)),
        lengthTick: parseDomainValue([...path, 'lengthTick'], () =>
          parsePositiveTick(sourceDTO.lengthTick),
        ),
      }),
    )
    const notes = createEntityMap<NoteId, MidiNoteDTO, MidiNoteRecord>(
      sourceDTO.notes,
      'notes',
      (noteDTO, notePath) => normalizeMidiNote(noteDTO, [...path, ...notePath]),
    )

    midiSources.set(source.id, source)
    midiNotesBySource.set(source.id, notes)
  }

  const tempoEvents = createEntityMap<
    TempoEventId,
    ProjectFileDTO['tempoEvents'][string],
    TempoEventRecord
  >(dto.tempoEvents, 'tempoEvents', (event, path) =>
    parseDomainValue(path, () =>
      createTempoEventRecord({
        id: parseDomainValue([...path, 'id'], () => parseTempoEventId(event.id)),
        tick: parseDomainValue([...path, 'tick'], () => parseTick(event.tick)),
        bpm: parseDomainValue([...path, 'bpm'], () => parseTempoBpm(event.bpm)),
      }),
    ),
  )
  const timeSignatureEvents = createEntityMap<
    TimeSignatureEventId,
    ProjectFileDTO['timeSignatureEvents'][string],
    TimeSignatureEventRecord
  >(dto.timeSignatureEvents, 'timeSignatureEvents', (event, path) =>
    parseDomainValue(path, () =>
      createTimeSignatureEventRecord({
        id: parseDomainValue([...path, 'id'], () => parseTimeSignatureEventId(event.id)),
        tick: parseDomainValue([...path, 'tick'], () => parseTick(event.tick)),
        numerator: parseDomainValue([...path, 'numerator'], () =>
          parseTimeSignatureNumerator(event.numerator),
        ),
        denominator: parseDomainValue([...path, 'denominator'], () =>
          parseTimeSignatureDenominator(event.denominator),
        ),
      }),
    ),
  )
  const devices = createEntityMap<DeviceId, DeviceDTO, DeviceDescriptor>(
    dto.devices,
    'devices',
    normalizeDevice,
  )
  const master = normalizeMaster(dto.master)

  return {
    project,
    trackOrder,
    tracks,
    clips,
    midiSources,
    midiNotesBySource,
    tempoEvents,
    timeSignatureEvents,
    devices,
    master,
  }
}
