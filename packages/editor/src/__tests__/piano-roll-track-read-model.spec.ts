import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddMidiClipCommand,
  createAddNoteCommand,
  parseClipId,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTrackId,
  type ProjectCommand,
  type ProjectSession,
  type ProjectSnapshot,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  PIANO_ROLL_TRACK_CLIP_STATUS,
  PianoRollError,
  createPianoRollTrackReadModel,
  pianoRollTrackProjectTickToSourceTick,
  pianoRollTrackSourceTickToProjectTick,
  resolvePianoRollTrackNotePlacement,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

function executeCommitted(session: ProjectSession, command: ProjectCommand): void {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error(`Expected ${command.type} to commit`)
  }
}

function addClip(
  session: ProjectSession,
  input: {
    readonly clipId: string
    readonly looped?: boolean
    readonly sourceId: string
    readonly sourceOffsetTick?: number
    readonly startTick: number
  },
) {
  const snapshot = session.getSnapshot()
  const trackId = snapshot.tracks[0]?.id
  if (trackId === undefined) throw new Error('Expected an Instrument Track')

  const clipId = parseClipId(input.clipId)
  const sourceId = parseMidiSourceId(input.sourceId)
  executeCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      color: null,
      loop: input.looped
        ? {
            sourceSpanTick: parseTick(1_920),
            sourceStartTick: parseTick(0),
          }
        : null,
      muted: false,
      name: input.clipId,
      sourceId,
      sourceLengthTick: parseTick(3_840),
      sourceOffsetTick: parseTick(input.sourceOffsetTick ?? 0),
      spanTick: parseTick(1_920),
      startTick: parseTick(input.startTick),
      trackId,
    }),
  )

  return { clipId, sourceId, trackId }
}

function addNote(session: ProjectSession, sourceId: ReturnType<typeof parseMidiSourceId>): void {
  executeCommitted(
    session,
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parseTick(480),
      noteId: parseNoteId('track-read-model-later-note'),
      pitch: parseMidiPitch(67),
      sourceId,
      startTick: parseTick(960),
      velocity: parseMidiVelocity(100),
    }),
  )
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

describe('Piano Roll Track Read Model', () => {
  it('projects sorted Clip windows and visible Notes into global Project time', () => {
    const fixture = createPianoRollProjectFixture()
    const looped = addClip(fixture.session, {
      clipId: 'track-read-model-looped-clip',
      looped: true,
      sourceId: 'track-read-model-looped-source',
      startTick: 3_840,
    })
    const later = addClip(fixture.session, {
      clipId: 'track-read-model-later-clip',
      sourceId: 'track-read-model-later-source',
      sourceOffsetTick: 480,
      startTick: 7_680,
    })
    addNote(fixture.session, later.sourceId)

    const model = createPianoRollTrackReadModel({
      activeClipId: later.clipId,
      snapshot: fixture.session.getSnapshot(),
      trackId: later.trackId,
    })

    expect(model).toMatchObject({
      activeClipId: later.clipId,
      projectId: fixture.session.getSnapshot().project.id,
      trackId: later.trackId,
    })
    expect(model.clips.map(({ clip }) => clip.clipId)).toEqual([
      fixture.clip.id,
      looped.clipId,
      later.clipId,
    ])
    expect(model.clips[0]?.clip).toMatchObject({
      endTick: 1_920,
      startTick: 0,
      status: PIANO_ROLL_TRACK_CLIP_STATUS.READY,
    })
    expect(
      model.clips[0]?.notes.map(({ note, projectEndTick, projectStartTick }) => ({
        noteId: note.id,
        projectEndTick,
        projectStartTick,
      })),
    ).toEqual([
      {
        noteId: 'editor-note-leading',
        projectEndTick: 240,
        projectStartTick: 0,
      },
      {
        noteId: 'editor-note-inside',
        projectEndTick: 720,
        projectStartTick: 480,
      },
      {
        noteId: 'editor-note-high',
        projectEndTick: 760,
        projectStartTick: 520,
      },
    ])
    expect(model.clips[1]).toMatchObject({
      clip: {
        clipId: looped.clipId,
        reason: 'looped-clip',
        status: PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED,
      },
      notes: [],
    })
    expect(model.clips[2]?.notes[0]).toMatchObject({
      clipId: later.clipId,
      projectEndTick: 8_640,
      projectStartTick: 8_160,
    })
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.clips)).toBe(true)
    expect(Object.isFrozen(model.clips[0]?.notes)).toBe(true)
  })

  it('maps ready Clip endpoints between global Project and MidiSource time', () => {
    const fixture = createPianoRollProjectFixture()
    const model = createPianoRollTrackReadModel({
      activeClipId: fixture.clip.id,
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })
    const clip = model.clips[0]?.clip
    if (clip?.status !== PIANO_ROLL_TRACK_CLIP_STATUS.READY) {
      throw new Error('Expected a ready Track Clip projection')
    }

    expect(pianoRollTrackProjectTickToSourceTick(clip, parseTick(0))).toBe(480)
    expect(pianoRollTrackProjectTickToSourceTick(clip, parseTick(240))).toBe(720)
    expect(pianoRollTrackProjectTickToSourceTick(clip, parseTick(1_920))).toBe(2_400)
    expect(pianoRollTrackSourceTickToProjectTick(clip, parseTick(1_200))).toBe(720)
    expect(
      requirePianoRollError(() => pianoRollTrackProjectTickToSourceTick(clip, parseTick(1_921)))
        .code,
    ).toBe('tick-outside-clip')
  })

  it('clears stale active Clip identity without losing the Track projection', () => {
    const fixture = createPianoRollProjectFixture()
    const model = createPianoRollTrackReadModel({
      activeClipId: parseClipId('track-read-model-stale-clip'),
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })

    expect(model.activeClipId).toBeNull()
    expect(model.clips).toHaveLength(1)
  })

  it('fails closed for missing or non-Instrument Track ownership', () => {
    const fixture = createPianoRollProjectFixture()
    const snapshot = fixture.session.getSnapshot()
    expect(
      requirePianoRollError(() =>
        createPianoRollTrackReadModel({
          snapshot,
          trackId: parseTrackId('missing-track'),
        }),
      ).code,
    ).toBe('track-not-found')

    const track = snapshot.tracks[0]
    if (track === undefined) throw new Error('Expected an Instrument Track')
    const audioSnapshot: ProjectSnapshot = Object.freeze({
      ...snapshot,
      tracks: Object.freeze([
        Object.freeze({
          ...track,
          kind: 'audio' as const,
        }),
      ]),
    })
    expect(
      requirePianoRollError(() =>
        createPianoRollTrackReadModel({
          snapshot: audioSnapshot,
          trackId: track.id,
        }),
      ).code,
    ).toBe('track-not-instrument')
  })
})

