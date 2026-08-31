import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAudioTrackRecord,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
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
  parseTick,
  parseTrackId,
  type DeviceDescriptor,
  type ProjectSnapshot,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import { AudibleMidiCompilerError } from '#internal/compiler/audible-midi-compiler-error'
import {
  AUDIBLE_MIDI_PLAN_STATUS,
  createNoteOccurrenceKey,
} from '#internal/compiler/audible-midi-plan'
import {
  createSampleInstrumentDeviceDescriptor,
  parseSoundbankId,
} from '#internal/sample-instrument-device'
import {
  createAudibleMidiProjectFixture,
  createCompilerFixtureChannel,
  replaceCompilerFixtureSnapshot,
  replaceCompilerFixtureTrackChannel,
} from '#internal/__tests__/support/audible-midi-project-fixture'

function createFixtureDevice(
  id: string,
  typeId: string,
  enabled = true,
  opaqueState: DeviceDescriptor['opaqueState'] = null,
): DeviceDescriptor {
  return createDeviceDescriptor({
    id: parseDeviceId(id),
    typeId: parseDeviceTypeId(typeId),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled,
    parameters: {},
    opaqueState,
  })
}

function createFixtureTrack(id: string, instrumentDeviceId: DeviceDescriptor['id']) {
  return createInstrumentTrackRecord({
    id: parseTrackId(id),
    name: id,
    color: null,
    channel: createCompilerFixtureChannel(1, 0),
    midiEffectIds: [],
    instrumentDeviceId,
    audioEffectIds: [],
  })
}

function diagnosticCodes(plan: ReturnType<typeof compileAudibleMidiProject>) {
  return plan.diagnostics.map(({ code }) => code)
}

