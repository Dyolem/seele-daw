import { createPianoRollClipContext } from '@seele-daw/editor'
import {
  PROJECT_QUERY_TYPE,
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
  type ProjectQuery,
  type ProjectQueryResult,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProjectPianoRollSurface from '@/features/piano-roll/ProjectPianoRollSurface.vue'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  type ReadyProjectPianoRollPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import { createStudioKeyboardShortcutCoordinator } from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import {
  STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY,
  type StudioKeyboardShortcutVueContext,
} from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'

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
  '--sd-editor-note-selected-border',
  '--sd-editor-note-selected-glow',
] as const
const ORIGINAL_POINTER_CAPTURE_DESCRIPTORS = Object.freeze({
  hasPointerCapture: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'hasPointerCapture',
  ),
  releasePointerCapture: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'releasePointerCapture',
  ),
  setPointerCapture: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'setPointerCapture',
  ),
})

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

function createPresentation(
  identity = 'studio-piano-roll',
): ReadyProjectPianoRollPresentation {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId(`${identity}-source`),
    lengthTick: parsePositiveTick(3_840),
  })
  const clip = createMidiClipRecord({
    id: parseClipId(`${identity}-clip`),
    trackId: parseTrackId(`${identity}-track`),
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

interface DispatchPointerInput {
  readonly button?: number
  readonly clientX?: number
  readonly clientY?: number
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly pointerId?: number
  readonly shiftKey?: boolean
}

function dispatchPointer(
  target: Element,
  type: string,
  input: DispatchPointerInput = {},
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: input.button ?? 0,
    cancelable: true,
    clientX: input.clientX ?? 0,
    clientY: input.clientY ?? 0,
    composed: true,
    ctrlKey: input.ctrlKey,
    metaKey: input.metaKey,
    shiftKey: input.shiftKey,
  })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: input.pointerId ?? 1 },
    pointerType: { value: 'mouse' },
  })
  target.dispatchEvent(event)
}

function installPointerCapture(): void {
  const capturedPointerIds = new WeakMap<HTMLElement, Set<number>>()
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        return capturedPointerIds.get(this)?.has(pointerId) ?? false
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        capturedPointerIds.get(this)?.delete(pointerId)
      },
    },
    setPointerCapture: {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        const pointerIds = capturedPointerIds.get(this) ?? new Set<number>()
        pointerIds.add(pointerId)
        capturedPointerIds.set(this, pointerIds)
      },
    },
  })
}

function createKeyboardFixture() {
  const bindingRegistry = new TestStudioKeyboardBindingRegistry()
  const keyboardShortcuts = createStudioKeyboardShortcutCoordinator({
    bindingRegistry,
    keymap: STUDIO_DEFAULT_KEYMAP,
  })
  const context: StudioKeyboardShortcutVueContext = Object.freeze({
    keyboardShortcuts,
  })
  return { bindingRegistry, context, keyboardShortcuts }
}

function restorePrototypeProperty(
  property: keyof typeof ORIGINAL_POINTER_CAPTURE_DESCRIPTORS,
): void {
  const descriptor = ORIGINAL_POINTER_CAPTURE_DESCRIPTORS[property]
  if (descriptor === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, property)
    return
  }
  Object.defineProperty(HTMLElement.prototype, property, descriptor)
}

