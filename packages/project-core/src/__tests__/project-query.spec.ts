import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  PROJECT_QUERY_TYPE,
  ProjectQueryError,
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createMidiNotesIntersectingRangeQuery,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type MidiNoteByIdQueryResult,
  type MidiNotesIntersectingRangeQueryResult,
  type ProjectQuery,
} from '~/index'
import { MutationApplyError } from '@/mutation/mutation-apply-error'
import { executeProjectQueryByScan } from '@/queries/project-query-executor'
import { withAuthoritativeMapSetInterceptor } from './support/map-set-interceptor'
import { createFixtureProjectSession } from './support/project-session-test-support'

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
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    })
    const rangeQuery = createFullSourceRangeQuery(fixture.records.nonLoopSource.id)
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
    expect('QueryIndex' in projectCore).toBe(false)
    expect('executeProjectQueryByScan' in projectCore).toBe(false)
    expect('normalizeProjectQuery' in projectCore).toBe(false)
  })

  it('rejects invalid range relationships and structurally supplied unknown queries', () => {
    const { fixture, session } = createFixtureProjectSession()
    const baseInput = {
      sourceId: fixture.records.nonLoopSource.id,
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
      expect.objectContaining<Partial<ProjectQueryError>>({ code: 'invalid-tick-range' }),
    )
    expect(() =>
      createMidiNotesIntersectingRangeQuery({
        ...baseInput,
        minimumPitch: parseMidiPitch(73),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectQueryError>>({ code: 'invalid-pitch-range' }),
    )
    expect(() =>
      session.query({ type: 'midi-note.unknown' } as unknown as ProjectQuery),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectQueryError>>({ code: 'unknown-query-type' }),
    )
  })
})

describe('ProjectSession MIDI Note queries', () => {
  it('returns one current Record reference or undefined at the queried revision', () => {
    const { fixture, session } = createFixtureProjectSession()
    const existing = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.nonLoopSource.id,
        noteId: fixture.records.nonLoopNote.id,
      }),
    )
    const missing = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.nonLoopSource.id,
        noteId: parseNoteId('note-query-missing'),
      }),
    )
    const missingSource = session.query(
      createMidiNoteByIdQuery({
        sourceId: parseMidiSourceId('source-query-missing'),
        noteId: fixture.records.nonLoopNote.id,
      }),
    )

    expect(existing).toEqual({
      queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID,
      modelRevision: 0,
      note: fixture.records.nonLoopNote,
    })
    expect(existing.note).toBe(fixture.records.nonLoopNote)
    expect(Object.isFrozen(existing)).toBe(true)
    expect(missing.note).toBeUndefined()
    expect(missingSource.note).toBeUndefined()
  })

  it('uses half-open overlap, inclusive Pitch bounds, and frozen missing results', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
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

    expect(startsAtBoundary.notes).toEqual([fixture.records.nonLoopHarmonyNote])
    expect(containedViewport.notes).toEqual([fixture.records.nonLoopNote])
    expect(endsAtBoundary.notes).toEqual([])
    expect(missingSource.notes).toEqual([])
    expect(Object.isFrozen(startsAtBoundary)).toBe(true)
    expect(Object.isFrozen(startsAtBoundary.notes)).toBe(true)
    expect(Object.isFrozen(missingSource.notes)).toBe(true)
  })

  it('sorts by startTick, Pitch, and opaque Note ID independently of insertion order', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
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
      fixture.records.nonLoopHarmonyNote.id,
    ])
    expect(result.modelRevision).toBe(2)
  })

  it('keeps indexed results equivalent to scanning across Add, Move, Remove, Undo, and Redo', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
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
        const scanned = executeProjectQueryByScan(store, rangeQuery)

        expect(indexed).toEqual(scanned)
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
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteId,
        nextStartTick: parseTick(1_440),
        nextPitch: parseMidiPitch(74),
      }),
    )
    assertEquivalent()

    session.execute(
      createRemoveNoteCommand({ baseRevision: session.modelRevision, sourceId, noteId }),
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
    const before = fixture.records.nonLoopNote

    session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: before.id,
        nextStartTick: before.startTick,
        nextPitch: before.pitch,
      }),
    )

    const result = session.query(
      createMidiNoteByIdQuery({
        sourceId: fixture.records.nonLoopSource.id,
        noteId: before.id,
      }),
    )

    expect(result.modelRevision).toBe(0)
    expect(result.note).toBe(before)
  })

  it('restores the previous QueryIndex root when authoritative apply fails', () => {
    const { fixture, store, session } = createFixtureProjectSession()
    const sourceId = fixture.records.nonLoopSource.id
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
            throw new Error('injected QueryIndex write failure')
          }
        },
        () => session.execute(command),
      ),
    ).toThrowError(expect.objectContaining<Partial<MutationApplyError>>({ code: 'write-failed' }))

    const result = session.query(createMidiNoteByIdQuery({ sourceId, noteId }))

    expect(store.modelRevision).toBe(0)
    expect(result.modelRevision).toBe(0)
    expect(result.note).toBeUndefined()
    expect(session.canUndo).toBe(false)
  })
})
