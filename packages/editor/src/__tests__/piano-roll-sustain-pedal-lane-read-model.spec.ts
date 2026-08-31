import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddMidiClipCommand,
  createAddMidiSustainPedalEventCommand,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseTick,
  type MidiSourceId,
  type ProjectCommand,
  type ProjectSession,
  type ProjectSnapshot,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_TRACK_CLIP_STATUS,
  PianoRollError,
  createPianoRollSustainPedalClipLaneReadModel,
  createPianoRollTrackSustainPedalLaneReadModel,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

function executeCommitted(session: ProjectSession, command: ProjectCommand): void {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error(`Expected ${command.type} to commit`)
  }
}

function addSustainPedalEvent(
  session: ProjectSession,
  sourceId: MidiSourceId,
  input: {
    readonly channel?: number
    readonly id: string
    readonly tick: number
    readonly value: number
  },
): void {
  executeCommitted(
    session,
    createAddMidiSustainPedalEventCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(input.channel ?? 0),
      eventId: parseMidiSustainPedalEventId(input.id),
      sourceId,
      tick: parseTick(input.tick),
      value: parseMidiControlValue(input.value),
    }),
  )
}

function populateClipLaneFixture() {
  const fixture = createPianoRollProjectFixture()
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    id: 'cc64-leading-down',
    tick: 240,
    value: 127,
  })
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    channel: 1,
    id: 'cc64-other-channel',
    tick: 480,
    value: 64,
  })
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    id: 'cc64-window-start',
    tick: 480,
    value: 96,
  })
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    id: 'cc64-window-middle',
    tick: 1_200,
    value: 0,
  })
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    id: 'cc64-window-terminal',
    tick: 2_400,
    value: 127,
  })
  addSustainPedalEvent(fixture.session, fixture.source.id, {
    id: 'cc64-after-window',
    tick: 2_880,
    value: 64,
  })
  return fixture
}

function requirePianoRollError(operation: () => unknown): PianoRollError {
  let caught: unknown
  try {
    operation()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(PianoRollError)
  if (!(caught instanceof PianoRollError)) throw new Error('Expected PianoRollError')
  return caught
}

describe('Piano Roll Sustain Pedal Clip Lane Read Model', () => {
  it('chases the prior channel state and derives Clip-local CC64 Step segments', () => {
    const fixture = populateClipLaneFixture()
    const model = createPianoRollSustainPedalClipLaneReadModel({
      channel: parseMidiChannel(0),
      context: fixture.context,
      snapshot: fixture.session.getSnapshot(),
    })

    expect(model).toMatchObject({
      channel: 0,
      clipId: fixture.clip.id,
      initialPedalDown: true,
      initialValue: 127,
      sourceId: fixture.source.id,
    })
    expect(
      model.events.map(({ affectsPlayback, event, pedalDown, timelineTick }) => ({
        affectsPlayback,
        eventId: event.id,
        pedalDown,
        timelineTick,
        value: event.value,
      })),
    ).toEqual([
      {
        affectsPlayback: true,
        eventId: 'cc64-window-start',
        pedalDown: true,
        timelineTick: 0,
        value: 96,
      },
      {
        affectsPlayback: true,
        eventId: 'cc64-window-middle',
        pedalDown: false,
        timelineTick: 720,
        value: 0,
      },
      {
        affectsPlayback: false,
        eventId: 'cc64-window-terminal',
        pedalDown: true,
        timelineTick: 1_920,
        value: 127,
      },
    ])
    expect(model.segments).toEqual([
      { endTick: 720, pedalDown: true, startTick: 0, value: 96 },
      { endTick: 1_920, pedalDown: false, startTick: 720, value: 0 },
    ])
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.events)).toBe(true)
    expect(Object.isFrozen(model.events[0])).toBe(true)
    expect(Object.isFrozen(model.segments)).toBe(true)
  })

  it('requires the selected channel and does not leak events across it', () => {
    const fixture = populateClipLaneFixture()
    const model = createPianoRollSustainPedalClipLaneReadModel({
      channel: parseMidiChannel(1),
      context: fixture.context,
      snapshot: fixture.session.getSnapshot(),
    })

    expect(model.initialValue).toBe(0)
    expect(model.events.map(({ event }) => event.id)).toEqual(['cc64-other-channel'])
    expect(model.segments).toEqual([{ endTick: 1_920, pedalDown: true, startTick: 0, value: 64 }])
  })

  it('fails closed when a forged Snapshot omits the source CC64 partition', () => {
    const fixture = createPianoRollProjectFixture()
    const snapshot = fixture.session.getSnapshot()
    const forgedSnapshot: ProjectSnapshot = Object.freeze({
      ...snapshot,
      midiSustainPedalEventPartitions: Object.freeze([]),
    })

    expect(
      requirePianoRollError(() =>
        createPianoRollSustainPedalClipLaneReadModel({
          channel: parseMidiChannel(0),
          context: fixture.context,
          snapshot: forgedSnapshot,
        }),
      ).code,
    ).toBe('sustain-pedal-partition-missing')
  })
})

