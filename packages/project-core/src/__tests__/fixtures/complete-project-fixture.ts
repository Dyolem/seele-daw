import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
  parseTrackId,
  type ClipId,
  type ClipRecord,
  type DeviceDescriptor,
  type DeviceId,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type NoteId,
  type TempoEventId,
  type TempoEventRecord,
  type TimeSignatureEventId,
  type TimeSignatureEventRecord,
  type TrackId,
  type TrackRecord,
} from '../..'
import type { ModelStoreSeed } from '../../model/model-store'

function createChannelInput(gain: number, pan: number) {
  return {
    gain: parseLinearGain(gain),
    pan: parseBipolarValue(pan),
    muted: false,
    soloed: false,
  }
}

function createFixtureDevice(id: string, typeId: string): DeviceDescriptor {
  return createDeviceDescriptor({
    id: parseDeviceId(id),
    typeId: parseDeviceTypeId(typeId),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: null,
  })
}

/**
 * Creates a complete valid project graph with deterministic values and fresh mutable
 * containers. Tests may deliberately corrupt the containers without leaking state.
 */
export function createCompleteProjectFixture() {
  const project = createProjectRecord({
    id: parseProjectId('project-complete-fixture'),
    name: 'Complete Project Fixture',
  })

  const midiEffectDevice = createFixtureDevice(
    'device-instrument-midi-effect',
    'seele.fixture.midi-effect',
  )
  const instrumentDevice = createFixtureDevice('device-instrument', 'seele.fixture.instrument')
  const instrumentAudioEffectDevice = createFixtureDevice(
    'device-instrument-audio-effect',
    'seele.fixture.audio-effect',
  )
  const audioTrackAudioEffectDevice = createFixtureDevice(
    'device-audio-track-effect',
    'seele.fixture.audio-effect',
  )
  const masterAudioEffectDevice = createFixtureDevice(
    'device-master-effect',
    'seele.fixture.audio-effect',
  )

  const instrumentTrack = createInstrumentTrackRecord({
    id: parseTrackId('track-instrument'),
    name: 'Fixture Instrument',
    color: null,
    channel: createChannelInput(0.8, -0.1),
    midiEffectIds: [midiEffectDevice.id],
    instrumentDeviceId: instrumentDevice.id,
    audioEffectIds: [instrumentAudioEffectDevice.id],
  })
  const audioTrack = createAudioTrackRecord({
    id: parseTrackId('track-audio'),
    name: 'Fixture Audio',
    color: null,
    channel: createChannelInput(0.9, 0.1),
    audioEffectIds: [audioTrackAudioEffectDevice.id],
  })

  const nonLoopSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-non-loop'),
    lengthTick: parseTick(1_920),
  })
  const loopingSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-looping'),
    lengthTick: parseTick(1_920),
  })
  const nonLoopNote = createMidiNoteRecord({
    id: parseNoteId('note-non-loop-primary'),
    startTick: parseTick(240),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(60),
    velocity: parseMidiVelocity(100),
    channel: parseMidiChannel(0),
  })
  const nonLoopHarmonyNote = createMidiNoteRecord({
    id: parseNoteId('note-non-loop-harmony'),
    startTick: parseTick(720),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(64),
    velocity: parseMidiVelocity(96),
    channel: parseMidiChannel(0),
  })
  const loopingNote = createMidiNoteRecord({
    id: parseNoteId('note-looping-primary'),
    startTick: parseTick(0),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(67),
    velocity: parseMidiVelocity(108),
    channel: parseMidiChannel(1),
  })
  const loopingHarmonyNote = createMidiNoteRecord({
    id: parseNoteId('note-looping-harmony'),
    startTick: parseTick(480),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(71),
    velocity: parseMidiVelocity(92),
    channel: parseMidiChannel(1),
  })

  const nonLoopClip = createMidiClipRecord({
    id: parseClipId('clip-non-loop'),
    trackId: instrumentTrack.id,
    name: 'Fixture Verse',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(960),
    sourceId: nonLoopSource.id,
    sourceOffsetTick: parseTick(240),
    loop: null,
  })
  const loopingClip = createMidiClipRecord({
    id: parseClipId('clip-looping'),
    trackId: instrumentTrack.id,
    name: 'Fixture Loop',
    color: null,
    muted: false,
    startTick: parseTick(1_920),
    spanTick: parseTick(3_840),
    sourceId: loopingSource.id,
    sourceOffsetTick: parseTick(240),
    loop: {
      sourceStartTick: parseTick(0),
      sourceSpanTick: parseTick(960),
    },
  })

  const initialTempoEvent = createTempoEventRecord({
    id: parseTempoEventId('tempo-initial'),
    tick: parseTick(0),
    bpm: parseTempoBpm(120),
  })
  const laterTempoEvent = createTempoEventRecord({
    id: parseTempoEventId('tempo-later'),
    tick: parseTick(3_840),
    bpm: parseTempoBpm(128),
  })
  const initialTimeSignatureEvent = createTimeSignatureEventRecord({
    id: parseTimeSignatureEventId('time-signature-initial'),
    tick: parseTick(0),
    numerator: parseTimeSignatureNumerator(4),
    denominator: parseTimeSignatureDenominator(4),
  })
  const laterTimeSignatureEvent = createTimeSignatureEventRecord({
    id: parseTimeSignatureEventId('time-signature-later'),
    tick: parseTick(7_680),
    numerator: parseTimeSignatureNumerator(3),
    denominator: parseTimeSignatureDenominator(4),
  })
  const master = createMasterChannelRecord({
    gain: parseLinearGain(1),
    muted: false,
    audioEffectIds: [masterAudioEffectDevice.id],
  })

  const trackOrder = [instrumentTrack.id, audioTrack.id]
  const tracks = new Map<TrackId, TrackRecord>([
    [instrumentTrack.id, instrumentTrack],
    [audioTrack.id, audioTrack],
  ])
  const clips = new Map<ClipId, ClipRecord>([
    [nonLoopClip.id, nonLoopClip],
    [loopingClip.id, loopingClip],
  ])
  const midiSources = new Map<MidiSourceId, MidiSourceRecord>([
    [nonLoopSource.id, nonLoopSource],
    [loopingSource.id, loopingSource],
  ])
  const nonLoopNotePartition = new Map<NoteId, MidiNoteRecord>([
    [nonLoopNote.id, nonLoopNote],
    [nonLoopHarmonyNote.id, nonLoopHarmonyNote],
  ])
  const loopingNotePartition = new Map<NoteId, MidiNoteRecord>([
    [loopingNote.id, loopingNote],
    [loopingHarmonyNote.id, loopingHarmonyNote],
  ])
  const midiNotesBySource = new Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>([
    [nonLoopSource.id, nonLoopNotePartition],
    [loopingSource.id, loopingNotePartition],
  ])
  const tempoEvents = new Map<TempoEventId, TempoEventRecord>([
    [initialTempoEvent.id, initialTempoEvent],
    [laterTempoEvent.id, laterTempoEvent],
  ])
  const timeSignatureEvents = new Map<TimeSignatureEventId, TimeSignatureEventRecord>([
    [initialTimeSignatureEvent.id, initialTimeSignatureEvent],
    [laterTimeSignatureEvent.id, laterTimeSignatureEvent],
  ])
  const devices = new Map<DeviceId, DeviceDescriptor>([
    [midiEffectDevice.id, midiEffectDevice],
    [instrumentDevice.id, instrumentDevice],
    [instrumentAudioEffectDevice.id, instrumentAudioEffectDevice],
    [audioTrackAudioEffectDevice.id, audioTrackAudioEffectDevice],
    [masterAudioEffectDevice.id, masterAudioEffectDevice],
  ])

  const seed = {
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
  } satisfies ModelStoreSeed

  return {
    seed,
    records: {
      project,
      instrumentTrack,
      audioTrack,
      nonLoopClip,
      loopingClip,
      nonLoopSource,
      loopingSource,
      nonLoopNote,
      nonLoopHarmonyNote,
      loopingNote,
      loopingHarmonyNote,
      initialTempoEvent,
      laterTempoEvent,
      initialTimeSignatureEvent,
      laterTimeSignatureEvent,
      midiEffectDevice,
      instrumentDevice,
      instrumentAudioEffectDevice,
      audioTrackAudioEffectDevice,
      masterAudioEffectDevice,
      master,
    },
    containers: {
      trackOrder,
      tracks,
      clips,
      midiSources,
      nonLoopNotePartition,
      loopingNotePartition,
      midiNotesBySource,
      tempoEvents,
      timeSignatureEvents,
      devices,
    },
  }
}

export type CompleteProjectFixture = ReturnType<typeof createCompleteProjectFixture>