describe('Piano Roll Track Note placement', () => {
  it('adds inside one Clip and atomically extends a Note tail beyond its right edge', () => {
    const fixture = createPianoRollProjectFixture()
    const readModel = createPianoRollTrackReadModel({
      activeClipId: fixture.clip.id,
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(960),
        readModel,
      }),
    ).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP,
      clipId: fixture.clip.id,
      sourceStartTick: 1_440,
      status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(480),
        projectStartTick: parseTick(1_800),
        readModel,
      }),
    ).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP,
      clipId: fixture.clip.id,
      projectEndTick: 2_280,
      sourceStartTick: 2_280,
      targetClipSpanTick: 2_280,
    })
  })

  it('extends the nearest left Clip within one bar but creates a bar Clip farther away', () => {
    const fixture = createPianoRollProjectFixture()
    const readModel = createPianoRollTrackReadModel({
      activeClipId: fixture.clip.id,
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(2_160),
        readModel,
      }),
    ).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP,
      sourceStartTick: 2_640,
      targetClipSpanTick: 2_400,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(6_000),
        readModel,
      }),
    ).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP,
      clipSpanTick: 3_840,
      clipStartTick: 3_840,
      sourceStartTick: 2_160,
    })
  })

  it('requires Active Clip for overlaps and rejects looped targets', () => {
    const fixture = createPianoRollProjectFixture()
    const overlapping = addClip(fixture.session, {
      clipId: 'track-placement-overlapping-clip',
      sourceId: 'track-placement-overlapping-source',
      startTick: 960,
    })
    const looped = addClip(fixture.session, {
      clipId: 'track-placement-looped-clip',
      looped: true,
      sourceId: 'track-placement-looped-source',
      startTick: 3_840,
    })
    const snapshot = fixture.session.getSnapshot()

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(1_200),
        readModel: createPianoRollTrackReadModel({
          snapshot,
          trackId: fixture.clip.trackId,
        }),
      }),
    ).toMatchObject({
      candidateClipIds: [fixture.clip.id, overlapping.clipId],
      reason: PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.AMBIGUOUS_CLIP_TARGET,
      status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(1_200),
        readModel: createPianoRollTrackReadModel({
          activeClipId: overlapping.clipId,
          snapshot,
          trackId: fixture.clip.trackId,
        }),
      }),
    ).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP,
      clipId: overlapping.clipId,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(240),
        projectStartTick: parseTick(4_080),
        readModel: createPianoRollTrackReadModel({
          activeClipId: looped.clipId,
          snapshot,
          trackId: fixture.clip.trackId,
        }),
      }),
    ).toMatchObject({
      candidateClipIds: [looped.clipId],
      reason: PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.LOOPED_CLIP_TARGET,
      status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
    })
  })

  it('blocks an automatic extension that would cross the next Clip', () => {
    const fixture = createPianoRollProjectFixture()
    const next = addClip(fixture.session, {
      clipId: 'track-placement-next-clip',
      sourceId: 'track-placement-next-source',
      startTick: 2_400,
    })
    const readModel = createPianoRollTrackReadModel({
      activeClipId: fixture.clip.id,
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })

    expect(
      resolvePianoRollTrackNotePlacement({
        barSpanTick: parseTick(3_840),
        noteDurationTick: parseTick(720),
        projectStartTick: parseTick(1_800),
        readModel,
      }),
    ).toMatchObject({
      candidateClipIds: [fixture.clip.id, next.clipId],
      reason: PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.EXTENSION_CROSSES_NEXT_CLIP,
      status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
    })
  })
})
