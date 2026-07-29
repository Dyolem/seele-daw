import {
  createMidiClipRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiPitch,
  parseMidiSourceId,
  parseNoteId,
  parseTick,
  parseTrackId,
  type ProjectCommit,
  type ProjectSession,
  type ProjectSubscription,
  type ProjectSubscriptionObserver,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_DEFAULT_CENTER_PITCH,
  PianoRollError,
  createInitialPianoRollViewport,
  createPianoRollClipContext,
  createPianoRollNoteReadModel,
  createPianoRollViewport,
  pianoRollClipTickToCssPixel,
  pianoRollClipTickToSourceTick,
  pianoRollCssPixelToClipTickPosition,
  pianoRollCssPixelToMidiPitch,
  pianoRollMidiPitchToCssPixel,
  pianoRollSourceTickToClipTick,
  type PianoRollNoteReadModelObserver,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

function createClipRecords() {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('piano-roll-context-source'),
    lengthTick: parseTick(1_920),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('piano-roll-context-clip'),
    trackId: parseTrackId('piano-roll-context-track'),
    name: 'Piano Roll Context',
    color: null,
    muted: false,
    startTick: parseTick(3_840),
    spanTick: parseTick(960),
    sourceId: source.id,
    sourceOffsetTick: parseTick(480),
    loop: null,
  })

  return { clip, source }
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

async function flushProjectPublications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PianoRollClipContext', () => {
  it('defines a frozen 1:1 Clip-local window over the owned MidiSource', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)

    expect(context).toEqual({
      clipId: clip.id,
      clipSpanTick: parseTick(960),
      sourceEndTick: parseTick(1_440),
      sourceId: source.id,
      sourceLengthTick: parseTick(1_920),
      sourceStartTick: parseTick(480),
    })
    expect(pianoRollClipTickToSourceTick(context, parseTick(240))).toBe(720)
    expect(pianoRollSourceTickToClipTick(context, parseTick(1_200))).toBe(720)
    expect(Object.isFrozen(context)).toBe(true)
  })

  it('fails closed for unrelated Sources, invalid ranges and looped Clips', () => {
    const { clip, source } = createClipRecords()
    const mismatch = createMidiSourceRecord({
      id: parseMidiSourceId('piano-roll-context-mismatch'),
      lengthTick: source.lengthTick,
    })
    expect(
      requirePianoRollError(() => createPianoRollClipContext(clip, mismatch)).code,
    ).toBe('clip-source-mismatch')

    const shortSource = createMidiSourceRecord({
      id: source.id,
      lengthTick: parseTick(1_200),
    })
    expect(
      requirePianoRollError(() => createPianoRollClipContext(clip, shortSource)).code,
    ).toBe('clip-source-range-invalid')

    const loopedClip = createMidiClipRecord({
      ...clip,
      loop: {
        sourceStartTick: parseTick(0),
        sourceSpanTick: parseTick(960),
      },
    })
    expect(
      requirePianoRollError(() => createPianoRollClipContext(loopedClip, source)).code,
    ).toBe('looped-clip-unsupported')
  })

  it('rejects endpoint conversion outside the Clip window', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)

    expect(
      requirePianoRollError(() =>
        pianoRollClipTickToSourceTick(context, parseTick(961)),
      ).code,
    ).toBe('tick-outside-clip')
    expect(
      requirePianoRollError(() =>
        pianoRollSourceTickToClipTick(context, parseTick(479)),
      ).code,
    ).toBe('tick-outside-clip')
  })
})

