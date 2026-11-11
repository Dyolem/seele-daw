import {
  DEVICE_DEFINITION_VERSION_MIN,
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
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import {
  AUDIBLE_MIDI_PLAN_STATUS,
  createNoteOccurrenceKey,
} from '#internal/compiler/audible-midi-plan'
import {
  createSampleInstrumentDeviceDescriptor,
  parseSoundbankId,
} from '#internal/device/sample-instrument-device'
import {
  createAudibleMidiProjectFixture,
  createCompilerFixtureChannel,
  replaceCompilerFixtureSnapshot,
  replaceCompilerFixtureTrackChannel,
} from '#internal/__tests__/support/audible-midi-project-fixture'
import { planSpans } from '#internal/__tests__/support/plan-spans'

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
    instrumentDeviceId,
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
    expect(firstPlan.tracks.map(({ gain, pan }) => ({ gain, pan }))).toEqual([
      { gain: 0.6, pan: 0.25 },
      { gain: 0.8, pan: -0.25 },
    ])
    expect(planSpans(firstPlan)).toEqual([
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
    expect([...firstPlan.clipSpans.values()].every((spans) => Object.isFrozen(spans))).toBe(true)
    expect(Object.isFrozen(planSpans(firstPlan)[0])).toBe(true)
    expect(Object.isFrozen(firstPlan.diagnostics)).toBe(true)
    expect(Object.isFrozen(firstPlan.tempoSegments)).toBe(true)
  })

  it('produces the same plan when unordered Snapshot collections arrive in reverse order', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const reversedSnapshot = replaceCompilerFixtureSnapshot(snapshot, {
      clips: [...snapshot.clips].reverse(),
      devices: [...snapshot.devices].reverse(),
      midiNotes: Object.fromEntries(
        Object.entries(snapshot.midiNotes)
          .reverse()
          .map(([sourceId, notes]) => [sourceId, [...notes].reverse()]),
      ),
      midiSustainPedalEvents: Object.fromEntries(
        Object.entries(snapshot.midiSustainPedalEvents)
          .reverse()
          .map(([sourceId, events]) => [sourceId, [...events].reverse()]),
      ),
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
    expect(planSpans(soloPlan).map(({ trackId }) => trackId)).toEqual([
      records.pianoTrack.id,
      records.pianoTrack.id,
    ])

    const mutedMasterPlan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        master: createMasterChannelRecord({
          gain: snapshot.master.gain,
          muted: true,
        }),
      }),
    )
    expect(mutedMasterPlan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(mutedMasterPlan.tracks.every(({ audible }) => !audible)).toBe(true)
    expect(planSpans(mutedMasterPlan)).toEqual([])
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
    expect(planSpans(plan)).toEqual([])
  })

  it('compiles again only the Clips whose Source changed, with the result of a full compile', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const before = compileAudibleMidiProject(snapshot)
    const primary = records.pianoNotes.find(({ id }) => id === 'note-piano-primary')
    if (primary === undefined) throw new Error('Expected the primary piano Note')
    const moved = createMidiNoteRecord({
      ...primary,
      startTick: parseTick(primary.startTick + 240),
    })
    const edited = replaceCompilerFixtureSnapshot(snapshot, {
      midiNotes: {
        ...snapshot.midiNotes,
        [records.pianoSource.id]: records.pianoNotes.map((note) =>
          note === primary ? moved : note,
        ),
      },
    })

    const after = compileAudibleMidiProject(edited)

    expect(after.clipSpans.get(records.alternateClip.id)).toBe(
      before.clipSpans.get(records.alternateClip.id),
    )
    expect(after.clipSpans.get(records.pianoClip.id)).not.toBe(
      before.clipSpans.get(records.pianoClip.id),
    )
    const spanOf = (plan: typeof before) =>
      plan.clipSpans.get(records.pianoClip.id)?.find(({ noteId }) => noteId === primary.id)
    expect((spanOf(after)?.startTick ?? 0) - (spanOf(before)?.startTick ?? 0)).toBe(240)
    // Fresh objects share nothing with earlier compiles, so this is the plan compiled from scratch.
    expect(after).toEqual(compileAudibleMidiProject(structuredClone(edited)))
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
        midiNotes: { ...snapshot.midiNotes, [overlappingSource.id]: [overlappingNote] },
        midiSustainPedalEvents: { ...snapshot.midiSustainPedalEvents, [overlappingSource.id]: [] },
      }),
    )
    const overlappingSpans = planSpans(plan).filter(
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
        midiSustainPedalEvents: {
          ...snapshot.midiSustainPedalEvents,
          [records.pianoSource.id]: pedalEvents,
        },
      }),
    )
    const primary = planSpans(plan).find(({ noteId }) => noteId === records.pianoNotes[1]?.id)
    const otherChannel = planSpans(plan).find(({ noteId }) => noteId === records.pianoNotes[2]?.id)

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

  it('applies same-Tick CC64 before Note Off and caps its Gate at Clip End, not Timeline End', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const sameTickDown = createMidiSustainPedalEventRecord({
      id: parseMidiSustainPedalEventId('pedal-same-tick-down'),
      tick: parseTick(720),
      value: parseMidiControlValue(64),
      channel: parseMidiChannel(0),
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        midiSustainPedalEvents: {
          ...snapshot.midiSustainPedalEvents,
          [records.pianoSource.id]: [sameTickDown],
        },
      }),
    )

    const pedalHeldSpan = planSpans(plan).find(({ noteId }) => noteId === records.pianoNotes[1]?.id)
    const clipEndTick = parseTick(records.pianoClip.startTick + records.pianoClip.spanTick)

    expect(clipEndTick).toBe(1_920)
    expect(plan.arrangementEndTick).toBe(clipEndTick)
    expect(plan.timelineEndTick).toBe(576_000)
    expect(pedalHeldSpan).toMatchObject({ endTick: 1_440, releaseTick: 1_920 })
    expect(pedalHeldSpan?.releaseTick).toBe(clipEndTick)
    expect(pedalHeldSpan?.releaseTick).toBeLessThan(plan.timelineEndTick)
  })

  it('lets a soloed Track silence the others even when its own instrument cannot play', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const device = createFixtureDevice('device-solo-third-party', 'third-party.instrument')
    const soloTrack = createInstrumentTrackRecord({
      id: parseTrackId('track-fixture-solo'),
      name: 'Solo',
      color: null,
      channel: createCompilerFixtureChannel(1, 0, false, true),
      instrumentDeviceId: device.id,
    })
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        devices: [...snapshot.devices, device],
        trackOrder: [...snapshot.trackOrder, soloTrack.id],
        tracks: [...snapshot.tracks, soloTrack],
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(plan.tracks.every(({ audible }) => !audible)).toBe(true)
    expect(diagnosticCodes(plan)).toEqual([
      'instrument-runtime-missing',
      'no-audible-midi-note-spans',
    ])
  })

  it('skips routes that cannot produce a Sample plan', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const unsupportedDevices = [
      createFixtureDevice('device-third-party', 'third-party.instrument'),
      createFixtureDevice('device-program-placeholder', 'seele.midi-program-placeholder', true, {
        channel: 2,
        programNumber: 80,
      }),
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
      'instrument-runtime-missing',
      'instrument-runtime-missing',
      'instrument-disabled',
      'invalid-sample-instrument-state',
    ])
  })

  it('returns a valid Empty plan rather than throwing when no MIDI Note Span is audible', () => {
    const { snapshot } = createAudibleMidiProjectFixture()
    const plan = compileAudibleMidiProject(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [],
        midiSources: [],
        midiNotes: {},
        midiSustainPedalEvents: {},
      }),
    )

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.EMPTY)
    expect(plan.arrangementEndTick).toBe(0)
    expect(plan.timelineEndTick).toBe(576_000)
    expect(planSpans(plan)).toEqual([])
    expect(diagnosticCodes(plan)).toEqual(['no-audible-midi-note-spans'])
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
      midiNotes: { [source.id]: notes },
      midiSustainPedalEvents: { [source.id]: [] },
      devices: [device],
    })

    const plan = compileAudibleMidiProject(snapshot)

    expect(plan.status).toBe(AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE)
    expect(planSpans(plan)).toHaveLength(10_000)
    expect(planSpans(plan)[0]?.startTick).toBe(0)
    expect(planSpans(plan).at(-1)?.endTick).toBe(19_999)
  })
})
