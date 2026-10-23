import {
  PROJECT_COMMAND_TYPE,
  createAddMidiClipCommand,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
  type ClipId,
  type ProjectSession,
  type TrackId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { ProjectEditError } from '@/workbench/edits/edit-session'
import { createSustainPedalEdits } from '@/workbench/edits/sustain-pedal-edits'
import { createTrackEdits } from '@/workbench/edits/track-edits'
import {
  createEditTestSession,
  editContextFor,
} from '@/workbench/edits/__tests__/support/edit-test-support'

interface PedalFixture {
  readonly clipId: ClipId
  readonly edits: ReturnType<typeof createSustainPedalEdits>
  readonly session: ProjectSession
  readonly trackId: TrackId
}

/** A 960-tick Clip at project tick 1920 that reads its Source from tick 480. */
function createFixture(name: string, looped = false): PedalFixture {
  const session = createEditTestSession(`pedal-${name}`)
  const track = createTrackEdits(
    editContextFor(session, `${name}-track`, `${name}-device`),
  ).addInstrumentTrack()
  const clipId = parseClipId(`${name}-clip`)
  session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      color: null,
      loop: looped
        ? { sourceSpanTick: parsePositiveTick(960), sourceStartTick: parseTick(0) }
        : null,
      muted: false,
      name: 'Pedal Clip',
      sourceId: parseMidiSourceId(`${name}-source`),
      sourceLengthTick: parsePositiveTick(looped ? 960 : 1_440),
      sourceOffsetTick: parseTick(looped ? 0 : 480),
      spanTick: parsePositiveTick(960),
      startTick: parseTick(1_920),
      trackId: track.trackId,
    }),
  )
  return {
    clipId,
    edits: createSustainPedalEdits(
      editContextFor(session, `${name}-event-1`, `${name}-event-2`, `${name}-event-3`),
    ),
    session,
    trackId: track.trackId,
  }
}

function eventsOf(session: ProjectSession) {
  return session.getSnapshot().midiSustainPedalEventPartitions.flatMap(({ events }) => events)
}

function placeInClip(fixture: PedalFixture, clipTick: number, value: number) {
  return fixture.edits.placeInClip({
    baseRevision: fixture.session.modelRevision,
    channel: parseMidiChannel(0),
    clipId: fixture.clipId,
    clipTick: parseTick(clipTick),
    value: parseMidiControlValue(value),
  })
}

const coded = (code: ProjectEditError['code']) =>
  expect.objectContaining<Partial<ProjectEditError>>({ code })

