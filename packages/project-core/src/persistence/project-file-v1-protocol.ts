import {
  PROJECT_FILE_V1_FORMAT_VERSION,
  type AudioTrackDTO,
  type ChannelStripDTO,
  type DeviceDTO,
  type InstrumentTrackDTO,
  type MasterChannelDTO,
  type MidiClipDTO,
  type MidiLoopDTO,
  type MidiNoteDTO,
  type MidiSourceDTO,
  type ProjectFileDTO,
  type TempoEventDTO,
  type TimeSignatureEventDTO,
  type TrackDTO,
} from '@/persistence/project-file-dto'

type ExactFieldMap<Value extends object> = Readonly<{
  [Field in keyof Value]-?: true
}>

type ExactLiteralMap<Literal extends PropertyKey> = Readonly<{
  [Value in Literal]: true
}>

function defineFields<Value extends object>(fields: ExactFieldMap<Value>): ExactFieldMap<Value> {
  return Object.freeze(fields)
}

function defineLiterals<Literal extends PropertyKey>(
  literals: ExactLiteralMap<Literal>,
): ExactLiteralMap<Literal> {
  return Object.freeze(literals)
}

function defineRequiredFeatures(
  features: Readonly<Record<string, true>>,
): Readonly<Record<string, true>> {
  return Object.freeze(features)
}

/**
 * Executable V1 protocol vocabulary used by the decoder.
 * Its mapped types make DTO key additions, removals, and renames fail type checking
 * until the versioned runtime schema is reviewed deliberately.
 */
export const PROJECT_FILE_V1_PROTOCOL = Object.freeze({
  formatVersion: PROJECT_FILE_V1_FORMAT_VERSION,
  fields: Object.freeze({
    topLevel: defineFields<ProjectFileDTO>({
      formatVersion: true,
      requiredFeatures: true,
      projectId: true,
      name: true,
      trackOrder: true,
      tracks: true,
      clips: true,
      midiSources: true,
      tempoEvents: true,
      timeSignatureEvents: true,
      devices: true,
      master: true,
    }),
    channelStrip: defineFields<ChannelStripDTO>({
      gain: true,
      pan: true,
      muted: true,
      soloed: true,
    }),
    masterChannel: defineFields<MasterChannelDTO>({
      gain: true,
      muted: true,
      audioEffectIds: true,
    }),
    instrumentTrack: defineFields<InstrumentTrackDTO>({
      id: true,
      kind: true,
      name: true,
      color: true,
      channel: true,
      audioEffectIds: true,
      midiEffectIds: true,
      instrumentDeviceId: true,
    }),
    audioTrack: defineFields<AudioTrackDTO>({
      id: true,
      kind: true,
      name: true,
      color: true,
      channel: true,
      audioEffectIds: true,
    }),
    midiLoop: defineFields<MidiLoopDTO>({
      sourceStartTick: true,
      sourceSpanTick: true,
    }),
    midiClip: defineFields<MidiClipDTO>({
      id: true,
      kind: true,
      trackId: true,
      name: true,
      color: true,
      muted: true,
      startTick: true,
      spanTick: true,
      sourceId: true,
      sourceOffsetTick: true,
      loop: true,
    }),
    midiNote: defineFields<MidiNoteDTO>({
      id: true,
      startTick: true,
      durationTick: true,
      pitch: true,
      velocity: true,
      channel: true,
    }),
    midiSource: defineFields<MidiSourceDTO>({
      id: true,
      lengthTick: true,
      notes: true,
    }),
    tempoEvent: defineFields<TempoEventDTO>({
      id: true,
      tick: true,
      bpm: true,
    }),
    timeSignatureEvent: defineFields<TimeSignatureEventDTO>({
      id: true,
      tick: true,
      numerator: true,
      denominator: true,
    }),
    device: defineFields<DeviceDTO>({
      id: true,
      typeId: true,
      definitionVersion: true,
      enabled: true,
      parameters: true,
      opaqueState: true,
    }),
  }),
  trackKinds: defineLiterals<TrackDTO['kind']>({
    instrument: true,
    audio: true,
  }),
  clipKinds: defineLiterals<MidiClipDTO['kind']>({
    midi: true,
  }),
  // V1 currently has no optional capability whose presence permits writable opening.
  supportedRequiredFeatures: defineRequiredFeatures({}),
})
