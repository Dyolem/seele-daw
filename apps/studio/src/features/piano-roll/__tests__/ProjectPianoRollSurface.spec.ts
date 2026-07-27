import { createPianoRollClipContext } from '@seele-daw/editor'
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
  type ModelRevision,
  type MidiNoteRecord,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProjectPianoRollSurface from '@/features/piano-roll/ProjectPianoRollSurface.vue'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  type ReadyProjectPianoRollPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'

const THEME_TOKENS = [
  '--sd-color-surface-canvas',
  '--sd-color-border-focus',
  '--sd-editor-pitch-row-black',
  '--sd-editor-pitch-row-white',
  '--sd-editor-pitch-row-border',
  '--sd-editor-grid-bar',
  '--sd-editor-grid-beat',
  '--sd-editor-grid-subdivision',
  '--sd-editor-note-border',
] as const

function createFakeCanvasContext(): CanvasRenderingContext2D {
  return {
    beginPath: () => undefined,
    clearRect: () => undefined,
    clip: () => undefined,
    fillRect: () => undefined,
    fillStyle: '',
    globalAlpha: 1,
    lineTo: () => undefined,
    lineWidth: 1,
    moveTo: () => undefined,
    rect: () => undefined,
    restore: () => undefined,
    save: () => undefined,
    setTransform: () => undefined,
    stroke: () => undefined,
    strokeRect: () => undefined,
    strokeStyle: '',
  } as unknown as CanvasRenderingContext2D
}

function createPresentation(): ReadyProjectPianoRollPresentation {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('studio-piano-roll-source'),
    lengthTick: parsePositiveTick(3_840),
  })
  const clip = createMidiClipRecord({
    id: parseClipId('studio-piano-roll-clip'),
    trackId: parseTrackId('studio-piano-roll-track'),
    name: 'Midnight Keys',
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: parsePositiveTick(3_840),
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })

  return Object.freeze({
    clipId: clip.id,
    color: parseProjectColor('#8B5CF6'),
    context: createPianoRollClipContext(clip, source),
    muted: clip.muted,
    name: clip.name,
    status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
    trackId: clip.trackId,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const token of THEME_TOKENS) {
    document.documentElement.style.removeProperty(token)
  }
})

describe('ProjectPianoRollSurface', () => {
  it('composes Canvas Grid, keyed DOM Notes and the accessible read model', async () => {
    for (const token of THEME_TOKENS) {
      document.documentElement.style.setProperty(token, '#111111')
    }

    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(250)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      createFakeCanvasContext(),
    )
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => '#111111',
    } as unknown as CSSStyleDeclaration)

    const note = createMidiNoteRecord({
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(960),
      id: parseNoteId('studio-piano-roll-note'),
      pitch: parseMidiPitch(60),
      startTick: parseTick(960),
      velocity: parseMidiVelocity(100),
    })
    const query = vi.fn<() => {
      readonly modelRevision: ModelRevision
      readonly notes: readonly MidiNoteRecord[]
    }>(() =>
      Object.freeze({
        modelRevision: 0 as ModelRevision,
        notes: Object.freeze([note]),
      }),
    )
    const unsubscribe = vi.fn<() => void>()
    const subscribe = vi.fn<() => typeof unsubscribe>(() => unsubscribe)
    const session = {
      query: query as unknown as ProjectSession['query'],
      subscribe: subscribe as unknown as ProjectSession['subscribe'],
    }
    const wrapper = mount(ProjectPianoRollSurface, {
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: createPresentation(),
        session,
        timeSignatureNumerator: 4,
      },
    })
    await nextTick()

    expect(wrapper.get('.project-piano-roll').attributes('aria-label')).toBe(
      'Piano Roll for Midnight Keys',
    )
    expect(wrapper.findAll('.project-piano-roll__key-row')).toHaveLength(25)
    expect(wrapper.findAll('.project-piano-roll__ruler span')).toHaveLength(1)
    expect(wrapper.text()).toContain('Midnight Keys, 1 visible MIDI note')
    expect(
      wrapper
        .get('[data-piano-roll-note-id="studio-piano-roll-note"]')
        .attributes('style'),
    ).toContain('translate3d(240px, 121px, 0)')
    expect(query).toHaveBeenCalledOnce()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(wrapper.get('canvas').element.width).toBe(960)

    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
