import {
  PROJECT_SUBSCRIPTION_TYPE,
  parseMidiPitch,
  parseNoteId,
  parseTick,
  type ProjectSession,
} from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPianoRollEditorSession, type PianoRollEditorSessionListener } from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

async function flushProjectPublications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PianoRollEditorSession selection', () => {
  it('publishes frozen Clip-scoped selection without copying Note records', () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const onStateChange = vi.fn<PianoRollEditorSessionListener>()
    editorSession.subscribe(onStateChange)
    const initialState = editorSession.state
    const noteId = parseNoteId('editor-note-inside')

    expect(initialState).toEqual({
      clipId: fixture.context.clipId,
      selectedNoteIds: [],
      sourceId: fixture.context.sourceId,
    })
    expect(Object.isFrozen(initialState)).toBe(true)
    expect(Object.isFrozen(initialState.selectedNoteIds)).toBe(true)

    expect(editorSession.selectOnly(noteId)).toBe(true)
    expect(editorSession.state.selectedNoteIds).toEqual([noteId])
    expect(Object.isFrozen(editorSession.state)).toBe(true)
    expect(Object.isFrozen(editorSession.state.selectedNoteIds)).toBe(true)
    expect(editorSession.state).not.toBe(initialState)

    const selectedState = editorSession.state
    expect(editorSession.selectOnly(noteId)).toBe(false)
    expect(editorSession.selectOnly(parseNoteId('editor-note-missing'))).toBe(false)
    expect(editorSession.selectOnly(parseNoteId('editor-note-after-clip'))).toBe(false)
    expect(editorSession.state).toBe(selectedState)
    expect(onStateChange).toHaveBeenCalledOnce()

    editorSession.dispose()
  })

  it('toggles additive selection in stable order and clears idempotently', () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const leadingNoteId = parseNoteId('editor-note-leading')
    const insideNoteId = parseNoteId('editor-note-inside')

    expect(editorSession.toggleSelection(leadingNoteId)).toBe(true)
    expect(editorSession.toggleSelection(insideNoteId)).toBe(true)
    expect(editorSession.state.selectedNoteIds).toEqual([leadingNoteId, insideNoteId])

    expect(editorSession.toggleSelection(leadingNoteId)).toBe(true)
    expect(editorSession.state.selectedNoteIds).toEqual([insideNoteId])
    expect(editorSession.clearSelection()).toBe(true)
    expect(editorSession.clearSelection()).toBe(false)
    expect(editorSession.toggleSelection(parseNoteId('editor-note-missing'))).toBe(false)
    expect(editorSession.state.selectedNoteIds).toEqual([])

    editorSession.dispose()
  })

  it('keeps selected Notes outside the Viewport but removes Notes leaving the Clip window', async () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const noteId = parseNoteId('editor-note-inside')
    const onStateChange = vi.fn<PianoRollEditorSessionListener>()
    editorSession.subscribe(onStateChange)

    editorSession.selectOnly(noteId)
    const selectedState = editorSession.state
    fixture.moveNote(noteId, parseTick(960), parseMidiPitch(90))
    await flushProjectPublications()

    expect(editorSession.state).toBe(selectedState)
    expect(editorSession.state.selectedNoteIds).toEqual([noteId])
    expect(onStateChange).toHaveBeenCalledOnce()

    fixture.moveNote(noteId, parseTick(2_520), parseMidiPitch(90))
    await flushProjectPublications()

    expect(editorSession.state.selectedNoteIds).toEqual([])
    expect(onStateChange).toHaveBeenCalledTimes(2)
    editorSession.dispose()
  })

  it('reconciles deletion and History from authoritative Note queries', async () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const noteId = parseNoteId('editor-note-inside')

    editorSession.selectOnly(noteId)
    fixture.removeNote(noteId)
    await flushProjectPublications()
    expect(editorSession.state.selectedNoteIds).toEqual([])

    expect(fixture.session.undo()).not.toBeNull()
    await flushProjectPublications()
    expect(editorSession.state.selectedNoteIds).toEqual([])

    editorSession.selectOnly(noteId)
    expect(fixture.session.redo()).not.toBeNull()
    await flushProjectPublications()
    expect(editorSession.state.selectedNoteIds).toEqual([])

    editorSession.dispose()
  })

  it("follows its Source's Note changes until disposed", () => {
    const fixture = createPianoRollProjectFixture()
    const unsubscribeProject = vi.fn<() => void>()
    const session: Pick<ProjectSession, 'query' | 'subscribe'> = {
      query: (query) => fixture.session.query(query),
      subscribe(subscription) {
        expect(subscription).toEqual({
          type: PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES,
          sourceIds: [fixture.context.sourceId],
        })
        return unsubscribeProject
      },
    }
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session,
    })

    editorSession.dispose()
    expect(unsubscribeProject).toHaveBeenCalledOnce()
  })

  it('reports a listener failure without stopping the others, and rejects use after disposal', () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const reportError = vi.fn<(error: unknown) => void>()
    vi.stubGlobal('reportError', reportError)
    const failure = new Error('Listener failed')
    const secondStateChange = vi.fn<PianoRollEditorSessionListener>()
    editorSession.subscribe(() => {
      throw failure
    })
    editorSession.subscribe(secondStateChange)

    editorSession.selectOnly(parseNoteId('editor-note-inside'))

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure)
    expect(secondStateChange).toHaveBeenCalledOnce()

    editorSession.dispose()
    editorSession.dispose()
    expect(() => editorSession.clearSelection()).toThrowError('disposed')
    expect(() => editorSession.selectOnly(parseNoteId('editor-note-inside'))).toThrowError(
      'disposed',
    )
    expect(() => editorSession.toggleSelection(parseNoteId('editor-note-inside'))).toThrowError(
      'disposed',
    )
    expect(() => editorSession.subscribe(vi.fn())).toThrowError('disposed')
  })
})