describe('PianoRollViewport', () => {
  it('maps the full initial Clip and discrete pitch rows in CSS Pixels', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)
    const viewport = createInitialPianoRollViewport(context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(71),
    })

    expect(PIANO_ROLL_DEFAULT_CENTER_PITCH).toBe(60)
    expect(viewport.visibleStartTick).toBe(0)
    expect(viewport.visibleEndTick).toBe(960)
    expect(pianoRollClipTickToCssPixel(viewport, parseTick(480))).toBe(480)
    expect(pianoRollCssPixelToClipTickPosition(viewport, 240)).toBe(240)
    expect(pianoRollMidiPitchToCssPixel(viewport, parseMidiPitch(71))).toBe(0)
    expect(pianoRollMidiPitchToCssPixel(viewport, parseMidiPitch(48))).toBe(460)
    expect(pianoRollCssPixelToMidiPitch(viewport, 0)).toBe(71)
    expect(pianoRollCssPixelToMidiPitch(viewport, 479)).toBe(48)
    expect(Object.isFrozen(viewport)).toBe(true)
  })

  it('keeps inverse time mapping continuous for later Snap policy', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)
    const viewport = createPianoRollViewport(context, {
      widthCssPixel: 333,
      heightCssPixel: 240,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(71),
      visibleStartTick: parseTick(120),
      visibleSpanTick: parseTick(480),
    })
    const position = pianoRollCssPixelToClipTickPosition(viewport, 111)

    expect(position).toBe(280)
    expect(Number.isInteger(position)).toBe(true)
    expect(pianoRollCssPixelToClipTickPosition(viewport, 100)).not.toBe(
      Math.round(pianoRollCssPixelToClipTickPosition(viewport, 100)),
    )
  })

  it('rejects invalid geometry, ranges and coordinates', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)
    const baseInput = {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(71),
      visibleStartTick: parseTick(0),
      visibleSpanTick: parseTick(960),
    }

    expect(
      requirePianoRollError(() =>
        createPianoRollViewport(context, { ...baseInput, widthCssPixel: 0 }),
      ).code,
    ).toBe('invalid-viewport-dimension')
    expect(
      requirePianoRollError(() =>
        createPianoRollViewport(context, {
          ...baseInput,
          minimumPitch: parseMidiPitch(72),
        }),
      ).code,
    ).toBe('invalid-viewport-pitch-range')
    expect(
      requirePianoRollError(() =>
        createPianoRollViewport(context, {
          ...baseInput,
          visibleStartTick: parseTick(1),
        }),
      ).code,
    ).toBe('viewport-outside-clip')

    const viewport = createPianoRollViewport(context, baseInput)
    expect(
      requirePianoRollError(() =>
        pianoRollClipTickToCssPixel(viewport, parseTick(961)),
      ).code,
    ).toBe('coordinate-outside-viewport')
    expect(
      requirePianoRollError(() =>
        pianoRollCssPixelToMidiPitch(viewport, viewport.heightCssPixel),
      ).code,
    ).toBe('coordinate-outside-viewport')
  })
})