describe('Audible MIDI Compiler', () => {
  it('compiles every valid MIDISampleSynth Soundbank into deterministic Track and Note plans', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const firstPlan = compileAudibleMidiProject(snapshot)
    const secondPlan = compileAudibleMidiProject(snapshot)

    expect(firstPlan).toEqual(secondPlan)
    expect(firstPlan).not.toBe(secondPlan)
    expect(firstPlan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE)
    expect(firstPlan.arrangementEndTick).toBe(1_920)
    expect(firstPlan.timelineEndTick).toBe(576_000)
    expect(firstPlan.tracks.map(({ trackId }) => trackId)).toEqual([
      records.alternateTrack.id,
      records.pianoTrack.id,
    ])
    expect(firstPlan.tracks.map(({ instrument }) => instrument)).toEqual([
      {
        deviceId: records.alternateDevice.id,
        kind: 'sample-instrument',
        soundbankId: '12-string-guitar-v2-v4',
      },
      {
        deviceId: records.pianoDevice.id,
        kind: 'sample-instrument',
        soundbankId: 'studio-grand',
      },
    ])
    expect(firstPlan.midiNoteSpans).toEqual([
      {
        occurrenceKey: createNoteOccurrenceKey(
          records.alternateTrack.id,
          records.alternateClip.id,
          records.alternateSource.id,
          records.alternateNotes[0]!.id,
        ),
        trackId: records.alternateTrack.id,
        clipId: records.alternateClip.id,
        sourceId: records.alternateSource.id,
        noteId: records.alternateNotes[0]!.id,
        startTick: 0,
        endTick: 960,
        releaseTick: 960,
        pitch: 55,
        velocity: 110,
        channel: 2,
      },
      {
        occurrenceKey: createNoteOccurrenceKey(
          records.pianoTrack.id,
          records.pianoClip.id,
          records.pianoSource.id,
          records.pianoNotes[1]!.id,
        ),
        trackId: records.pianoTrack.id,
        clipId: records.pianoClip.id,
        sourceId: records.pianoSource.id,
        noteId: records.pianoNotes[1]!.id,
        startTick: 960,
        endTick: 1_440,
        releaseTick: 1_440,
        pitch: 60,
        velocity: 100,
        channel: 0,
      },
      {
        occurrenceKey: createNoteOccurrenceKey(
          records.pianoTrack.id,
          records.pianoClip.id,
          records.pianoSource.id,
          records.pianoNotes[2]!.id,
        ),
        trackId: records.pianoTrack.id,
        clipId: records.pianoClip.id,
        sourceId: records.pianoSource.id,
        noteId: records.pianoNotes[2]!.id,
        startTick: 1_680,
        endTick: 1_920,
        releaseTick: 1_920,
        pitch: 64,
        velocity: 96,
        channel: 1,
      },
    ])
    expect(firstPlan.diagnostics).toEqual([])
    expect(firstPlan.tempoSegments).toHaveLength(1)
    expect(Object.isFrozen(firstPlan)).toBe(true)
    expect(Object.isFrozen(firstPlan.master)).toBe(true)
    expect(Object.isFrozen(firstPlan.tracks)).toBe(true)
    expect(Object.isFrozen(firstPlan.tracks[0])).toBe(true)
    expect(Object.isFrozen(firstPlan.tracks[0]?.instrument)).toBe(true)
    expect(Object.isFrozen(firstPlan.midiNoteSpans)).toBe(true)
    expect(Object.isFrozen(firstPlan.midiNoteSpans[0])).toBe(true)
    expect(Object.isFrozen(firstPlan.diagnostics)).toBe(true)
    expect(Object.isFrozen(firstPlan.tempoSegments)).toBe(true)
  })

  it('produces the same plan when unordered Snapshot collections arrive in reverse order', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const reversedSnapshot = replaceCompilerFixtureSnapshot(snapshot, {
      clips: [...snapshot.clips].reverse(),
      devices: [...snapshot.devices].reverse(),
      midiNotePartitions: [...snapshot.midiNotePartitions]
        .reverse()
        .map((partition) => ({ ...partition, notes: [...partition.notes].reverse() })),
      midiSustainPedalEventPartitions: [...snapshot.midiSustainPedalEventPartitions]
        .reverse()
        .map((partition) => ({ ...partition, events: [...partition.events].reverse() })),
      midiSources: [...snapshot.midiSources].reverse(),
      tracks: [...snapshot.tracks].reverse(),
    })

    expect(compileAudibleMidiProject(reversedSnapshot)).toEqual(compileAudibleMidiProject(snapshot))
  })

  it('derives Track audibility from mute, solo, and Master state without changing Project facts', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const soloedPiano = replaceCompilerFixtureTrackChannel(
      records.pianoTrack,
      createCompilerFixtureChannel(0.8, -0.25, false, true),
    )
    const soloPlan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        tracks: [records.alternateTrack, soloedPiano],
      }),
    )

    expect(soloPlan.tracks.map(({ trackId, audible }) => ({ trackId, audible }))).toEqual([
      { trackId: records.alternateTrack.id, audible: false },
      { trackId: records.pianoTrack.id, audible: true },
    ])
    expect(soloPlan.midiNoteSpans.map(({ trackId }) => trackId)).toEqual([
      records.pianoTrack.id,
      records.pianoTrack.id,
    ])

    const mutedMasterPlan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        master: createMasterChannelRecord({
          gain: snapshot.master.gain,
          muted: true,
          audioEffectIds: [],
        }),
      }),
    )
    expect(mutedMasterPlan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(mutedMasterPlan.tracks.every(({ audible }) => !audible)).toBe(true)
    expect(mutedMasterPlan.midiNoteSpans).toEqual([])
    expect(diagnosticCodes(mutedMasterPlan)).toContain('no-audible-midi-note-spans')
  })

  it('omits muted Track and Clip content while retaining their Arrangement extent', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const mutedAlternateTrack = replaceCompilerFixtureTrackChannel(
      records.alternateTrack,
      createCompilerFixtureChannel(0.6, 0.25, true),
    )
    const mutedPianoClip = createMidiClipRecord({ ...records.pianoClip, muted: true })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [mutedPianoClip, records.alternateClip],
        tracks: [records.pianoTrack, mutedAlternateTrack],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(plan.arrangementEndTick).toBe(1_920)
    expect(plan.midiNoteSpans).toEqual([])
  })

  it('keeps overlapping Clip occurrences on one Track as independent Note Spans', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const overlappingSource = createMidiSourceRecord({
      id: parseMidiSourceId('source-fixture-overlapping'),
      lengthTick: parseTick(480),
    })
    const overlappingClip = createMidiClipRecord({
      id: parseClipId('clip-fixture-overlapping'),
      trackId: records.pianoTrack.id,
      name: 'Overlapping Clip',
      color: null,
      muted: false,
      startTick: parseTick(960),
      spanTick: parseTick(480),
      sourceId: overlappingSource.id,
      sourceOffsetTick: parseTick(0),
      loop: null,
    })
    const overlappingNote = createMidiNoteRecord({
      id: parseNoteId('note-fixture-overlapping'),
      startTick: parseTick(0),
      durationTick: parseTick(480),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [...snapshot.clips, overlappingClip],
        midiSources: [...snapshot.midiSources, overlappingSource],
        midiNotePartitions: [
          ...snapshot.midiNotePartitions,
          Object.freeze({ sourceId: overlappingSource.id, notes: [overlappingNote] }),
        ],
        midiSustainPedalEventPartitions: [
          ...snapshot.midiSustainPedalEventPartitions,
          Object.freeze({ sourceId: overlappingSource.id, events: [] }),
        ],
      }),
    )
    const overlappingSpans = plan.midiNoteSpans.filter(
      ({ trackId, startTick, endTick, pitch }) =>
        trackId === records.pianoTrack.id && startTick === 960 && endTick === 1_440 && pitch === 60,
    )

    expect(overlappingSpans).toHaveLength(2)
    expect(new Set(overlappingSpans.map(({ occurrenceKey }) => occurrenceKey))).toHaveLength(2)
    expect(overlappingSpans.map(({ clipId }) => clipId)).toEqual([
      overlappingClip.id,
      records.pianoClip.id,
    ])
  })

  it('derives channel-local pedal hold without rewriting authored Note Off', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const pedalEvents = [
      createMidiSustainPedalEventRecord({
        id: parseMidiSustainPedalEventId('pedal-before-window-down'),
        tick: parseTick(120),
        value: parseMidiControlValue(127),
        channel: parseMidiChannel(0),
      }),
      createMidiSustainPedalEventRecord({
        id: parseMidiSustainPedalEventId('pedal-channel-one-up'),
        tick: parseTick(720),
        value: parseMidiControlValue(0),
        channel: parseMidiChannel(1),
      }),
      createMidiSustainPedalEventRecord({
        id: parseMidiSustainPedalEventId('pedal-primary-up'),
        tick: parseTick(900),
        value: parseMidiControlValue(0),
        channel: parseMidiChannel(0),
      }),
    ]
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        midiSustainPedalEventPartitions: snapshot.midiSustainPedalEventPartitions.map((partition) =>
          partition.sourceId === records.pianoSource.id
            ? Object.freeze({ sourceId: partition.sourceId, events: pedalEvents })
            : partition,
        ),
      }),
    )
    const primary = plan.midiNoteSpans.find(({ noteId }) => noteId === records.pianoNotes[1]?.id)
    const otherChannel = plan.midiNoteSpans.find(
      ({ noteId }) => noteId === records.pianoNotes[2]?.id,
    )

    expect(primary).toMatchObject({
      channel: 0,
      endTick: 1_440,
      releaseTick: 1_620,
    })
    expect(otherChannel).toMatchObject({
      channel: 1,
      endTick: 1_920,
      releaseTick: 1_920,
    })
  })

  it('applies CC64 at the Note Off Tick before release and caps missing Pedal Up at Clip End', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const sameTickDown = createMidiSustainPedalEventRecord({
      id: parseMidiSustainPedalEventId('pedal-same-tick-down'),
      tick: parseTick(720),
      value: parseMidiControlValue(64),
      channel: parseMidiChannel(0),
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        midiSustainPedalEventPartitions: snapshot.midiSustainPedalEventPartitions.map((partition) =>
          partition.sourceId === records.pianoSource.id
            ? Object.freeze({ sourceId: partition.sourceId, events: [sameTickDown] })
            : partition,
        ),
      }),
    )

    expect(
      plan.midiNoteSpans.find(({ noteId }) => noteId === records.pianoNotes[1]?.id),
    ).toMatchObject({ endTick: 1_440, releaseTick: 1_920 })
  })

  it('fails closed when a forged Snapshot repeats one CC64 Channel and Tick', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const duplicatePositionEvents = ['pedal-duplicate-a', 'pedal-duplicate-b'].map((id) =>
      createMidiSustainPedalEventRecord({
        id: parseMidiSustainPedalEventId(id),
        tick: parseTick(720),
        value: parseMidiControlValue(127),
        channel: parseMidiChannel(0),
      }),
    )

    expect(() =>
      compileAudibleMidiProject(
        replaceCompilerFixtureSnapshot(snapshot, {
          midiSustainPedalEventPartitions: snapshot.midiSustainPedalEventPartitions.map(
            (partition) =>
              partition.sourceId === records.pianoSource.id
                ? Object.freeze({ sourceId: partition.sourceId, events: duplicatePositionEvents })
                : partition,
          ),
        }),
      ),
    ).toThrow(expect.objectContaining({ code: 'duplicate-snapshot-entity' }))
  })

  it('lets every Track Solo fact participate even when the soloed Audio Track is unsupported', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const audioTrack = createAudioTrackRecord({
      id: parseTrackId('track-fixture-audio-solo'),
      name: 'Audio Solo',
      color: null,
      channel: createCompilerFixtureChannel(1, 0, false, true),
      audioEffectIds: [],
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        trackOrder: [...snapshot.trackOrder, audioTrack.id],
        tracks: [...snapshot.tracks, audioTrack],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(plan.tracks.every(({ audible }) => !audible)).toBe(true)
    expect(diagnosticCodes(plan)).toEqual(['audio-track-unsupported', 'no-audible-midi-note-spans'])
  })

  it('skips only engine families and invalid routes that cannot produce a Sample plan', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const unsupportedDevices = [
      createFixtureDevice('device-fm', 'seele.fm-synth'),
      createFixtureDevice('device-va', 'seele.va-synth'),
      createFixtureDevice('device-slot', 'seele.instrument-slot'),
      createFixtureDevice('device-third-party', 'third-party.instrument'),
      createFixtureDevice('device-disabled-sample', 'seele.sample-instrument', false, {
        soundbankId: 'dark-grand-v4',
      }),
      createFixtureDevice('device-invalid-sample', 'seele.sample-instrument', true, {}),
    ]
    const unsupportedTracks = unsupportedDevices.map((device, index) =>
      createFixtureTrack(`track-unsupported-${index}`, device.id),
    )
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        trackOrder: [...snapshot.trackOrder, ...unsupportedTracks.map(({ id }) => id)],
        tracks: [...snapshot.tracks, ...unsupportedTracks],
        devices: [...snapshot.devices, ...unsupportedDevices],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PARTIAL)
    expect(plan.tracks).toHaveLength(2)
    expect(diagnosticCodes(plan)).toEqual([
      'instrument-engine-unsupported',
      'instrument-engine-unsupported',
      'instrument-not-selected',
      'instrument-runtime-missing',
      'instrument-disabled',
      'invalid-sample-instrument-state',
    ])
  })

  it('skips enabled Track effects, ignores disabled effects, and blocks enabled Master effects', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const enabledMidiEffect = createFixtureDevice('device-enabled-midi-effect', 'seele.midi-effect')
    const disabledAudioEffect = createFixtureDevice(
      'device-disabled-audio-effect',
      'seele.audio-effect',
      false,
    )
    const affectedPianoTrack = createInstrumentTrackRecord({
      ...records.pianoTrack,
      midiEffectIds: [enabledMidiEffect.id],
    })
    const unaffectedAlternateTrack = createInstrumentTrackRecord({
      ...records.alternateTrack,
      audioEffectIds: [disabledAudioEffect.id],
    })
    const trackEffectSnapshot = replaceCompilerFixtureSnapshot(snapshot, {
      tracks: [affectedPianoTrack, unaffectedAlternateTrack],
      devices: [...snapshot.devices, enabledMidiEffect, disabledAudioEffect],
    })
    const trackEffectPlan = compileAudibleMidiProject(trackEffectSnapshot)

    expect(trackEffectPlan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PARTIAL)
    expect(trackEffectPlan.tracks.map(({ trackId }) => trackId)).toEqual([
      records.alternateTrack.id,
    ])
    expect(diagnosticCodes(trackEffectPlan)).toEqual(['midi-effect-chain-unsupported'])

    const enabledMasterEffect = createFixtureDevice(
      'device-enabled-master-effect',
      'seele.audio-effect',
    )
    const blockedPlan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        devices: [...snapshot.devices, enabledMasterEffect],
        master: createMasterChannelRecord({
          gain: parseLinearGain(1),
          muted: false,
          audioEffectIds: [enabledMasterEffect.id],
        }),
      }),
    )

    expect(blockedPlan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.BLOCKED)
    expect(blockedPlan.midiNoteSpans).toEqual([])
    expect(blockedPlan.diagnostics).toMatchObject([
      {
        code: 'master-audio-effect-chain-unsupported',
        severity: 'blocking',
        deviceId: enabledMasterEffect.id,
      },
    ])
  })

  it('skips Looped Clips without shrinking the neutral Arrangement extent', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const loopedPianoClip = createMidiClipRecord({
      ...records.pianoClip,
      loop: { sourceStartTick: parseTick(0), sourceSpanTick: parseTick(960) },
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [loopedPianoClip, records.alternateClip],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PARTIAL)
    expect(plan.arrangementEndTick).toBe(1_920)
    expect(plan.midiNoteSpans.map(({ trackId }) => trackId)).toEqual([records.alternateTrack.id])
    expect(diagnosticCodes(plan)).toEqual(['looped-midi-clip-unsupported'])
  })

  it('returns a valid Empty plan rather than throwing when no MIDI Note Span is audible', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [],
        midiSources: [],
        midiNotePartitions: [],
        midiSustainPedalEventPartitions: [],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(plan.arrangementEndTick).toBe(0)
    expect(plan.timelineEndTick).toBe(576_000)
    expect(plan.midiNoteSpans).toEqual([])
    expect(diagnosticCodes(plan)).toEqual(['no-audible-midi-note-spans'])
  })

  it.each([
    [
      'duplicate-snapshot-entity',
      (snapshot: ProjectSnapshot) => ({ tracks: [...snapshot.tracks, snapshot.tracks[0]!] }),
    ],
    [
      'invalid-track-order',
      (snapshot: ProjectSnapshot) => ({ trackOrder: [snapshot.trackOrder[0]!] }),
    ],
    [
      'invalid-snapshot-reference',
      (snapshot: ProjectSnapshot) => ({ devices: snapshot.devices.slice(1) }),
    ],
  ] as const)('fails closed for inconsistent Snapshots with code %s', (code, createOverrides) => {
    const { snapshot } = createAudibleMidiProjectFixture()

    expect(() =>
      compileAudibleMidiProject(
        replaceCompilerFixtureSnapshot(snapshot, createOverrides(snapshot)),
      ),
    ).toThrow(expect.objectContaining({ code }) as AudibleMidiCompilerError)
  })

  it('keeps a 10,000 Note compilation baseline deterministic and complete', () => {
    const { baseSnapshot } = createAudibleMidiProjectFixture()
    const device = createSampleInstrumentDeviceDescriptor(
      parseDeviceId('device-large-fixture'),
      parseSoundbankId('studio-grand'),
    )
    const track = createFixtureTrack('track-large-fixture', device.id)
    const source = createMidiSourceRecord({
      id: parseMidiSourceId('source-large-fixture'),
      lengthTick: parseTick(20_000),
    })
    const clip = createMidiClipRecord({
      id: parseClipId('clip-large-fixture'),
      trackId: track.id,
      name: 'Large Fixture',
      color: null,
      muted: false,
      startTick: parseTick(0),
      spanTick: source.lengthTick,
      sourceId: source.id,
      sourceOffsetTick: parseTick(0),
      loop: null,
    })
    const notes = Object.freeze(
      Array.from({ length: 10_000 }, (_, index) =>
        createMidiNoteRecord({
          id: parseNoteId(`note-large-${index}`),
          startTick: parseTick(index * 2),
          durationTick: parseTick(1),
          pitch: parseMidiPitch(48 + (index % 24)),
          velocity: parseMidiVelocity(100),
          channel: parseMidiChannel(index % 16),
        }),
      ),
    )
    const snapshot = replaceCompilerFixtureSnapshot(baseSnapshot, {
      trackOrder: [track.id],
      tracks: [track],
      clips: [clip],
      midiSources: [source],
      midiNotePartitions: [Object.freeze({ sourceId: source.id, notes })],
      midiSustainPedalEventPartitions: [
        Object.freeze({ sourceId: source.id, events: Object.freeze([]) }),
      ],
      devices: [device],
    })

    const plan = compileAudibleMidiProject(snapshot)

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE)
    expect(plan.midiNoteSpans).toHaveLength(10_000)
    expect(plan.midiNoteSpans[0]?.startTick).toBe(0)
    expect(plan.midiNoteSpans.at(-1)?.endTick).toBe(19_999)
  })
})
