import {
  PROJECT_SUBSCRIPTION_TYPE,
  parseMidiPitch,
  parseNoteId,
  parseTick,
  type ProjectCommit,
  type ProjectSession,
  type ProjectSubscription,
  type ProjectSubscriptionObserver,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import {
  PianoRollError,
  createPianoRollEditorSession,
  type PianoRollEditorSessionObserver,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

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

async function flushProjectPublications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PianoRollEditorSession selection', () => {
  it('publishes frozen Clip-scoped selection without copying Note records', () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const onStateChange =
      vi.fn<PianoRollEditorSessionObserver['onStateChange']>()
    editorSession.subscribe({
      onError: vi.fn<PianoRollEditorSessionObserver['onError']>(),
      onStateChange,
    })
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
    expect(
      editorSession.selectOnly(parseNoteId('editor-note-after-clip')),
    ).toBe(false)
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
    expect(editorSession.state.selectedNoteIds).toEqual([
      leadingNoteId,
      insideNoteId,
    ])

    expect(editorSession.toggleSelection(leadingNoteId)).toBe(true)
    expect(editorSession.state.selectedNoteIds).toEqual([insideNoteId])
    expect(editorSession.clearSelection()).toBe(true)
    expect(editorSession.clearSelection()).toBe(false)
    expect(
      editorSession.toggleSelection(parseNoteId('editor-note-missing')),
    ).toBe(false)
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
    const onStateChange =
      vi.fn<PianoRollEditorSessionObserver['onStateChange']>()
    editorSession.subscribe({
      onError: vi.fn<PianoRollEditorSessionObserver['onError']>(),
      onStateChange,
    })

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

  it('reports reconciliation failures without replacing valid selection', () => {
    const fixture = createPianoRollProjectFixture()
    let projectObserver: ProjectSubscriptionObserver | null = null
    let failQuery = false
    const unsubscribeProject = vi.fn<() => void>()
    const session: Pick<ProjectSession, 'query' | 'subscribe'> = {
      query(query) {
        if (failQuery) throw new Error('Selection query failed')
        return fixture.session.query(query)
      },
      subscribe(subscription, observer) {
        expect(subscription).toEqual({
          type: PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES,
          sourceIds: [fixture.context.sourceId],
        })
        projectObserver = observer
        return unsubscribeProject
      },
    }
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session,
    })
    const onError = vi.fn<PianoRollEditorSessionObserver['onError']>()
    editorSession.subscribe({
      onError,
      onStateChange:
        vi.fn<PianoRollEditorSessionObserver['onStateChange']>(),
    })
    const noteId = parseNoteId('editor-note-inside')
    editorSession.selectOnly(noteId)
    const selectedState = editorSession.state
    const subscribedProjectObserver =
      projectObserver as ProjectSubscriptionObserver | null
    if (subscribedProjectObserver === null) {
      throw new Error('Expected Project subscription')
    }

    failQuery = true
    subscribedProjectObserver.onCommit(Object.freeze({}) as ProjectCommit)
    subscribedProjectObserver.onError({
      cause: new Error('Project observer failed'),
      commit: Object.freeze({}) as ProjectCommit,
      subscription: Object.freeze({}) as ProjectSubscription,
    })

    expect(onError.mock.calls.map(([failure]) => failure.operation)).toEqual([
      'project-query',
      'project-subscription',
    ])
    expect(editorSession.state).toBe(selectedState)

    editorSession.dispose()
    expect(unsubscribeProject).toHaveBeenCalledOnce()
  })

  it('isolates observers and rejects selection operations after disposal', () => {
    const fixture = createPianoRollProjectFixture()
    const editorSession = createPianoRollEditorSession({
      context: fixture.context,
      session: fixture.session,
    })
    const firstError = vi.fn<PianoRollEditorSessionObserver['onError']>()
    const secondStateChange =
      vi.fn<PianoRollEditorSessionObserver['onStateChange']>()
    editorSession.subscribe({
      onError: firstError,
      onStateChange: () => {
        throw new Error('Observer failed')
      },
    })
    editorSession.subscribe({
      onError: vi.fn<PianoRollEditorSessionObserver['onError']>(),
      onStateChange: secondStateChange,
    })

    editorSession.selectOnly(parseNoteId('editor-note-inside'))

    expect(firstError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'observer-delivery' }),
    )
    expect(secondStateChange).toHaveBeenCalledOnce()

    editorSession.dispose()
    editorSession.dispose()
    expect(
      requirePianoRollError(() => editorSession.clearSelection()).code,
    ).toBe('editor-session-disposed')
    expect(
      requirePianoRollError(() =>
        editorSession.selectOnly(parseNoteId('editor-note-inside')),
      ).code,
    ).toBe('editor-session-disposed')
    expect(
      requirePianoRollError(() =>
        editorSession.toggleSelection(parseNoteId('editor-note-inside')),
      ).code,
    ).toBe('editor-session-disposed')
    expect(
      requirePianoRollError(() =>
        editorSession.subscribe({
          onError: vi.fn<PianoRollEditorSessionObserver['onError']>(),
          onStateChange:
            vi.fn<PianoRollEditorSessionObserver['onStateChange']>(),
        }),
      ).code,
    ).toBe('editor-session-disposed')
  })
})