afterEach(() => {
  vi.restoreAllMocks()
  restorePrototypeProperty('hasPointerCapture')
  restorePrototypeProperty('releasePointerCapture')
  restorePrototypeProperty('setPointerCapture')
  document.body.replaceChildren()
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
    installPointerCapture()

    const note = createMidiNoteRecord({
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(960),
      id: parseNoteId('studio-piano-roll-note'),
      pitch: parseMidiPitch(60),
      startTick: parseTick(960),
      velocity: parseMidiVelocity(100),
    })
    const query = vi.fn<(projectQuery: ProjectQuery) => ProjectQueryResult>(
      (projectQuery: ProjectQuery): ProjectQueryResult => {
        switch (projectQuery.type) {
          case PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID:
            return Object.freeze({
              modelRevision: 0 as ModelRevision,
              note: projectQuery.noteId === note.id ? note : undefined,
              queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.BY_ID,
            })
          case PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE:
            return Object.freeze({
              modelRevision: 0 as ModelRevision,
              notes: Object.freeze([note]),
              queryType: PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE,
            })
        }
      },
    )
    const unsubscribers: ReturnType<typeof vi.fn<() => void>>[] = []
    const subscribe = vi.fn<() => () => void>(() => {
      const unsubscribe = vi.fn<() => void>()
      unsubscribers.push(unsubscribe)
      return unsubscribe
    })
    const session = {
      query: query as unknown as ProjectSession['query'],
      subscribe: subscribe as unknown as ProjectSession['subscribe'],
    }
    const keyboard = createKeyboardFixture()
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: createPresentation(),
        session,
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [createPinia()],
        provide: {
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    expect(wrapper.get('.project-piano-roll').attributes('aria-label')).toBe(
      'Piano Roll for Midnight Keys',
    )
    expect(wrapper.findAll('.project-piano-roll__key-row')).toHaveLength(25)
    expect(wrapper.findAll('.project-piano-roll__ruler span')).toHaveLength(1)
    expect(wrapper.text()).toContain(
      'Midnight Keys, 1 visible MIDI note, 0 selected',
    )
    expect(
      wrapper
        .get('[data-piano-roll-note-id="studio-piano-roll-note"]')
        .attributes('style'),
    ).toContain('translate3d(240px, 121px, 0)')
    expect(
      query.mock.calls.filter(
        ([projectQuery]) =>
          projectQuery.type ===
          PROJECT_QUERY_TYPE.MIDI_NOTE.INTERSECTING_RANGE,
      ),
    ).toHaveLength(1)
    expect(subscribe).toHaveBeenCalledTimes(2)
    expect(wrapper.get('canvas').element.width).toBe(960)

    const noteElement = wrapper.get<HTMLElement>(
      '[data-piano-roll-note-id="studio-piano-roll-note"]',
    )
    dispatchPointer(noteElement.element, 'pointerdown')
    dispatchPointer(noteElement.element, 'pointerup')
    await nextTick()

    expect(
      wrapper
        .get('[data-piano-roll-note-id="studio-piano-roll-note"]')
        .classes(),
    ).toContain('sd-piano-roll-dom-note--selected')
    expect(wrapper.text()).toContain('1 selected')
    expect(document.activeElement).toBe(
      wrapper.get('.project-piano-roll').element,
    )

    const selectedNoteElement = wrapper.get(
      '[data-piano-roll-note-id="studio-piano-roll-note"]',
    )
    dispatchPointer(selectedNoteElement.element, 'pointerdown', {
      shiftKey: true,
    })
    dispatchPointer(selectedNoteElement.element, 'pointerup', {
      shiftKey: true,
    })
    await nextTick()
    expect(wrapper.text()).toContain('0 selected')

    dispatchPointer(selectedNoteElement.element, 'pointerdown')
    dispatchPointer(selectedNoteElement.element, 'pointerup')
    await nextTick()
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    dispatchPointer(canvasHost.element, 'pointerdown', { pointerId: 2 })
    dispatchPointer(canvasHost.element, 'pointerup', { pointerId: 2 })
    await nextTick()
    expect(wrapper.text()).toContain('0 selected')

    dispatchPointer(selectedNoteElement.element, 'pointerdown', {
      pointerId: 3,
    })
    dispatchPointer(selectedNoteElement.element, 'pointerup', {
      pointerId: 3,
    })
    await nextTick()
    const escapeEvent = keyboard.bindingRegistry.dispatch('Escape')
    await nextTick()
    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(wrapper.text()).toContain('0 selected')

    dispatchPointer(selectedNoteElement.element, 'pointerdown', {
      pointerId: 4,
    })
    dispatchPointer(selectedNoteElement.element, 'pointerup', {
      pointerId: 4,
    })
    await nextTick()
    await wrapper.setProps({
      presentation: createPresentation('studio-piano-roll-next'),
    })
    await nextTick()
    expect(wrapper.text()).toContain('0 selected')

    wrapper.unmount()
    expect(unsubscribers).toHaveLength(4)
    expect(unsubscribers.every((unsubscribe) => unsubscribe.mock.calls.length === 1))
      .toBe(true)
    expect(keyboard.bindingRegistry.listeners.has('Escape')).toBe(false)
    keyboard.keyboardShortcuts.dispose()
  })
})
