import {
  createChannelStripDescriptor,
  createInitialProjectSession,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type InstrumentTrackRecord,
  type ProjectSnapshot,
} from '@seele-daw/project-core'

import {
  createSampleInstrumentDeviceDescriptor,
  parseSoundbankId,
} from '#internal/sample-instrument-device'

export function createCompilerFixtureChannel(
  gain: number,
  pan: number,
  muted = false,
  soloed = false,
) {
  return createChannelStripDescriptor({
    gain: parseLinearGain(gain),
    muted,
    pan: parseBipolarValue(pan),
    soloed,
  })
}

export function replaceCompilerFixtureTrackChannel(
  track: InstrumentTrackRecord,
  channel: InstrumentTrackRecord['channel'],
): InstrumentTrackRecord {
  return createInstrumentTrackRecord({ ...track, channel })
}

export function replaceCompilerFixtureSnapshot(
  snapshot: ProjectSnapshot,
  overrides: Partial<ProjectSnapshot>,
): ProjectSnapshot {
  return Object.freeze({ ...snapshot, ...overrides })
}

export function createAudibleMidiProjectFixture() {
  const baseSnapshot = createInitialProjectSession({
    projectId: parseProjectId('project-playback-compiler'),
    projectName: 'Playback Compiler Fixture',
    tempoEventId: parseTempoEventId('tempo-playback-compiler'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-compiler'),
  }).getSnapshot()

  const pianoDevice = createSampleInstrumentDeviceDescriptor(
    parseDeviceId('device-fixture-piano'),
    parseSoundbankId('studio-grand'),
  )
  const alternateDevice = createSampleInstrumentDeviceDescriptor(
    parseDeviceId('device-fixture-alternate'),
    parseSoundbankId('12-string-guitar-v2-v4'),
  )
  const pianoTrack = createInstrumentTrackRecord({
    id: parseTrackId('track-fixture-piano'),
    name: 'Piano',
    color: null,
    channel: createCompilerFixtureChannel(0.8, -0.25),
    midiEffectIds: [],
    instrumentDeviceId: pianoDevice.id,
    audioEffectIds: [],
  })
  const alternateTrack = createInstrumentTrackRecord({
    id: parseTrackId('track-fixture-alternate'),
    name: 'Alternate Sample Instrument',
    color: null,
    channel: createCompilerFixtureChannel(0.6, 0.25),
    midiEffectIds: [],
    instrumentDeviceId: alternateDevice.id,
    audioEffectIds: [],
  })

  const pianoSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-fixture-piano'),
    lengthTick: parseTick(1_920),
  })
  const alternateSource = createMidiSourceRecord({
    id: parseMidiSourceId('source-fixture-alternate'),
    lengthTick: parseTick(960),
  })
  const pianoClip = createMidiClipRecord({
    id: parseClipId('clip-fixture-piano'),
    trackId: pianoTrack.id,
    name: 'Piano Clip',
    color: null,
    muted: false,
    startTick: parseTick(960),
    spanTick: parseTick(960),
    sourceId: pianoSource.id,
    sourceOffsetTick: parseTick(240),
    loop: null,
  })
  const alternateClip = createMidiClipRecord({
    id: parseClipId('clip-fixture-alternate'),
    trackId: alternateTrack.id,
    name: 'Alternate Clip',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parseTick(960),
    sourceId: alternateSource.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })

  const pianoNotes = Object.freeze([
    createMidiNoteRecord({
      id: parseNoteId('note-piano-before-window'),
      startTick: parseTick(0),
      durationTick: parseTick(480),
      pitch: parseMidiPitch(57),
      velocity: parseMidiVelocity(80),
      channel: parseMidiChannel(0),
    }),
    createMidiNoteRecord({
      id: parseNoteId('note-piano-primary'),
      startTick: parseTick(240),
      durationTick: parseTick(480),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
    createMidiNoteRecord({
      id: parseNoteId('note-piano-clipped'),
      startTick: parseTick(960),
      durationTick: parseTick(600),
      pitch: parseMidiPitch(64),
      velocity: parseMidiVelocity(96),
      channel: parseMidiChannel(1),
    }),
    createMidiNoteRecord({
      id: parseNoteId('note-piano-at-window-end'),
      startTick: parseTick(1_200),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(67),
      velocity: parseMidiVelocity(88),
      channel: parseMidiChannel(0),
    }),
  ])
  const alternateNotes = Object.freeze([
    createMidiNoteRecord({
      id: parseNoteId('note-alternate-primary'),
      startTick: parseTick(0),
      durationTick: parseTick(960),
      pitch: parseMidiPitch(55),
      velocity: parseMidiVelocity(110),
      channel: parseMidiChannel(2),
    }),
  ])

  const snapshot = Object.freeze<ProjectSnapshot>({
    ...baseSnapshot,
    trackOrder: Object.freeze([alternateTrack.id, pianoTrack.id]),
    tracks: Object.freeze([pianoTrack, alternateTrack]),
    clips: Object.freeze([pianoClip, alternateClip]),
    midiSources: Object.freeze([pianoSource, alternateSource]),
    midiNotePartitions: Object.freeze([
      Object.freeze({ sourceId: pianoSource.id, notes: pianoNotes }),
      Object.freeze({ sourceId: alternateSource.id, notes: alternateNotes }),
    ]),
    devices: Object.freeze([pianoDevice, alternateDevice]),
  })

  return {
    baseSnapshot,
    snapshot,
    records: {
      alternateClip,
      alternateDevice,
      alternateNotes,
      alternateSource,
      alternateTrack,
      pianoClip,
      pianoDevice,
      pianoNotes,
      pianoSource,
      pianoTrack,
    },
  }
}
