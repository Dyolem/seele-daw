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
  type ProjectCommand,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  createPianoRollTrackReadModel,
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

describe('Piano Roll Track Read Model', () => {
  it('projects sorted Clip windows and visible Notes into global Project time', () => {
    const fixture = createPianoRollProjectFixture()
    const middle = addClip(fixture.session, {
      clipId: 'track-read-model-middle-clip',
      sourceId: 'track-read-model-middle-source',
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
      middle.clipId,
      later.clipId,
    ])
    expect(model.clips[0]?.clip).toMatchObject({
      endTick: 1_920,
      startTick: 0,
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
    expect(model.clips[1]).toMatchObject({ clip: { clipId: middle.clipId }, notes: [] })
    expect(model.clips[2]?.notes[0]).toMatchObject({
      clipId: later.clipId,
      projectEndTick: 8_640,
      projectStartTick: 8_160,
    })
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.clips)).toBe(true)
    expect(Object.isFrozen(model.clips[0]?.notes)).toBe(true)
  })

  it('maps MidiSource ticks of a Clip into Project time', () => {
    const fixture = createPianoRollProjectFixture()
    const model = createPianoRollTrackReadModel({
      activeClipId: fixture.clip.id,
      snapshot: fixture.session.getSnapshot(),
      trackId: fixture.clip.trackId,
    })
    const clip = model.clips[0]?.clip
    if (clip === undefined) throw new Error('Expected a Track Clip projection')

    expect(pianoRollTrackSourceTickToProjectTick(clip, parseTick(480))).toBe(0)
    expect(pianoRollTrackSourceTickToProjectTick(clip, parseTick(1_200))).toBe(720)
    expect(pianoRollTrackSourceTickToProjectTick(clip, parseTick(2_400))).toBe(1_920)
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

  it('requires an Active Clip where Clips overlap', () => {
    const fixture = createPianoRollProjectFixture()
    const overlapping = addClip(fixture.session, {
      clipId: 'track-placement-overlapping-clip',
      sourceId: 'track-placement-overlapping-source',
      startTick: 960,
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
