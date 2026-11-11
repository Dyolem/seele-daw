import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
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
  type MidiSustainPedalEventId,
  type MidiSustainPedalEventRecord,
  type NoteId,
  type TempoEventId,
  type TempoEventRecord,
  type TimeSignatureEventId,
  type TimeSignatureEventRecord,
  type TrackId,
  type TrackRecord,
} from '#internal/index'
import type { ModelStoreSeed } from '#internal/model/model-store'

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
 * containers. Test support may deliberately corrupt them without leaking state.
 */
export function createCompleteProjectFixture() {
  const project = createProjectRecord({
    id: parseProjectId('project-complete-fixture'),
    name: 'Complete Project Fixture',
  })

  const instrumentDevice = createFixtureDevice('device-instrument', 'seele.fixture.instrument')
  const bassDevice = createFixtureDevice('device-bass', 'seele.fixture.instrument')

  const instrumentTrack = createInstrumentTrackRecord({
    id: parseTrackId('track-instrument'),
    name: 'Fixture Instrument',
    color: null,
    channel: createChannelInput(0.8, -0.1),
    instrumentDeviceId: instrumentDevice.id,
  })
  const bassTrack = createInstrumentTrackRecord({
    id: parseTrackId('track-bass'),
    name: 'Fixture Bass',
    color: null,
    channel: createChannelInput(0.9, 0.1),
    instrumentDeviceId: bassDevice.id,
  })

  const verseSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-verse'),
    lengthTick: parseTick(1_920),
  })
  const chorusSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-chorus'),
    lengthTick: parseTick(4_080),
  })
  const verseNote = createMidiNoteRecord({
    id: parseNoteId('note-verse-primary'),
    startTick: parseTick(240),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(60),
    velocity: parseMidiVelocity(100),
    channel: parseMidiChannel(0),
  })
  const verseHarmonyNote = createMidiNoteRecord({
    id: parseNoteId('note-verse-harmony'),
    startTick: parseTick(720),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(64),
    velocity: parseMidiVelocity(96),
    channel: parseMidiChannel(0),
  })
  const chorusNote = createMidiNoteRecord({
    id: parseNoteId('note-chorus-primary'),
    startTick: parseTick(0),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(67),
    velocity: parseMidiVelocity(108),
    channel: parseMidiChannel(1),
  })
  const chorusHarmonyNote = createMidiNoteRecord({
    id: parseNoteId('note-chorus-harmony'),
    startTick: parseTick(480),
    durationTick: parseTick(480),
    pitch: parseMidiPitch(71),
    velocity: parseMidiVelocity(92),
    channel: parseMidiChannel(1),
  })
  const versePedalDown = createMidiSustainPedalEventRecord({
    id: parseMidiSustainPedalEventId('sustain-verse-down'),
    tick: parseTick(360),
    value: parseMidiControlValue(127),
    channel: parseMidiChannel(0),
  })
  const versePedalUp = createMidiSustainPedalEventRecord({
    id: parseMidiSustainPedalEventId('sustain-verse-up'),
    tick: parseTick(900),
    value: parseMidiControlValue(0),
    channel: parseMidiChannel(0),
  })
  const chorusPedalDown = createMidiSustainPedalEventRecord({
    id: parseMidiSustainPedalEventId('sustain-chorus-down'),
    tick: parseTick(120),
    value: parseMidiControlValue(100),
    channel: parseMidiChannel(1),
  })
  const chorusPedalUp = createMidiSustainPedalEventRecord({
    id: parseMidiSustainPedalEventId('sustain-chorus-up'),
    tick: parseTick(840),
    value: parseMidiControlValue(32),
    channel: parseMidiChannel(1),
  })

  const verseClip = createMidiClipRecord({
    id: parseClipId('clip-verse'),
    trackId: instrumentTrack.id,
    name: 'Fixture Verse',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(960),
    sourceId: verseSource.id,
    sourceOffsetTick: parseTick(240),
  })
  const chorusClip = createMidiClipRecord({
    id: parseClipId('clip-chorus'),
    trackId: instrumentTrack.id,
    name: 'Fixture Chorus',
    color: null,
    muted: false,
    startTick: parseTick(1_920),
    spanTick: parseTick(3_840),
    sourceId: chorusSource.id,
    sourceOffsetTick: parseTick(240),
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
  })

  const trackOrder = [instrumentTrack.id, bassTrack.id]
  const tracks = new Map<TrackId, TrackRecord>([
    [instrumentTrack.id, instrumentTrack],
    [bassTrack.id, bassTrack],
  ])
  const clips = new Map<ClipId, ClipRecord>([
    [verseClip.id, verseClip],
    [chorusClip.id, chorusClip],
  ])
  const midiSources = new Map<MidiSourceId, MidiSourceRecord>([
    [verseSource.id, verseSource],
    [chorusSource.id, chorusSource],
  ])
  const verseNotePartition = new Map<NoteId, MidiNoteRecord>([
    [verseNote.id, verseNote],
    [verseHarmonyNote.id, verseHarmonyNote],
  ])
  const chorusNotePartition = new Map<NoteId, MidiNoteRecord>([
    [chorusNote.id, chorusNote],
    [chorusHarmonyNote.id, chorusHarmonyNote],
  ])
  const midiNotes = new Map<MidiSourceId, Map<NoteId, MidiNoteRecord>>([
    [verseSource.id, verseNotePartition],
    [chorusSource.id, chorusNotePartition],
  ])
  const verseSustainPedalEventPartition = new Map<
    MidiSustainPedalEventId,
    MidiSustainPedalEventRecord
  >([
    [versePedalDown.id, versePedalDown],
    [versePedalUp.id, versePedalUp],
  ])
  const chorusSustainPedalEventPartition = new Map<
    MidiSustainPedalEventId,
    MidiSustainPedalEventRecord
  >([
    [chorusPedalDown.id, chorusPedalDown],
    [chorusPedalUp.id, chorusPedalUp],
  ])
  const midiSustainPedalEvents = new Map<
    MidiSourceId,
    Map<MidiSustainPedalEventId, MidiSustainPedalEventRecord>
  >([
    [verseSource.id, verseSustainPedalEventPartition],
    [chorusSource.id, chorusSustainPedalEventPartition],
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
    [instrumentDevice.id, instrumentDevice],
    [bassDevice.id, bassDevice],
  ])

  const seed = {
    project,
    trackOrder,
    tracks,
    clips,
    midiSources,
    midiNotes,
    midiSustainPedalEvents,
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
      bassTrack,
      verseClip,
      chorusClip,
      verseSource,
      chorusSource,
      verseNote,
      verseHarmonyNote,
      chorusNote,
      chorusHarmonyNote,
      versePedalDown,
      versePedalUp,
      chorusPedalDown,
      chorusPedalUp,
      initialTempoEvent,
      laterTempoEvent,
      initialTimeSignatureEvent,
      laterTimeSignatureEvent,
      instrumentDevice,
      bassDevice,
      master,
    },
    containers: {
      trackOrder,
      tracks,
      clips,
      midiSources,
      verseNotePartition,
      chorusNotePartition,
      midiNotes,
      verseSustainPedalEventPartition,
      chorusSustainPedalEventPartition,
      midiSustainPedalEvents,
      tempoEvents,
      timeSignatureEvents,
      devices,
    },
  }
}

export type CompleteProjectFixture = ReturnType<typeof createCompleteProjectFixture>
