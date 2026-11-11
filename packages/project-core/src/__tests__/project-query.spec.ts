import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  PROJECT_QUERY_TYPE,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createMidiNotesIntersectingRangeQuery,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTickDelta,
  type MidiNoteByIdQueryResult,
  type MidiNoteRecord,
  type MidiNotesIntersectingRangeQuery,
  type MidiNotesIntersectingRangeQueryResult,
  type ModelRevision,
} from '#internal/index'
import type { ModelStore } from '#internal/model/model-store'
import { withAuthoritativeMapSetInterceptor } from './support/map-set-interceptor'
import { createFixtureProjectSession } from './support/project-session-test-support'

/** The range query answered by scanning the Store, as the oracle for the indexed answer. */
function scanRange(
  store: ModelStore,
  query: MidiNotesIntersectingRangeQuery,
): { readonly modelRevision: ModelRevision; readonly notes: readonly MidiNoteRecord[] } {
  const notes = [...store.midiNoteEntries(query.sourceId)]
    .map(([, note]) => note)
    .filter(
      (note) =>
        note.startTick < query.endTick &&
        note.startTick + note.durationTick > query.startTick &&
        note.pitch >= query.minimumPitch &&
        note.pitch <= query.maximumPitch,
    )
    .sort(
      (left, right) =>
        left.startTick - right.startTick ||
        left.pitch - right.pitch ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
  return { modelRevision: store.modelRevision, notes }
}

function createFullSourceRangeQuery(sourceId: ReturnType<typeof parseMidiSourceId>) {
  return createMidiNotesIntersectingRangeQuery({
    sourceId,
    startTick: parseTick(0),
    endTick: parseTick(1_920),
    minimumPitch: parseMidiPitch(MIDI_PITCH_MIN),
    maximumPitch: parseMidiPitch(MIDI_PITCH_MAX),
  })
}

describe('ProjectQuery public contract', () => {
  it('exports frozen typed descriptors while keeping index internals private', () => {
    const { fixture, session } = createFixtureProjectSession()
    const byIdQuery = createMidiNoteByIdQuery({
      sourceId: fixture.records.verseSource.id,
      noteId: fixture.records.verseNote.id,
    })
    const rangeQuery = createFullSourceRangeQuery(fixture.records.verseSource.id)
    const byIdResult = session.query(byIdQuery)
    const rangeResult = session.query(rangeQuery)

    expect(PROJECT_QUERY_TYPE).toEqual({
      MIDI_NOTE: {
        BY_ID: 'midi-note.by-id',
        INTERSECTING_RANGE: 'midi-note.intersecting-range',
      },
    })
    expect(Object.isFrozen(byIdQuery)).toBe(true)
    expect(Object.isFrozen(rangeQuery)).toBe(true)
    expectTypeOf(byIdResult).toEqualTypeOf<MidiNoteByIdQueryResult>()
    expectTypeOf(rangeResult).toEqualTypeOf<MidiNotesIntersectingRangeQueryResult>()
    expect('executeProjectQuery' in projectCore).toBe(false)
  })

  it('rejects invalid range relationships', () => {
    const { fixture } = createFixtureProjectSession()
    const baseInput = {
      sourceId: fixture.records.verseSource.id,
      startTick: parseTick(240),
      endTick: parseTick(480),
      minimumPitch: parseMidiPitch(60),
      maximumPitch: parseMidiPitch(72),
    }

    expect(() =>
      createMidiNotesIntersectingRangeQuery({
        ...baseInput,
        endTick: baseInput.startTick,
      }),
    ).toThrowError(
      new RangeError('MIDI Note range Query requires endTick to be greater than startTick'),
    )
    expect(() =>
      createMidiNotesIntersectingRangeQuery({
        ...baseInput,
        minimumPitch: parseMidiPitch(73),
      }),
    ).toThrowError(
      new RangeError(
        'MIDI Note range Query requires maximumPitch to be greater than or equal to minimumPitch',
      ),
    )
  })
})

describe('ProjectSession MIDI Note queries', () => {
  it('returns one current Record reference or undefined at the queried revision', () => {
    const { fixture, session } = createFixtureProjectSession()
    const existing = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.verseSource.id,
        noteId: fixture.records.verseNote.id,
      }),
    )
    const missing = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.verseSource.id,
        noteId: parseNoteId('note-query-missing'),
      }),
    )
    const missingSource = session.query(
      createMidiNoteByIdQuery({
        sourceId: parseMidiSourceId('source-query-missing'),
        noteId: fixture.records.verseNote.id,
      }),
    )

    expect(existing).toEqual({
      queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID,
      modelRevision: 0,
      note: fixture.records.verseNote,
    })
    expect(existing.note).toBe(fixture.records.verseNote)
    expect(Object.isFrozen(existing)).toBe(true)
    expect(missing.note).toBeUndefined()
    expect(missingSource.note).toBeUndefined()
  })

  it('uses half-open overlap, inclusive Pitch bounds, and frozen missing results', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const startsAtBoundary = session.query(
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(720),
        endTick: parseTick(960),
        minimumPitch: parseMidiPitch(64),
        maximumPitch: parseMidiPitch(64),
      }),
    )
    const containedViewport = session.query(
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(300),
        endTick: parseTick(400),
        minimumPitch: parseMidiPitch(60),
        maximumPitch: parseMidiPitch(60),
      }),
    )
    const endsAtBoundary = session.query(
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(960),
        endTick: parseTick(1_200),
        minimumPitch: parseMidiPitch(MIDI_PITCH_MIN),
        maximumPitch: parseMidiPitch(MIDI_PITCH_MAX),
      }),
    )
    const missingSource = session.query(
      createMidiNotesIntersectingRangeQuery({
        sourceId: parseMidiSourceId('source-query-missing'),
        startTick: parseTick(0),
        endTick: parseTick(1),
        minimumPitch: parseMidiPitch(MIDI_PITCH_MIN),
        maximumPitch: parseMidiPitch(MIDI_PITCH_MAX),
      }),
    )

    expect(startsAtBoundary.notes).toEqual([fixture.records.verseHarmonyNote])
    expect(containedViewport.notes).toEqual([fixture.records.verseNote])
    expect(endsAtBoundary.notes).toEqual([])
    expect(missingSource.notes).toEqual([])
    expect(Object.isFrozen(startsAtBoundary)).toBe(true)
    expect(Object.isFrozen(startsAtBoundary.notes)).toBe(true)
    expect(Object.isFrozen(missingSource.notes)).toBe(true)
  })

  it('sorts by startTick, Pitch, and opaque Note ID independently of insertion order', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const laterId = parseNoteId('note-query-sort-z')
    const earlierId = parseNoteId('note-query-sort-a')

    for (const noteId of [laterId, earlierId]) {
      session.execute(
        createAddNoteCommand({
          baseRevision: session.modelRevision,
          sourceId,
          noteId,
          startTick: parseTick(720),
          durationTick: parseTick(120),
          pitch: parseMidiPitch(62),
          velocity: parseMidiVelocity(100),
          channel: parseMidiChannel(0),
        }),
      )
    }

    const result = session.query(
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(720),
        endTick: parseTick(721),
        minimumPitch: parseMidiPitch(60),
        maximumPitch: parseMidiPitch(64),
      }),
    )

    expect(result.notes.map((note) => note.id)).toEqual([
      earlierId,
      laterId,
      fixture.records.verseHarmonyNote.id,
    ])
    expect(result.modelRevision).toBe(2)
  })

  it('keeps indexed results equivalent to scanning across Add, Move, Remove, Undo, and Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const noteId = parseNoteId('note-query-sequence')
    const rangeQueries = [
      createFullSourceRangeQuery(sourceId),
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(0),
        endTick: parseTick(720),
        minimumPitch: parseMidiPitch(60),
        maximumPitch: parseMidiPitch(72),
      }),
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(720),
        endTick: parseTick(960),
        minimumPitch: parseMidiPitch(64),
        maximumPitch: parseMidiPitch(74),
      }),
      createMidiNotesIntersectingRangeQuery({
        sourceId,
        startTick: parseTick(1_200),
        endTick: parseTick(1_680),
        minimumPitch: parseMidiPitch(72),
        maximumPitch: parseMidiPitch(74),
      }),
    ]
    const assertEquivalent = (): void => {
      for (const rangeQuery of rangeQueries) {
        const indexed = session.query(rangeQuery)
        const scanned = scanRange(store, rangeQuery)

        expect(indexed.modelRevision).toBe(scanned.modelRevision)
        expect(indexed.notes).toEqual(scanned.notes)
        indexed.notes.forEach((note, index) => expect(note).toBe(scanned.notes[index]))
      }
    }

    session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId,
        startTick: parseTick(1_200),
        durationTick: parseTick(240),
        pitch: parseMidiPitch(72),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    )
    assertEquivalent()

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(240),
        deltaPitch: parseMidiPitchDelta(2),
      }),
    )
    assertEquivalent()

    session.execute(
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
      }),
    )
    assertEquivalent()

    session.undo()
    assertEquivalent()
    session.undo()
    assertEquivalent()
    session.redo()
    assertEquivalent()
    session.redo()
    assertEquivalent()
  })

  it('does not advance Query results for no-change execution', () => {
    const { fixture, session } = createFixtureProjectSession()
    const before = fixture.records.verseNote

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.verseSource.id,
        noteIds: [before.id],
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
      }),
    )

    const result = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.verseSource.id,
        noteId: before.id,
      }),
    )

    expect(result.modelRevision).toBe(0)
    expect(result.note).toBe(before)
  })

  it('keeps answering at the previous revision when authoritative apply fails', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.verseSource.id
    const noteId = parseNoteId('note-query-write-failure')
    const command = createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    expect(() =>
      withAuthoritativeMapSetInterceptor(
        (key, value) => {
          if (
            key === noteId &&
            typeof value === 'object' &&
            value !== null &&
            'id' in value &&
            value.id === noteId
          ) {
            throw new Error('injected Store write failure')
          }
        },
        () => session.execute(command),
      ),
    ).toThrowError(/rollback completed and ModelStore was revalidated/)

    const result = session.query(createMidiNoteByIdQuery({ sourceId, noteId }))

    expect(store.modelRevision).toBe(0)
    expect(result.modelRevision).toBe(0)
    expect(result.note).toBeUndefined()
    expect(session.canUndo).toBe(false)
  })
})
