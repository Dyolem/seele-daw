import { PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION } from '@seele-daw/editor'
import {
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  createAddMidiClipCommand,
  parseClipId,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  parseTickDelta,
  type ClipId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import { ProjectEditError } from '@/workbench/edits/edit-session'
import {
  DEFAULT_NOTE_CHANNEL,
  DEFAULT_NOTE_VELOCITY,
  createNoteEdits,
} from '@/workbench/edits/note-edits'
import { createTrackEdits } from '@/workbench/edits/track-edits'
import {
  IDLE_PROJECT,
  createEditTestSession,
  editContextFor,
  readyStateOf,
} from '@/workbench/edits/__tests__/support/edit-test-support'

interface ClipFixture {
  readonly clipId: ClipId
  readonly session: ProjectSession
}

/** One Instrument Track with one 960-tick Clip that reads its Source from tick 480. */
function createClipFixture(name: string, options: { readonly looped?: boolean } = {}): ClipFixture {
  const session = createEditTestSession(`note-${name}`)
  const track = createTrackEdits(
    editContextFor(session, `track-${name}`, `device-${name}`),
  ).addInstrumentTrack()
  const clipId = parseClipId(`clip-${name}`)
  session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      trackId: track.trackId,
      name: `Clip ${name}`,
      color: null,
      muted: false,
      startTick: parseTick(0),
      spanTick: parsePositiveTick(960),
      sourceId: parseMidiSourceId(`source-${name}`),
      sourceLengthTick: parsePositiveTick(options.looped ? 960 : 1_440),
      sourceOffsetTick: parseTick(options.looped ? 0 : 480),
      loop: options.looped
        ? { sourceStartTick: parseTick(0), sourceSpanTick: parsePositiveTick(960) }
        : null,
    }),
  )
  return { clipId, session }
}

function notesOf(session: ProjectSession) {
  return Object.values(session.getSnapshot().midiNotes).flat()
}

/** Adds a 240-tick note at a Clip-local tick against the current revision. */
function addNote(
  edits: ReturnType<typeof createNoteEdits>,
  fixture: ClipFixture,
  clipStartTick: number,
  pitch = 60,
) {
  return edits.add({
    expectedSession: fixture.session,
    baseRevision: fixture.session.modelRevision,
    clipId: fixture.clipId,
    clipStartTick: parseTick(clipStartTick),
    requestedDurationTick: parsePositiveTick(240),
    pitch: parseMidiPitch(pitch),
  }).noteId
}

const stale = expect.objectContaining<Partial<ProjectEditError>>({ code: 'target-stale' })

