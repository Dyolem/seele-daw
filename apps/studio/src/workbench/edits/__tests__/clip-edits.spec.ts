import {
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  parseTick,
  parseTrackId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { createClipEdits } from '@/workbench/edits/clip-edits'
import { ProjectEditError } from '@/workbench/edits/edit-session'
import { createTrackEdits } from '@/workbench/edits/track-edits'
import {
  IDLE_PROJECT,
  createEditTestSession,
  editContextFor,
} from '@/workbench/edits/__tests__/support/edit-test-support'

function addInstrumentTrack(session: ProjectSession) {
  return createTrackEdits(
    editContextFor(session, 'track-clip-target', 'device-clip-target'),
  ).addInstrumentTrack()
}

describe('clip edits', () => {
  it('creates one snapped, one-bar empty MIDI Clip with product defaults', () => {
    const session = createEditTestSession('clip-defaults')
    const track = addInstrumentTrack(session)

    const result = createClipEdits(
      editContextFor(session, 'clip-defaults', 'source-defaults'),
    ).addEmpty({ trackId: track.trackId, targetTick: parseTick(5_000) })
    const snapshot = session.getSnapshot()

    expect(result).toMatchObject({
      clipId: 'clip-defaults',
      trackId: track.trackId,
      commit: { origin: { kind: 'command', commandType: PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD } },
    })
    expect(result.commit.changes).toContainEqual(
      expect.objectContaining({ op: 'insert', table: 'clips' }),
    )
    expect(snapshot.clips[0]).toEqual({
      id: 'clip-defaults',
      trackId: track.trackId,
      name: 'Instrument 1',
      color: null,
      muted: false,
      startTick: 3_840,
      spanTick: 3_840,
      sourceId: 'source-defaults',
      sourceOffsetTick: 0,
    })
    expect(snapshot.midiSources[0]).toEqual({ id: 'source-defaults', lengthTick: 3_840 })
    expect(snapshot.midiNotes).toEqual({ 'source-defaults': [] })
    expect(session.canUndo).toBe(true)
  })

  it('uses the live Session revision and allows overlapping Clips', () => {
    const session = createEditTestSession('clip-overlap')
    const track = addInstrumentTrack(session)
    const context = editContextFor(
      session,
      'clip-overlap-first',
      'source-overlap-first',
      'clip-overlap-second',
      'source-overlap-second',
    )
    const clips = createClipEdits(context)

    clips.addEmpty({ trackId: track.trackId, targetTick: parseTick(1_000) })
    clips.addEmpty({ trackId: track.trackId, targetTick: parseTick(2_000) })

    expect(session.modelRevision).toBe(3)
    expect(session.getSnapshot().clips.map(({ startTick }) => startTick)).toEqual([0, 0])
  })

  it('treats a missing Track as a stale target', () => {
    const session = createEditTestSession('clip-missing-track')
    const clips = createClipEdits(editContextFor(session))

    expect(() =>
      clips.addEmpty({ trackId: parseTrackId('track-clip-missing'), targetTick: parseTick(0) }),
    ).toThrowError(expect.objectContaining<Partial<ProjectEditError>>({ code: 'target-stale' }))
    expect(session.modelRevision).toBe(0)
  })

  it('rejects creation without a ready project', () => {
    const clips = createClipEdits({ activeProject: IDLE_PROJECT, createId: () => 'unused' })

    expect(() =>
      clips.addEmpty({ trackId: parseTrackId('track-clip-idle'), targetTick: parseTick(0) }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectEditError>>({ code: 'project-not-ready' }),
    )
  })

  it('leaves identity conflicts to Project Core', () => {
    const session = createEditTestSession('clip-duplicate')
    const track = addInstrumentTrack(session)
    const input = { trackId: track.trackId, targetTick: parseTick(0) }
    createClipEdits(editContextFor(session, 'clip-duplicate', 'source-duplicate')).addEmpty(input)

    expect(() =>
      createClipEdits(editContextFor(session, 'clip-duplicate', 'source-duplicate-other')).addEmpty(
        input,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'clip-id-already-exists' }),
    )
  })
})