describe('Piano Roll Sustain Pedal Track Lane Read Model', () => {
  it('projects ready Clips into global time and preserves looped-Clip unsupported status', () => {
    const fixture = createPianoRollProjectFixture()
    const loopedClipId = parseClipId('cc64-looped-clip')
    const loopedSourceId = parseMidiSourceId('cc64-looped-source')
    executeCommitted(
      fixture.session,
      createAddMidiClipCommand({
        baseRevision: fixture.session.modelRevision,
        clipId: loopedClipId,
        color: null,
        loop: {
          sourceSpanTick: parseTick(1_920),
          sourceStartTick: parseTick(0),
        },
        muted: false,
        name: 'Looped CC64 Clip',
        sourceId: loopedSourceId,
        sourceLengthTick: parseTick(3_840),
        sourceOffsetTick: parseTick(0),
        spanTick: parseTick(1_920),
        startTick: parseTick(3_840),
        trackId: fixture.clip.trackId,
      }),
    )

    const laterClipId = parseClipId('cc64-later-clip')
    const laterSourceId = parseMidiSourceId('cc64-later-source')
    executeCommitted(
      fixture.session,
      createAddMidiClipCommand({
        baseRevision: fixture.session.modelRevision,
        clipId: laterClipId,
        color: null,
        loop: null,
        muted: false,
        name: 'Later CC64 Clip',
        sourceId: laterSourceId,
        sourceLengthTick: parseTick(3_840),
        sourceOffsetTick: parseTick(480),
        spanTick: parseTick(1_920),
        startTick: parseTick(7_680),
        trackId: fixture.clip.trackId,
      }),
    )
    addSustainPedalEvent(fixture.session, laterSourceId, {
      id: 'cc64-later-down',
      tick: 960,
      value: 127,
    })

    const model = createPianoRollTrackSustainPedalLaneReadModel({
      activeClipId: laterClipId,
      channel: parseMidiChannel(0),
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })

    expect(model.activeClipId).toBe(laterClipId)
    expect(model.clips.map(({ clip }) => clip.clipId)).toEqual([
      fixture.clip.id,
      loopedClipId,
      laterClipId,
    ])
    expect(model.clips[1]).toMatchObject({
      clip: {
        reason: 'looped-clip',
        status: PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED,
      },
      events: [],
      initialPedalDown: null,
      initialValue: null,
      segments: [],
    })
    expect(model.clips[2]?.events[0]).toMatchObject({
      affectsPlayback: true,
      timelineTick: 8_160,
    })
    expect(model.clips[2]?.segments).toEqual([
      { endTick: 8_160, pedalDown: false, startTick: 7_680, value: 0 },
      { endTick: 9_600, pedalDown: true, startTick: 8_160, value: 127 },
    ])
  })
})
