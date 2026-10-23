// @vitest-environment jsdom

import {
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseProjectColor,
  parseTick,
  parseTrackId,
} from '@seele-daw/project-core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createFakeCanvasFixture } from '#internal/__tests__/support/fake-canvas'
import {
  PIANO_ROLL_HIT_ZONE,
  createPianoRollCanvasNoteRenderer,
  createPianoRollClipContext,
  createPianoRollDomNoteRenderer,
  createPianoRollGrid,
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  createPianoRollTimelineViewport,
  createPianoRollViewport,
  PianoRollError,
  type PianoRollGridCanvasTheme,
  type PianoRollVisibleNote,
} from '#internal/index'

const gridTheme: PianoRollGridCanvasTheme = Object.freeze({
  background: '#070809',
  blackPitchRow: '#080a0c',
  gridBar: '#ffffff',
  gridBeat: '#aaaaaa',
  gridSubdivision: '#333333',
  pitchRowBorder: '#222222',
  whitePitchRow: '#101317',
})

function createRendererFixture() {
  const gridCanvas = createFakeCanvasFixture()
  const gridRenderer = createPianoRollGridCanvasRenderer({
    canvas: gridCanvas.canvas,
    devicePixelRatio: 2,
  })
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('renderer-source'),
    lengthTick: parsePositiveTick(3_840),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('renderer-clip'),
    trackId: parseTrackId('renderer-track'),
    name: 'Renderer Clip',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parsePositiveTick(3_840),
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })
  const context = createPianoRollClipContext(clip, source)
  const viewport = createPianoRollViewport(context, {
    heightCssPixel: 250,
    maximumPitch: parseMidiPitch(72),
    minimumPitch: parseMidiPitch(48),
    visibleSpanTick: clip.spanTick,
    visibleStartTick: parseTick(0),
    widthCssPixel: 960,
  })
  const visibleNote: PianoRollVisibleNote = Object.freeze({
    note: createMidiNoteRecord({
      id: parseNoteId('renderer-note'),
      startTick: parseTick(960),
      durationTick: parsePositiveTick(960),
      pitch: parseMidiPitch(60),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
    visibleEndTick: parseTick(1_920),
    visibleStartTick: parseTick(960),
  })
  const noteScene = createPianoRollNoteScene({
    clipId: parseClipId('renderer-clip'),
    notes: Object.freeze([visibleNote]),
    selectedNoteIds: Object.freeze([]),
    style: {
      borderColor: '#f2eee5',
      fillColor: parseProjectColor('#8B5CF6'),
      opacity: 1,
      selectedBorderColor: '#f4e7b9',
      selectedGlowColor: 'rgb(232 217 168 / 58%)',
    },
    viewport,
  })

  return {
    gridCanvas,
    gridRenderer,
    noteScene,
    viewport,
    visibleNote,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('Piano Roll Browser Renderers', () => {
  it('keeps surviving nodes connected and only patches changed visual properties on pitch scroll', () => {
    const { noteScene } = createRendererFixture()
    const first = noteScene.notes[0]
    if (first === undefined) throw new Error('Expected Note visual')
    const second = { ...first, noteId: parseNoteId('second-note'), xCssPixel: 500 }
    const container = document.createElement('div')
    const renderer = createPianoRollDomNoteRenderer({ container })
    renderer.render({ ...noteScene, notes: [first, second] })
    const layer = container.firstElementChild
    const body = layer?.lastElementChild
    if (!layer || !body) throw new Error('Expected rendered Notes')
    const observer = new MutationObserver(() => undefined)
    observer.observe(layer, { childList: true })
    observer.observe(body, { attributes: true, subtree: true })

    renderer.render({
      ...noteScene,
      notes: [first, { ...second, yCssPixel: second.yCssPixel + 20 }],
    })
    const mutations = observer.takeRecords()
    expect(mutations).toHaveLength(1)
    expect(mutations[0]?.attributeName).toBe('style')
    expect(mutations[0]?.target).toBe(body)
    expect(layer.lastElementChild).toBe(body)

    renderer.render({ ...noteScene, notes: [{ ...second, yCssPixel: second.yCssPixel + 20 }] })
    const removal = observer.takeRecords()
    expect(removal).toHaveLength(1)
    expect(removal[0]?.removedNodes).toHaveLength(1)
    expect(removal[0]?.addedNodes).toHaveLength(0)
    expect(layer.firstElementChild).toBe(body)
    observer.disconnect()
    renderer.dispose()
  })

  it('keeps separate linked Clip nodes and reuses the surviving occurrence after removal', () => {
    const fixture = createRendererFixture()
    const first = fixture.noteScene.notes[0]
    if (first === undefined) throw new Error('Expected Note visual')
    const linked = { ...first, clipId: parseClipId('linked-clip'), xCssPixel: 600 }
    const scene = { ...fixture.noteScene, notes: [first, linked] }
    const container = document.createElement('div')
    const renderer = createPianoRollDomNoteRenderer({ container })
    renderer.render(scene)
    const bodies = container.querySelectorAll<HTMLElement>('.sd-piano-roll-dom-note')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]?.style.transform).toContain('240px')
    expect(bodies[1]?.style.transform).toContain('600px')
    expect(bodies[1]?.dataset.pianoRollNoteId).toBe(first.noteId)
    expect(bodies[1]?.dataset.pianoRollClipId).toBe(linked.clipId)
    renderer.render({ ...scene, notes: [linked, first] })
    expect(container.querySelector('.sd-piano-roll-dom-note')).toBe(bodies[1])
    renderer.render({ ...scene, notes: [linked] })
    expect(container.querySelectorAll('.sd-piano-roll-dom-note')).toHaveLength(1)
    expect(container.querySelector('.sd-piano-roll-dom-note')).toBe(bodies[1])
    renderer.dispose()
    expect(container.childElementCount).toBe(0)

    const canvas = createFakeCanvasFixture()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvas.context)
    const canvasRenderer = createPianoRollCanvasNoteRenderer({ container })
    canvasRenderer.render(scene)
    expect(
      canvas.operations
        .filter(({ name }) => name === 'fillRect')
        .map(({ arguments: args }) => args[0]),
    ).toEqual([240, 600])
    canvasRenderer.dispose()
    fixture.gridRenderer.dispose()
  })
  it('keeps Grid rows and Note bodies aligned when both edge rows are clipped', () => {
    const fixture = createRendererFixture()
    const viewport = createPianoRollTimelineViewport({
      ...fixture.viewport,
      heightCssPixel: 40,
      maximumPitch: parseMidiPitch(62),
      minimumPitch: parseMidiPitch(60),
      pitchRowHeightCssPixel: 20,
      pitchOffsetCssPixel: 5,
    })
    fixture.gridRenderer.render({
      grid: createPianoRollGrid({
        barSpanTick: parsePositiveTick(3_840),
        beatSpanTick: parsePositiveTick(960),
        originTick: parseTick(0),
        subdivisionSpanTick: parsePositiveTick(240),
      }),
      theme: gridTheme,
      viewport,
    })
    expect(fixture.gridCanvas.canvas.height).toBe(80)
    const fills = fixture.gridCanvas.operations.filter(({ name }) => name === 'fillRect')
    expect(fills.map((operation) => operation.arguments)).toContainEqual([0, -5, 960, 20])
    expect(fills.map((operation) => operation.arguments)).toContainEqual([0, 35, 960, 20])
    const scene = createPianoRollNoteScene({
      clipId: parseClipId('renderer-clip'),
      notes: [fixture.visibleNote],
      selectedNoteIds: [],
      style: {
        borderColor: '#fff',
        fillColor: '#888',
        opacity: 1,
        selectedBorderColor: '#fff',
        selectedGlowColor: '#fff',
      },
      viewport,
    })
    expect(scene.notes[0]).toMatchObject({ xCssPixel: 240, yCssPixel: 36, heightCssPixel: 18 })
    fixture.gridRenderer.dispose()
  })
  it('creates an evenly nested immutable display grid', () => {
    const grid = createPianoRollGrid({
      barSpanTick: parsePositiveTick(3_840),
      beatSpanTick: parsePositiveTick(960),
      originTick: parseTick(0),
      subdivisionSpanTick: parsePositiveTick(240),
    })

    expect(grid).toEqual({
      barSpanTick: 3_840,
      beatSpanTick: 960,
      originTick: 0,
      subdivisionSpanTick: 240,
    })
    expect(Object.isFrozen(grid)).toBe(true)
  })

  it('rejects display grids whose bar and beat divisions do not nest evenly', () => {
    expect(() =>
      createPianoRollGrid({
        barSpanTick: parsePositiveTick(3_840),
        beatSpanTick: parsePositiveTick(1_000),
        originTick: parseTick(0),
        subdivisionSpanTick: parsePositiveTick(250),
      }),
    ).toThrow(PianoRollError)
  })

  it('rejects display grids whose beat and subdivision divisions do not nest evenly', () => {
    expect(() =>
      createPianoRollGrid({
        barSpanTick: parsePositiveTick(3_840),
        beatSpanTick: parsePositiveTick(960),
        originTick: parseTick(0),
        subdivisionSpanTick: parsePositiveTick(250),
      }),
    ).toThrow(PianoRollError)
  })

  it('sizes the static Grid bitmap for DPR and suppresses invisible divisions', () => {
    const fixture = createRendererFixture()

    fixture.gridRenderer.render({
      grid: createPianoRollGrid({
        barSpanTick: parsePositiveTick(3_840),
        beatSpanTick: parsePositiveTick(960),
        originTick: parseTick(0),
        subdivisionSpanTick: parsePositiveTick(1),
      }),
      theme: gridTheme,
      viewport: fixture.viewport,
    })

    expect(fixture.gridCanvas.canvas.width).toBe(1_920)
    expect(fixture.gridCanvas.canvas.height).toBe(500)
    expect(fixture.gridCanvas.canvas.style.width).toBe('960px')
    expect(
      fixture.gridCanvas.operations.filter((operation) => operation.name === 'stroke'),
    ).toHaveLength(3)
  })

  it('aligns visible Grid divisions to the shared Timeline origin', () => {
    const fixture = createRendererFixture()

    fixture.gridRenderer.render({
      grid: createPianoRollGrid({
        barSpanTick: parsePositiveTick(960),
        beatSpanTick: parsePositiveTick(480),
        originTick: parseTick(60),
        subdivisionSpanTick: parsePositiveTick(240),
      }),
      theme: gridTheme,
      viewport: fixture.viewport,
    })

    expect(
      fixture.gridCanvas.operations.filter(
        (operation) =>
          operation.name === 'moveTo' &&
          operation.arguments[0] === 15 &&
          operation.arguments[1] === 0,
      ),
    ).toHaveLength(3)
  })

  it('projects visible Notes into frozen renderer-neutral CSS Pixel geometry', () => {
    const fixture = createRendererFixture()
    const visual = fixture.noteScene.notes[0]

    expect(Object.isFrozen(fixture.noteScene)).toBe(true)
    expect(Object.isFrozen(fixture.noteScene.notes)).toBe(true)
    expect(visual).toEqual({
      clipId: fixture.viewport.clipId,
      borderColor: '#f2eee5',
      fillColor: '#8B5CF6',
      glowColor: null,
      heightCssPixel: 8,
      noteId: 'renderer-note',
      opacity: 1,
      pitch: 60,
      selected: false,
      visibleEndTick: 1_920,
      visibleStartTick: 960,
      widthCssPixel: 240,
      xCssPixel: 240,
      yCssPixel: 121,
    })
    expect(Object.isFrozen(visual)).toBe(true)
  })

  it('keys DOM Notes by NoteId without creating Vue-owned per-Note state', () => {
    const fixture = createRendererFixture()
    const container = document.createElement('div')
    const renderer = createPianoRollDomNoteRenderer({ container })

    renderer.render(fixture.noteScene)
    const firstElement = container.querySelector<HTMLElement>(
      '[data-piano-roll-note-id="renderer-note"]',
    )
    const startHandle = firstElement?.querySelector<HTMLElement>(
      '.sd-piano-roll-dom-note__resize-handle--start',
    )
    const endHandle = firstElement?.querySelector<HTMLElement>(
      '.sd-piano-roll-dom-note__resize-handle--end',
    )

    expect(firstElement?.style.transform).toBe('translate3d(240px, 121px, 0)')
    expect(firstElement?.style.width).toBe('240px')
    expect(startHandle?.getAttribute('data-piano-roll-note-zone')).toBe(
      PIANO_ROLL_HIT_ZONE.RESIZE_START,
    )
    expect(endHandle?.getAttribute('data-piano-roll-note-zone')).toBe(
      PIANO_ROLL_HIT_ZONE.RESIZE_END,
    )
    expect(startHandle?.style.inlineSize).toBe('6px')
    expect(endHandle?.style.inlineSize).toBe('6px')

    renderer.render(fixture.noteScene)

    expect(container.querySelector('[data-piano-roll-note-id="renderer-note"]')).toBe(firstElement)
    renderer.clear()
    expect(container.querySelector('.sd-piano-roll-dom-note')).toBeNull()
  })

  it('replaces the authoritative Note with one selected Resize Preview', () => {
    const fixture = createRendererFixture()
    const previewScene = createPianoRollNoteScene({
      clipId: parseClipId('renderer-clip'),
      notes: Object.freeze([fixture.visibleNote]),
      resizePreview: Object.freeze({
        durationTick: parsePositiveTick(1_200),
        edge: PIANO_ROLL_HIT_ZONE.RESIZE_START,
        note: Object.freeze({
          noteId: fixture.visibleNote.note.id,
          pitch: fixture.visibleNote.note.pitch,
          visibleEndTick: parseTick(1_920),
          visibleStartTick: parseTick(720),
        }),
        resizedNoteId: fixture.visibleNote.note.id,
        snapGuideTick: parseTick(720),
        sourceStartTick: parseTick(720),
      }),
      selectedNoteIds: Object.freeze([]),
      style: {
        borderColor: '#f2eee5',
        fillColor: '#8B5CF6',
        opacity: 1,
        selectedBorderColor: '#f4e7b9',
        selectedGlowColor: 'rgb(232 217 168 / 58%)',
      },
      viewport: fixture.viewport,
    })

    expect(previewScene.notes).toEqual([
      expect.objectContaining({
        noteId: fixture.visibleNote.note.id,
        selected: true,
        visibleEndTick: 1_920,
        visibleStartTick: 720,
        widthCssPixel: 300,
        xCssPixel: 180,
      }),
    ])
  })

  it('carries selected state through the shared Scene into DOM and Canvas', () => {
    const fixture = createRendererFixture()
    const selectedScene = createPianoRollNoteScene({
      clipId: parseClipId('renderer-clip'),
      notes: Object.freeze([fixture.visibleNote]),
      selectedNoteIds: Object.freeze([fixture.visibleNote.note.id]),
      style: {
        borderColor: '#f2eee5',
        fillColor: '#8B5CF6',
        opacity: 1,
        selectedBorderColor: '#f4e7b9',
        selectedGlowColor: 'rgb(232 217 168 / 58%)',
      },
      viewport: fixture.viewport,
    })
    const container = document.createElement('div')
    const domRenderer = createPianoRollDomNoteRenderer({ container })
    domRenderer.render(selectedScene)

    const selectedNote = container.querySelector<HTMLElement>('.sd-piano-roll-dom-note--selected')
    expect(selectedScene.notes[0]).toEqual(
      expect.objectContaining({
        borderColor: '#f4e7b9',
        glowColor: 'rgb(232 217 168 / 58%)',
        selected: true,
      }),
    )
    expect(selectedNote?.style.border).toBe('1px solid rgb(244, 231, 185)')
    expect(selectedNote?.style.boxShadow).toContain('rgb(232 217 168 / 58%)')

    const noteCanvas = createFakeCanvasFixture()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noteCanvas.context)
    const canvasContainer = document.createElement('div')
    const canvasRenderer = createPianoRollCanvasNoteRenderer({
      container: canvasContainer,
    })
    canvasRenderer.render(selectedScene)

    expect(noteCanvas.context.lineWidth).toBe(2)
    expect(noteCanvas.context.shadowBlur).toBe(6)
    expect(noteCanvas.context.shadowColor).toBe('rgb(232 217 168 / 58%)')
  })

  it('lets the Canvas Note adapter consume the same Note Scene', () => {
    const fixture = createRendererFixture()
    const noteCanvas = createFakeCanvasFixture()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(noteCanvas.context)
    const container = document.createElement('div')
    const renderer = createPianoRollCanvasNoteRenderer({
      container,
      devicePixelRatio: 2,
    })

    renderer.render(fixture.noteScene)

    const canvas = container.querySelector('canvas')
    expect(canvas?.width).toBe(1_920)
    expect(canvas?.height).toBe(500)
    expect(
      noteCanvas.operations.filter((operation) => operation.name === 'fillRect'),
    ).toContainEqual({
      arguments: [240, 121, 240, 8],
      name: 'fillRect',
    })
  })

  it('carries muted opacity in the shared Scene rather than either Renderer', () => {
    const fixture = createRendererFixture()
    const mutedScene = createPianoRollNoteScene({
      clipId: parseClipId('renderer-clip'),
      notes: Object.freeze([fixture.visibleNote]),
      selectedNoteIds: Object.freeze([]),
      style: {
        borderColor: '#f2eee5',
        fillColor: '#8B5CF6',
        opacity: 0.46,
        selectedBorderColor: '#f4e7b9',
        selectedGlowColor: 'rgb(232 217 168 / 58%)',
      },
      viewport: fixture.viewport,
    })
    const container = document.createElement('div')
    const renderer = createPianoRollDomNoteRenderer({ container })

    renderer.render(mutedScene)

    expect(container.querySelector<HTMLElement>('.sd-piano-roll-dom-note')?.style.opacity).toBe(
      '0.46',
    )
  })

  it('disposes owned DOM and Canvas resources and rejects later rendering', () => {
    const fixture = createRendererFixture()
    const container = document.createElement('div')
    const renderer = createPianoRollDomNoteRenderer({ container })
    renderer.render(fixture.noteScene)

    renderer.dispose()

    expect(container.children).toHaveLength(0)
    expect(() => renderer.render(fixture.noteScene)).toThrow(
      expect.objectContaining({ code: 'renderer-disposed' }),
    )
  })

  it('fails Grid composition when the Canvas has no 2D context', () => {
    const unavailableCanvas = {
      getContext: () => null,
    } as unknown as HTMLCanvasElement

    expect(() =>
      createPianoRollGridCanvasRenderer({
        canvas: unavailableCanvas,
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'canvas-context-unavailable',
      }),
    )
  })
})
