import {
  createMidiClipRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiPitch,
  parseMidiSourceId,
  parseNoteId,
  parseTick,
  parseTrackId,
} from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_DEFAULT_CENTER_PITCH,
  createInitialPianoRollViewport,
  createPianoRollPitchViewport,
  createPianoRollClipContext,
  createPianoRollNoteReadModel,
  createPianoRollViewport,
  pianoRollClipTickToCssPixel,
  pianoRollClipTickToSourceTick,
  pianoRollCssPixelToClipTickPosition,
  pianoRollCssPixelToMidiPitch,
  pianoRollMidiPitchToCssPixel,
  pianoRollSourceTickToClipTick,
  type PianoRollNoteReadModelListener,
} from '#internal/index'
import { createPianoRollProjectFixture } from '#internal/__tests__/support/piano-roll-project-fixture'

afterEach(() => {
  vi.unstubAllGlobals()
})

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

async function flushProjectPublications(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('PianoRollClipContext', () => {
  it('defines a frozen 1:1 Clip-local window over the owned MidiSource', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)!

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

  it('has no editing window for a looped Clip', () => {
    const { clip, source } = createClipRecords()
    const loopedClip = createMidiClipRecord({
      ...clip,
      loop: {
        sourceStartTick: parseTick(0),
        sourceSpanTick: parseTick(960),
      },
    })
    expect(createPianoRollClipContext(loopedClip, source)).toBeNull()
  })
})

describe('PianoRollViewport', () => {
  it('maps partially visible rows', () => {
    const input = {
      heightCssPixel: 40,
      maximumPitch: parseMidiPitch(72),
      minimumPitch: parseMidiPitch(70),
      pitchRowHeightCssPixel: 20,
      pitchOffsetCssPixel: 5,
    }
    const viewport = createPianoRollPitchViewport(input)
    expect(pianoRollMidiPitchToCssPixel(viewport, parseMidiPitch(72))).toBe(-5)
    expect(pianoRollMidiPitchToCssPixel(viewport, parseMidiPitch(70))).toBe(35)
    expect(pianoRollCssPixelToMidiPitch(viewport, 14.99)).toBe(72)
    expect(pianoRollCssPixelToMidiPitch(viewport, 15)).toBe(71)
    expect(pianoRollCssPixelToMidiPitch(viewport, 39.99)).toBe(70)
  })
  it('maps the full initial Clip and discrete pitch rows in CSS Pixels', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)!
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
    const context = createPianoRollClipContext(clip, source)!
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

  it('rejects a Surface without size and maps positions past its edges', () => {
    const { clip, source } = createClipRecords()
    const context = createPianoRollClipContext(clip, source)!
    const baseInput = {
      widthCssPixel: 960,
      heightCssPixel: 480,
      minimumPitch: parseMidiPitch(48),
      maximumPitch: parseMidiPitch(71),
      visibleStartTick: parseTick(0),
      visibleSpanTick: parseTick(960),
    }

    expect(() => createPianoRollViewport(context, { ...baseInput, widthCssPixel: 0 })).toThrowError(
      RangeError,
    )
    expect(() =>
      createPianoRollViewport(context, { ...baseInput, heightCssPixel: Number.NaN }),
    ).toThrowError(RangeError)

    const viewport = createPianoRollViewport(context, baseInput)
    expect(pianoRollClipTickToCssPixel(viewport, parseTick(1_200))).toBe(1_200)
    expect(pianoRollCssPixelToMidiPitch(viewport, viewport.heightCssPixel)).toBe(48)
    expect(pianoRollCssPixelToMidiPitch(viewport, -10)).toBe(71)
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
    expect(
      readModel.state.notes.map(({ visibleStartTick, visibleEndTick }) => [
        visibleStartTick,
        visibleEndTick,
      ]),
    ).toEqual([
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
    const onStateChange = vi.fn<PianoRollNoteReadModelListener>()
    readModel.subscribe(onStateChange)

    fixture.addNote({
      noteId: parseNoteId('editor-note-visible-added'),
      startTick: parseTick(1_200),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(67),
    })
    await vi.waitFor(() => expect(onStateChange).toHaveBeenCalledOnce())

    expect(readModel.state.notes.map(({ note }) => note.id)).toContain('editor-note-visible-added')

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
    const onStateChange = vi.fn<PianoRollNoteReadModelListener>()
    readModel.subscribe(onStateChange)
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
    expect(readModel.state.viewport).toBe(secondViewport)
    expect(readModel.state.notes).toEqual([])
    readModel.dispose()
  })

  it('reports a listener failure without stopping the others, and rejects use after disposal', async () => {
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
    const reportError = vi.fn<(error: unknown) => void>()
    vi.stubGlobal('reportError', reportError)
    const failure = new Error('Listener failed')
    const secondStateChange = vi.fn<PianoRollNoteReadModelListener>()
    readModel.subscribe(() => {
      throw failure
    })
    readModel.subscribe(secondStateChange)

    fixture.addNote({
      noteId: parseNoteId('editor-note-observer-isolation'),
      startTick: parseTick(1_400),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(65),
    })
    await vi.waitFor(() => expect(secondStateChange).toHaveBeenCalledOnce())

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure)

    readModel.dispose()
    expect(() => readModel.setViewport(viewport)).toThrowError('disposed')
    expect(() => readModel.subscribe(vi.fn())).toThrowError('disposed')
  })
})
