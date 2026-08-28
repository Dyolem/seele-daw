import type { JsonValue } from '#internal/model/json-value'

export const PROJECT_FILE_V1_FORMAT_VERSION = 1 as const
export const PROJECT_FILE_V2_FORMAT_VERSION = 2 as const

// Public writers emit the current format; historical protocol modules use their fixed constant.
export const PROJECT_FILE_FORMAT_VERSION = PROJECT_FILE_V2_FORMAT_VERSION

export type ProjectFileFormatVersion = typeof PROJECT_FILE_FORMAT_VERSION

export interface ChannelStripDTO {
  readonly gain: number
  readonly pan: number
  readonly muted: boolean
  readonly soloed: boolean
}

export interface MasterChannelDTO {
  readonly gain: number
  readonly muted: boolean
  readonly audioEffectIds: readonly string[]
}

interface TrackDTOBase {
  readonly id: string
  readonly name: string
  readonly color: string | null
  readonly channel: ChannelStripDTO
  readonly audioEffectIds: readonly string[]
}

export interface InstrumentTrackDTO extends TrackDTOBase {
  readonly kind: 'instrument'
  readonly midiEffectIds: readonly string[]
  readonly instrumentDeviceId: string
}

export interface AudioTrackDTO extends TrackDTOBase {
  readonly kind: 'audio'
}

export type TrackDTO = InstrumentTrackDTO | AudioTrackDTO

export interface MidiLoopDTO {
  readonly sourceStartTick: number
  readonly sourceSpanTick: number
}

export interface MidiClipDTO {
  readonly id: string
  readonly kind: 'midi'
  readonly trackId: string
  readonly name: string
  readonly color: string | null
  readonly muted: boolean
  readonly startTick: number
  readonly spanTick: number
  readonly sourceId: string
  readonly sourceOffsetTick: number
  readonly loop: MidiLoopDTO | null
}

export type ClipDTO = MidiClipDTO

export interface MidiNoteDTO {
  readonly id: string
  readonly startTick: number
  readonly durationTick: number
  readonly pitch: number
  readonly velocity: number
  readonly channel: number
}

export interface MidiSustainPedalEventDTO {
  readonly id: string
  readonly tick: number
  readonly value: number
  readonly channel: number
}

export interface MidiSourceV1DTO {
  readonly id: string
  readonly lengthTick: number
  readonly notes: Readonly<Record<string, MidiNoteDTO>>
}

export interface MidiSourceDTO extends MidiSourceV1DTO {
  readonly sustainPedalEvents: Readonly<Record<string, MidiSustainPedalEventDTO>>
}

export interface TempoEventDTO {
  readonly id: string
  readonly tick: number
  readonly bpm: number
}

export interface TimeSignatureEventDTO {
  readonly id: string
  readonly tick: number
  readonly numerator: number
  readonly denominator: number
}

export interface DeviceDTO {
  readonly id: string
  readonly typeId: string
  readonly definitionVersion: number
  readonly enabled: boolean
  readonly parameters: Readonly<Record<string, JsonValue>>
  readonly opaqueState: JsonValue | null
}

interface ProjectFileSharedDTO {
  readonly requiredFeatures: readonly string[]
  readonly projectId: string
  readonly name: string
  readonly trackOrder: readonly string[]
  readonly tracks: Readonly<Record<string, TrackDTO>>
  readonly clips: Readonly<Record<string, ClipDTO>>
  readonly tempoEvents: Readonly<Record<string, TempoEventDTO>>
  readonly timeSignatureEvents: Readonly<Record<string, TimeSignatureEventDTO>>
  readonly devices: Readonly<Record<string, DeviceDTO>>
  readonly master: MasterChannelDTO
}

/** Historical V1 shape retained for strict decoding and deterministic migration. */
export interface ProjectFileV1DTO extends ProjectFileSharedDTO {
  readonly formatVersion: typeof PROJECT_FILE_V1_FORMAT_VERSION
  readonly midiSources: Readonly<Record<string, MidiSourceV1DTO>>
}

/** Current JSON-friendly project data. It is not the in-memory Project Model. */
export interface ProjectFileDTO extends ProjectFileSharedDTO {
  readonly formatVersion: ProjectFileFormatVersion
  readonly midiSources: Readonly<Record<string, MidiSourceDTO>>
}