describe('sustain pedal edits', () => {
  it('maps a Clip-local placement into Source time as one undoable event', () => {
    const fixture = createFixture('clip-placement')
    const revision = fixture.session.modelRevision

    const result = fixture.edits.placeInClip({
      baseRevision: revision,
      channel: parseMidiChannel(2),
      clipId: fixture.clipId,
      clipTick: parseTick(120),
      value: parseMidiControlValue(64),
    })

    expect(result).toMatchObject({ clipId: fixture.clipId, eventId: 'clip-placement-event-1' })
    expect(result.commit).toMatchObject({
      origin: { commandType: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD },
      baseRevision: revision,
      modelRevision: revision + 1,
    })
    expect(eventsOf(fixture.session)).toEqual([
      { channel: 2, id: 'clip-placement-event-1', tick: 600, value: 64 },
    ])
    fixture.session.undo()
    expect(eventsOf(fixture.session)).toEqual([])
  })

  it('accepts the Clip end as a terminal event', () => {
    const fixture = createFixture('clip-endpoint')

    placeInClip(fixture, 960, 0)

    expect(eventsOf(fixture.session)[0]).toMatchObject({ tick: 1_440, value: 0 })
  })

  it('maps Track time through the chosen Active Clip', () => {
    const fixture = createFixture('track-placement')

    fixture.edits.placeOnTrack({
      activeClipId: fixture.clipId,
      baseRevision: fixture.session.modelRevision,
      channel: parseMidiChannel(0),
      projectTick: parseTick(2_160),
      trackId: fixture.trackId,
      value: parseMidiControlValue(127),
    })

    expect(eventsOf(fixture.session)[0]).toMatchObject({ tick: 720, value: 127 })
  })

  it('moves, re-values and removes events as single History steps', () => {
    const fixture = createFixture('event-edit')
    const first = placeInClip(fixture, 120, 0)
    const second = placeInClip(fixture, 360, 127)

    const moved = fixture.edits.move({
      baseRevision: fixture.session.modelRevision,
      clipId: fixture.clipId,
      deltaTick: parseTickDelta(120),
      eventIds: [first.eventId, second.eventId],
    })
    expect(moved?.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE)
    expect(eventsOf(fixture.session).map(({ tick }) => tick)).toEqual([720, 960])
    fixture.session.undo()
    expect(eventsOf(fixture.session).map(({ tick }) => tick)).toEqual([600, 840])
    fixture.session.redo()

    const revalue = () =>
      fixture.edits.replaceValue({
        baseRevision: fixture.session.modelRevision,
        clipId: fixture.clipId,
        eventId: first.eventId,
        value: parseMidiControlValue(96),
      })
    expect(revalue()?.origin.commandType).toBe(
      PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE,
    )
    expect(revalue()).toBeNull()

    const removed = fixture.edits.remove({
      baseRevision: fixture.session.modelRevision,
      clipId: fixture.clipId,
      eventIds: [first.eventId, second.eventId],
    })
    expect(removed.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE)
    expect(eventsOf(fixture.session)).toEqual([])
  })

  it('returns null for a zero-distance move and rejects an edit captured before the last one', () => {
    const fixture = createFixture('event-guard')
    const event = placeInClip(fixture, 120, 0)
    const revision = fixture.session.modelRevision

    expect(
      fixture.edits.move({
        baseRevision: revision,
        clipId: fixture.clipId,
        deltaTick: parseTickDelta(0),
        eventIds: [event.eventId],
      }),
    ).toBeNull()
    fixture.edits.replaceValue({
      baseRevision: revision,
      clipId: fixture.clipId,
      eventId: event.eventId,
      value: parseMidiControlValue(1),
    })
    expect(() =>
      fixture.edits.remove({
        baseRevision: revision,
        clipId: fixture.clipId,
        eventIds: [event.eventId],
      }),
    ).toThrowError(coded('target-stale'))
  })

  it('reports a missing Active Clip, an outside position, a stale gesture and a looped Clip', () => {
    const fixture = createFixture('blocked')
    const input = {
      activeClipId: fixture.clipId,
      baseRevision: fixture.session.modelRevision,
      channel: parseMidiChannel(0),
      projectTick: parseTick(2_160),
      trackId: fixture.trackId,
      value: parseMidiControlValue(64),
    }

    expect(() => fixture.edits.placeOnTrack({ ...input, activeClipId: null })).toThrowError(
      coded('unsupported'),
    )
    expect(() =>
      fixture.edits.placeOnTrack({ ...input, projectTick: parseTick(3_000) }),
    ).toThrowError(coded('not-placeable'))
    fixture.edits.placeOnTrack(input)
    expect(() => fixture.edits.placeOnTrack(input)).toThrowError(coded('target-stale'))

    const looped = createFixture('looped', true)
    expect(() => placeInClip(looped, 0, 127)).toThrowError(coded('unsupported'))
  })

  it('rejects every gesture captured on a replaced Session, even with equal ids and revision', () => {
    const previous = createFixture('replaced')
    const current = createFixture('replaced')
    const target = {
      expectedSession: previous.session,
      baseRevision: previous.session.modelRevision,
      clipId: previous.clipId,
    }
    const eventId = parseMidiSustainPedalEventId('uncommitted-event')
    const revision = current.session.modelRevision

    expect(() =>
      current.edits.placeInClip({
        ...target,
        channel: parseMidiChannel(0),
        clipTick: parseTick(100),
        value: parseMidiControlValue(64),
      }),
    ).toThrowError(coded('target-stale'))
    expect(() =>
      current.edits.placeOnTrack({
        ...target,
        activeClipId: previous.clipId,
        channel: parseMidiChannel(0),
        trackId: previous.trackId,
        projectTick: parseTick(2_000),
        value: parseMidiControlValue(64),
      }),
    ).toThrowError(coded('target-stale'))
    expect(() =>
      current.edits.move({ ...target, eventIds: [eventId], deltaTick: parseTickDelta(120) }),
    ).toThrowError(coded('target-stale'))
    expect(() =>
      current.edits.replaceValue({ ...target, eventId, value: parseMidiControlValue(100) }),
    ).toThrowError(coded('target-stale'))
    expect(current.session.modelRevision).toBe(revision)
  })
})