describe('note edits', () => {
  it('adds a Note with product defaults, mapped from Clip time into its Source', () => {
    const fixture = createClipFixture('defaults')
    const result = createNoteEdits(editContextFor(fixture.session, 'note-defaults')).add({
      expectedSession: fixture.session,
      baseRevision: fixture.session.modelRevision,
      clipId: fixture.clipId,
      clipStartTick: parseTick(120),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    })
    const note = notesOf(fixture.session)[0]

    expect(result.noteId).toBe('note-defaults')
    expect(result.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
    })
    expect(note).toEqual({
      id: 'note-defaults',
      startTick: 600,
      durationTick: 240,
      pitch: 60,
      velocity: DEFAULT_NOTE_VELOCITY,
      channel: DEFAULT_NOTE_CHANNEL,
    })
    fixture.session.undo()
    expect(notesOf(fixture.session)).toEqual([])
    fixture.session.redo()
    expect(notesOf(fixture.session)).toEqual([note])
  })

  it('shortens the requested duration to the time left in the Clip', () => {
    const fixture = createClipFixture('shortened')
    addNote(createNoteEdits(editContextFor(fixture.session, 'note-shortened')), fixture, 900)

    expect(notesOf(fixture.session)[0]).toMatchObject({ startTick: 1_380, durationTick: 60 })
  })

  it('accepts overlapping Notes when each gesture captured the current revision', () => {
    const fixture = createClipFixture('overlap')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-1', 'note-2'))

    addNote(edits, fixture, 240)
    addNote(edits, fixture, 240)

    expect(notesOf(fixture.session).map(({ id }) => id)).toEqual(['note-1', 'note-2'])
  })

  it('places Track Notes by adding to, extending, or creating a Clip', () => {
    const fixture = createClipFixture('track-placement')
    const trackId = fixture.session.getSnapshot().tracks[0]!.id
    const place = (identities: string[], pitch: number, projectStartTick: number) =>
      createNoteEdits(editContextFor(fixture.session, ...identities)).placeOnTrack({
        activeClipId: fixture.clipId,
        barSpanTick: parsePositiveTick(3_840),
        baseRevision: fixture.session.modelRevision,
        noteDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(pitch),
        projectStartTick: parseTick(projectStartTick),
        trackId,
      })

    const added = place(['note-add'], 60, 120)
    expect(added).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP,
      clipId: fixture.clipId,
      noteId: 'note-add',
    })
    expect(added.commit.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD)

    const extended = place(['note-extend'], 64, 900)
    expect(extended.action).toBe(PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP)
    expect(extended.commit.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE)
    expect(fixture.session.getSnapshot().clips[0]).toMatchObject({ spanTick: 1_140 })
    expect(notesOf(fixture.session)).toContainEqual(
      expect.objectContaining({ id: 'note-extend', durationTick: 240, startTick: 1_380 }),
    )

    const created = place(['note-create', 'clip-create', 'source-create'], 67, 6_000)
    expect(created).toMatchObject({
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP,
      clipId: 'clip-create',
      noteId: 'note-create',
    })
    expect(created.commit.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE)
    expect(
      fixture.session.getSnapshot().clips.find(({ id }) => id === 'clip-create'),
    ).toMatchObject({ sourceId: 'source-create', spanTick: 3_840, startTick: 3_840 })
    expect(notesOf(fixture.session)).toContainEqual(
      expect.objectContaining({ id: 'note-create', startTick: 2_160 }),
    )
  })

  it('moves a selection with one shared delta in one undoable Commit', () => {
    const fixture = createClipFixture('move')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-1', 'note-2'))
    const noteIds = [addNote(edits, fixture, 120, 60), addNote(edits, fixture, 480, 64)]
    const revision = fixture.session.modelRevision

    const commit = edits.move({
      expectedSession: fixture.session,
      baseRevision: revision,
      clipId: fixture.clipId,
      deltaPitch: parseMidiPitchDelta(2),
      deltaTick: parseTickDelta(120),
      noteIds,
    })

    expect(commit).toMatchObject({ baseRevision: revision, modelRevision: revision + 1 })
    expect(commit?.changes).toMatchObject([
      { op: 'replace', table: 'midiNotes' },
      { op: 'replace', table: 'midiNotes' },
    ])
    expect(notesOf(fixture.session)).toEqual([
      expect.objectContaining({ id: noteIds[0], pitch: 62, startTick: 720 }),
      expect.objectContaining({ id: noteIds[1], pitch: 66, startTick: 1_080 }),
    ])
    fixture.session.undo()
    expect(notesOf(fixture.session)).toEqual([
      expect.objectContaining({ id: noteIds[0], pitch: 60, startTick: 600 }),
      expect.objectContaining({ id: noteIds[1], pitch: 64, startTick: 960 }),
    ])
  })

  it('returns null for zero movement and rejects an out-of-range move atomically', () => {
    const fixture = createClipFixture('move-rejected')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-1', 'note-2'))
    const noteIds = [addNote(edits, fixture, 120), addNote(edits, fixture, 480)]
    const revision = fixture.session.modelRevision
    const move = (deltaTick: number) =>
      edits.move({
        expectedSession: fixture.session,
        baseRevision: revision,
        clipId: fixture.clipId,
        deltaPitch: parseMidiPitchDelta(0),
        deltaTick: parseTickDelta(deltaTick),
        noteIds,
      })

    expect(move(0)).toBeNull()
    expect(() => move(300)).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'note-out-of-source-range',
      }),
    )
    expect(fixture.session.modelRevision).toBe(revision)
  })

  it('resizes one Note to its final Source geometry in one undoable Commit', () => {
    const fixture = createClipFixture('resize')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-resize'))
    const noteId = addNote(edits, fixture, 120)
    const revision = fixture.session.modelRevision

    const commit = edits.resize({
      expectedSession: fixture.session,
      baseRevision: revision,
      clipId: fixture.clipId,
      durationTick: parsePositiveTick(360),
      noteId,
      sourceStartTick: parseTick(480),
    })

    expect(commit?.origin.commandType).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE)
    expect(notesOf(fixture.session)[0]).toMatchObject({ durationTick: 360, startTick: 480 })
    fixture.session.undo()
    expect(notesOf(fixture.session)[0]).toMatchObject({ durationTick: 240, startTick: 600 })
    fixture.session.redo()
    expect(notesOf(fixture.session)[0]).toMatchObject({ durationTick: 360, startTick: 480 })
  })

  it('returns null for an unchanged resize', () => {
    const fixture = createClipFixture('resize-unchanged')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-resize'))
    const noteId = addNote(edits, fixture, 120)

    expect(
      edits.resize({
        expectedSession: fixture.session,
        baseRevision: fixture.session.modelRevision,
        clipId: fixture.clipId,
        durationTick: parsePositiveTick(240),
        noteId,
        sourceStartTick: parseTick(600),
      }),
    ).toBeNull()
  })

  it('rejects a move or resize gesture that started before another edit landed', () => {
    const fixture = createClipFixture('gesture-stale')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-1', 'note-2'))
    const noteId = addNote(edits, fixture, 120)
    const gestureRevision = fixture.session.modelRevision
    addNote(edits, fixture, 480)
    const before = fixture.session.getSnapshot()
    const target = {
      expectedSession: fixture.session,
      baseRevision: gestureRevision,
      clipId: fixture.clipId,
    }

    expect(() =>
      edits.move({
        ...target,
        deltaPitch: parseMidiPitchDelta(1),
        deltaTick: parseTickDelta(120),
        noteIds: [noteId],
      }),
    ).toThrowError(stale)
    expect(() =>
      edits.resize({
        ...target,
        durationTick: parsePositiveTick(480),
        noteId,
        sourceStartTick: parseTick(600),
      }),
    ).toThrowError(stale)
    expect(() =>
      edits.add({
        ...target,
        clipStartTick: parseTick(0),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(stale)
    expect(fixture.session.getSnapshot()).toEqual(before)
  })

  it('removes a selection in one undoable Commit', () => {
    const fixture = createClipFixture('remove')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-1', 'note-2'))
    const noteIds = [addNote(edits, fixture, 120), addNote(edits, fixture, 480)]

    const commit = edits.remove({ clipId: fixture.clipId, noteIds })

    expect(commit.changes).toMatchObject([
      { op: 'remove', table: 'midiNotes' },
      { op: 'remove', table: 'midiNotes' },
    ])
    expect(notesOf(fixture.session)).toEqual([])
    fixture.session.undo()
    expect(
      notesOf(fixture.session)
        .map(({ id }) => id)
        .sort(),
    ).toEqual([...noteIds].sort())
  })

  it('does not partially remove a selection that contains a missing Note', () => {
    const fixture = createClipFixture('remove-missing')
    const edits = createNoteEdits(editContextFor(fixture.session, 'note-existing'))
    const existing = addNote(edits, fixture, 120)
    const missing = parseNoteId('note-missing')

    expect(() =>
      edits.remove({ clipId: fixture.clipId, noteIds: [existing, missing] }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'midi-note-not-found',
      }),
    )
    expect(notesOf(fixture.session).map(({ id }) => id)).toEqual([existing])
  })

  it('rejects a note starting at the Clip end before consuming an identity', () => {
    const fixture = createClipFixture('endpoint')
    const createId = vi.fn<() => string>(() => 'unused')

    expect(() =>
      createNoteEdits({ activeProject: { state: readyStateOf(fixture.session) }, createId }).add({
        expectedSession: fixture.session,
        baseRevision: fixture.session.modelRevision,
        clipId: fixture.clipId,
        clipStartTick: parseTick(960),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(expect.objectContaining<Partial<ProjectEditError>>({ code: 'not-placeable' }))
    expect(createId).not.toHaveBeenCalled()
  })

  it('rejects looped Clips as unsupported before consuming an identity', () => {
    const fixture = createClipFixture('looped', { looped: true })
    const createId = vi.fn<() => string>(() => 'unused')

    expect(() =>
      createNoteEdits({ activeProject: { state: readyStateOf(fixture.session) }, createId }).add({
        expectedSession: fixture.session,
        baseRevision: fixture.session.modelRevision,
        clipId: fixture.clipId,
        clipStartTick: parseTick(0),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(expect.objectContaining<Partial<ProjectEditError>>({ code: 'unsupported' }))
    expect(createId).not.toHaveBeenCalled()
  })

  it('rejects edits without a ready project, or against a missing Clip or Source', () => {
    const session = createEditTestSession('note-unavailable')
    const input = {
      expectedSession: session,
      baseRevision: session.modelRevision,
      clipId: parseClipId('clip-missing'),
      clipStartTick: parseTick(0),
      requestedDurationTick: parsePositiveTick(240),
      pitch: parseMidiPitch(60),
    }

    expect(() =>
      createNoteEdits({ activeProject: IDLE_PROJECT, createId: () => 'unused' }).add(input),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectEditError>>({ code: 'project-not-ready' }),
    )
    expect(() => createNoteEdits(editContextFor(session)).add(input)).toThrowError(stale)

    const fixture = createClipFixture('missing-source')
    const snapshot = fixture.session.getSnapshot()
    vi.spyOn(fixture.session, 'getSnapshot').mockReturnValue({ ...snapshot, midiSources: [] })
    expect(() =>
      createNoteEdits(editContextFor(fixture.session)).add({
        ...input,
        expectedSession: fixture.session,
        clipId: fixture.clipId,
      }),
    ).toThrowError(stale)
  })

  it('rejects every gesture captured on a replaced Session, even with equal ids and revision', () => {
    const previous = createClipFixture('replaced')
    const current = createClipFixture('replaced')
    const execute = vi.spyOn(current.session, 'execute')
    const createId = vi.fn<() => string>(() => 'unused')
    const edits = createNoteEdits({
      activeProject: { state: readyStateOf(current.session) },
      createId,
    })
    const target = {
      expectedSession: previous.session,
      baseRevision: previous.session.modelRevision,
      clipId: previous.clipId,
    }

    expect(() =>
      edits.placeOnTrack({
        expectedSession: previous.session,
        baseRevision: previous.session.modelRevision,
        activeClipId: previous.clipId,
        trackId: previous.session.getSnapshot().tracks[0]!.id,
        barSpanTick: parsePositiveTick(3_840),
        noteDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
        projectStartTick: parseTick(120),
      }),
    ).toThrowError(stale)
    expect(() =>
      edits.add({
        ...target,
        clipStartTick: parseTick(120),
        requestedDurationTick: parsePositiveTick(240),
        pitch: parseMidiPitch(60),
      }),
    ).toThrowError(stale)
    expect(() =>
      edits.move({
        ...target,
        deltaTick: parseTickDelta(120),
        deltaPitch: parseMidiPitchDelta(1),
        noteIds: [parseNoteId('old-note')],
      }),
    ).toThrowError(stale)
    expect(() =>
      edits.resize({
        ...target,
        noteId: parseNoteId('old-note'),
        durationTick: parsePositiveTick(480),
        sourceStartTick: parseTick(120),
      }),
    ).toThrowError(stale)
    expect(execute).not.toHaveBeenCalled()
    expect(createId).not.toHaveBeenCalled()
  })
})