describe('PianoRollNoteReadModel', () => {
  it('queries visible Notes and clips their draw range to the Viewport', () => {
    const fixture = createPianoRollProjectFixture()
    const viewport = createPianoRollViewport(fixture.context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(72),
      visibleStartTick: parseTick(0),
      visibleSpanTick: parseTick(960),
    })
    const readModel = createPianoRollNoteReadModel({
      context: fixture.context,
      session: fixture.session,
      viewport,
    })

    expect(readModel.state.notes.map(({ note }) => note.id)).toEqual([
      'editor-note-leading',
      'editor-note-inside',
    ])
    expect(readModel.state.notes.map(({ visibleStartTick, visibleEndTick }) => [
      visibleStartTick,
      visibleEndTick,
    ])).toEqual([
      [0, 240],
      [480, 720],
    ])
    expect(Object.isFrozen(readModel.state)).toBe(true)
    expect(Object.isFrozen(readModel.state.notes)).toBe(true)
    expect(Object.isFrozen(readModel.state.notes[0])).toBe(true)

    readModel.dispose()
  })

  it('requeries matching Note commits and ignores changes outside the visible range', async () => {
    const fixture = createPianoRollProjectFixture()
    const viewport = createPianoRollViewport(fixture.context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(72),
      visibleStartTick: parseTick(0),
      visibleSpanTick: parseTick(960),
    })
    const readModel = createPianoRollNoteReadModel({
      context: fixture.context,
      session: fixture.session,
      viewport,
    })
    const onStateChange =
      vi.fn<PianoRollNoteReadModelObserver['onStateChange']>()
    readModel.subscribe({
      onError: vi.fn<PianoRollNoteReadModelObserver['onError']>(),
      onStateChange,
    })

    fixture.addNote({
      noteId: parseNoteId('editor-note-visible-added'),
      startTick: parseTick(1_200),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(67),
    })
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledOnce())

    expect(readModel.state.notes.map(({ note }) => note.id)).toContain(
      'editor-note-visible-added',
    )

    fixture.addNote({
      noteId: parseNoteId('editor-note-outside-added'),
      startTick: parseTick(2_000),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(67),
    })
    await flushProjectPublications()

    expect(onStateChange).toHaveBeenCalledOnce()
    readModel.dispose()
  })

  it('atomically replaces the visible query when the Viewport changes', () => {
    const fixture = createPianoRollProjectFixture()
    const firstViewport = createPianoRollViewport(fixture.context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(72),
      visibleStartTick: parseTick(0),
      visibleSpanTick: parseTick(960),
    })
    const readModel = createPianoRollNoteReadModel({
      context: fixture.context,
      session: fixture.session,
      viewport: firstViewport,
    })
    const onStateChange =
      vi.fn<PianoRollNoteReadModelObserver['onStateChange']>()
    readModel.subscribe({
      onError: vi.fn<PianoRollNoteReadModelObserver['onError']>(),
      onStateChange,
    })
    const secondViewport = createPianoRollViewport(fixture.context, {
      widthCssPixel: 480,
      heightCssPixel: 320,
      minimumPitch: parseMidiPitch(60),
      maximumPitch: parseMidiPitch(96),
      visibleStartTick: parseTick(960),
      visibleSpanTick: parseTick(960),
    })

    readModel.setViewport(secondViewport)

    expect(onStateChange).toHaveBeenCalledOnce()
    expect(readModel.state.viewport).not.toBe(secondViewport)
    expect(readModel.state.viewport).toEqual(secondViewport)
    expect(readModel.state.notes).toEqual([])
    readModel.dispose()
  })

  it('isolates Observer failures and rejects use after disposal', async () => {
    const fixture = createPianoRollProjectFixture()
    const viewport = createInitialPianoRollViewport(fixture.context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(72),
    })
    const readModel = createPianoRollNoteReadModel({
      context: fixture.context,
      session: fixture.session,
      viewport,
    })
    const firstError = vi.fn<PianoRollNoteReadModelObserver['onError']>()
    const secondStateChange =
      vi.fn<PianoRollNoteReadModelObserver['onStateChange']>()
    readModel.subscribe({
      onError: firstError,
      onStateChange: () => {
        throw new Error('Observer failed')
      },
    })
    readModel.subscribe({
      onError: vi.fn<PianoRollNoteReadModelObserver['onError']>(),
      onStateChange: secondStateChange,
    })

    fixture.addNote({
      noteId: parseNoteId('editor-note-observer-isolation'),
      startTick: parseTick(1_400),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(65),
    })
    await vi.waitFor(() => expect(secondStateChange).toHaveBeenCalledOnce())

    expect(firstError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'observer-delivery' }),
    )

    readModel.dispose()
    expect(
      requirePianoRollError(() => readModel.setViewport(viewport)).code,
    ).toBe('read-model-disposed')
    expect(
      requirePianoRollError(() =>
        readModel.subscribe({
          onError: vi.fn<PianoRollNoteReadModelObserver['onError']>(),
          onStateChange:
            vi.fn<PianoRollNoteReadModelObserver['onStateChange']>(),
        }),
      ).code,
    ).toBe('read-model-disposed')
  })

  it('surfaces Project subscription and refresh failures without changing state', () => {
    const fixture = createPianoRollProjectFixture()
    const viewport = createInitialPianoRollViewport(fixture.context, {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(72),
    })
    let projectObserver: ProjectSubscriptionObserver | null = null
    let failQuery = false
    const session: Pick<ProjectSession, 'query' | 'subscribe'> = {
      query(query) {
        if (failQuery) throw new Error('Query failed')
        return fixture.session.query(query)
      },
      subscribe(
        _subscription: ProjectSubscription,
        observer: ProjectSubscriptionObserver,
      ) {
        projectObserver = observer
        return () => undefined
      },
    }
    const readModel = createPianoRollNoteReadModel({
      context: fixture.context,
      session,
      viewport,
    })
    const onError = vi.fn<PianoRollNoteReadModelObserver['onError']>()
    readModel.subscribe({
      onError,
      onStateChange:
        vi.fn<PianoRollNoteReadModelObserver['onStateChange']>(),
    })
    const initialState = readModel.state
    const subscribedProjectObserver =
      projectObserver as ProjectSubscriptionObserver | null
    if (subscribedProjectObserver === null) {
      throw new Error('Expected Project subscription')
    }

    subscribedProjectObserver.onError({
      cause: new Error('Project observer failed'),
      commit: Object.freeze({}) as ProjectCommit,
      subscription: Object.freeze({}) as ProjectSubscription,
    })
    failQuery = true
    subscribedProjectObserver.onCommit(Object.freeze({}) as ProjectCommit)

    expect(onError.mock.calls.map(([failure]) => failure.operation)).toEqual([
      'project-subscription',
      'project-query',
    ])
    expect(readModel.state).toBe(initialState)
    readModel.dispose()
  })
})
