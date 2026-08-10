import { createPianoRollClipContext } from '@seele-daw/editor'
import {
  PROJECT_QUERY_TYPE,
  createInitialProjectSession,
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
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ModelRevision,
  type ProjectQuery,
  type ProjectQueryResult,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { markRaw, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProjectPianoRollSurface from '@/features/piano-roll/ProjectPianoRollSurface.vue'
import {
  PIANO_ROLL_TOOL,
  usePianoRollPreferencesStore,
} from '@/features/piano-roll/piano-roll-preferences-store'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  createProjectPianoRollPresentation,
  type ReadyProjectPianoRollPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import { createStudioKeyboardShortcutCoordinator } from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import {
  STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY,
  type StudioKeyboardShortcutVueContext,
} from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'
import type {
  AddMidiNoteInput,
  MoveMidiNotesInput,
  ProjectMidiNoteCoordinator,
  RemoveMidiNotesInput,
} from '@/workbench/project/midi-note/project-midi-note-coordinator'
import { createProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'
import {
  PROJECT_MIDI_NOTE_CONTEXT_KEY,
  type ProjectMidiNoteVueContext,
} from '@/workbench/project/midi-note/vue/project-midi-note-context'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { createProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

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

function installSurfaceEnvironment(): void {
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
}

function createReadyState(session: ProjectSession): ReadyActiveProjectState {
  const snapshot = session.getSnapshot()
  return Object.freeze({
    contentStateId: session.contentStateId,
    isDirty: false,
    modelRevision: session.modelRevision,
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: snapshot.project.id,
    recoveryFailures: Object.freeze([]),
    savedContentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    saveFailure: null,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    session,
  })
}

function createInteractiveFixture(identity: string) {
  const projectId = parseProjectId(`${identity}-project`)
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Interactive Piano Roll',
    tempoEventId: parseTempoEventId(`${identity}-tempo`),
    timeSignatureEventId: parseTimeSignatureEventId(`${identity}-meter`),
  })
  const readyState = createReadyState(session)
  const trackIds = [`${identity}-track`, `${identity}-device`]
  const track = createProjectTrackCoordinator({
    activeProject: { state: readyState },
    createRandomValue: () => 0,
    createUniqueId: () => trackIds.shift() ?? `${identity}-unused-track-id`,
  }).addInstrumentTrack()
  const clipIds = [`${identity}-clip`, `${identity}-source`]
  const clip = createProjectClipCoordinator({
    activeProject: { state: readyState },
    createUniqueId: () => clipIds.shift() ?? `${identity}-unused-clip-id`,
  }).addEmptyMidiClip({
    targetTick: parseTick(0),
    trackId: track.trackId,
  })
  const presentation = createProjectPianoRollPresentation(
    session.getSnapshot(),
    clip.clipId,
  )
  if (presentation?.status !== PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY) {
    throw new Error('Expected an editable Piano Roll fixture')
  }

  const noteIds = [`${identity}-note-1`, `${identity}-note-2`]
  const projectMidiNotes = createProjectMidiNoteCoordinator({
    activeProject: { state: readyState },
    createUniqueId: () => noteIds.shift() ?? `${identity}-unused-note-id`,
  })

  return Object.freeze({
    presentation,
    projectMidiNotes,
    session,
  })
}

interface DispatchPointerInput {
  readonly altKey?: boolean
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
    altKey: input.altKey,
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
    installSurfaceEnvironment()

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
    const addMidiNote = vi.fn<ProjectMidiNoteCoordinator['addMidiNote']>(() => {
      throw new Error('The Cursor test must not add a MIDI Note')
    })
    const removeMidiNotes = vi.fn<
      ProjectMidiNoteCoordinator['removeMidiNotes']
    >(() => {
      throw new Error('The selection-only Cursor test must not remove MIDI Notes')
    })
    const moveMidiNotes = vi.fn<
      ProjectMidiNoteCoordinator['moveMidiNotes']
    >(() => {
      throw new Error('The selection-only Cursor test must not move MIDI Notes')
    })
    const midiNoteContext: ProjectMidiNoteVueContext = Object.freeze({
      projectMidiNotes: Object.freeze({
        addMidiNote,
        moveMidiNotes,
        removeMidiNotes,
      }),
    })
    const pinia = createPinia()
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: createPresentation(),
        session,
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: midiNoteContext,
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
    expect(addMidiNote).not.toHaveBeenCalled()
    expect(removeMidiNotes).not.toHaveBeenCalled()
    keyboard.keyboardShortcuts.dispose()
  })

  it('previews and commits a selected Note move as one Project revision', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-move')
    const noteIds = [
      fixture.projectMidiNotes.addMidiNote({
        clipId: fixture.presentation.clipId,
        clipStartTick: parseTick(960),
        pitch: parseMidiPitch(60),
        requestedDurationTick: parsePositiveTick(240),
      }).noteId,
      fixture.projectMidiNotes.addMidiNote({
        clipId: fixture.presentation.clipId,
        clipStartTick: parseTick(1_200),
        pitch: parseMidiPitch(64),
        requestedDurationTick: parsePositiveTick(240),
      }).noteId,
    ]
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    const preferences = usePianoRollPreferencesStore(pinia)
    preferences.activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const firstNote = wrapper.get(`[data-piano-roll-note-id="${noteIds[0]}"]`)
    const secondNote = wrapper.get(`[data-piano-roll-note-id="${noteIds[1]}"]`)
    dispatchPointer(firstNote.element, 'pointerdown', { pointerId: 51 })
    dispatchPointer(firstNote.element, 'pointerup', { pointerId: 51 })
    dispatchPointer(secondNote.element, 'pointerdown', {
      pointerId: 52,
      shiftKey: true,
    })
    dispatchPointer(secondNote.element, 'pointerup', {
      pointerId: 52,
      shiftKey: true,
    })
    await nextTick()

    const revisionBeforeMove = fixture.session.modelRevision
    const positionsBeforeMove = new Map(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)
        .map((note) => [note.id, note] as const),
    )
    const dragDistanceCssPixel =
      (preferences.subdivisionSpanTick /
        fixture.presentation.context.clipSpanTick) *
      960
    const originalTransform = secondNote.attributes('style')
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')

    dispatchPointer(secondNote.element, 'pointerdown', {
      clientX: 200,
      clientY: 120,
      pointerId: 53,
    })
    dispatchPointer(canvasHost.element, 'pointermove', {
      clientX: 200 + dragDistanceCssPixel,
      clientY: 110,
      pointerId: 53,
    })
    await nextTick()

    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'true',
    )
    expect(wrapper.find('.project-piano-roll__move-snap-guide').exists()).toBe(
      true,
    )
    expect(
      wrapper
        .get(`[data-piano-roll-note-id="${noteIds[1]}"]`)
        .attributes('style'),
    ).not.toBe(originalTransform)

    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 200 + dragDistanceCssPixel,
      clientY: 110,
      pointerId: 53,
    })
    await Promise.resolve()
    await nextTick()

    expect(fixture.session.modelRevision).toBe(revisionBeforeMove + 1)
    const positionsAfterMove = new Map(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)
        .map((note) => [note.id, note] as const),
    )
    for (const noteId of noteIds) {
      expect(positionsAfterMove.get(noteId)?.startTick).toBe(
        positionsBeforeMove.get(noteId)!.startTick +
          preferences.subdivisionSpanTick,
      )
      expect(positionsAfterMove.get(noteId)?.pitch).toBe(
        positionsBeforeMove.get(noteId)!.pitch + 1,
      )
    }
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'false',
    )

    fixture.session.undo()
    expect(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)
        .map(({ startTick, pitch }) => ({ pitch, startTick })),
    ).toEqual([
      { pitch: 60, startTick: 960 },
      { pitch: 64, startTick: 1_200 },
    ])

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('cancels an active Note move with Escape without writing the Project', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-move-cancel')
    const noteId = fixture.projectMidiNotes.addMidiNote({
      clipId: fixture.presentation.clipId,
      clipStartTick: parseTick(960),
      pitch: parseMidiPitch(60),
      requestedDurationTick: parsePositiveTick(240),
    }).noteId
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const note = wrapper.get(`[data-piano-roll-note-id="${noteId}"]`)
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    const revisionBeforeMove = fixture.session.modelRevision
    dispatchPointer(note.element, 'pointerdown', {
      clientX: 200,
      clientY: 120,
      pointerId: 54,
    })
    dispatchPointer(canvasHost.element, 'pointermove', {
      clientX: 230,
      clientY: 110,
      pointerId: 54,
    })
    await nextTick()
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'true',
    )

    const escapeEvent = keyboard.bindingRegistry.dispatch('Escape')
    await nextTick()
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 230,
      clientY: 110,
      pointerId: 54,
    })

    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'false',
    )
    expect(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)[0],
    ).toMatchObject({ pitch: 60, startTick: 960 })

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('updates the Note move Snap preview when Alt changes during the gesture', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-move-live-alt')
    const noteId = fixture.projectMidiNotes.addMidiNote({
      clipId: fixture.presentation.clipId,
      clipStartTick: parseTick(960),
      pitch: parseMidiPitch(60),
      requestedDurationTick: parsePositiveTick(240),
    }).noteId
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const note = wrapper.get(`[data-piano-roll-note-id="${noteId}"]`)
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    const revisionBeforeMove = fixture.session.modelRevision
    dispatchPointer(note.element, 'pointerdown', {
      clientX: 200,
      clientY: 120,
      pointerId: 55,
    })
    dispatchPointer(canvasHost.element, 'pointermove', {
      clientX: 265,
      clientY: 120,
      pointerId: 55,
    })
    await nextTick()

    const snappedTransform = note.attributes('style')
    expect(wrapper.find('.project-piano-roll__move-snap-guide').exists()).toBe(
      true,
    )

    window.dispatchEvent(
      new KeyboardEvent('keydown', { altKey: true, key: 'Alt' }),
    )
    await nextTick()
    expect(wrapper.find('.project-piano-roll__move-snap-guide').exists()).toBe(
      false,
    )
    expect(note.attributes('style')).not.toBe(snappedTransform)

    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }))
    await nextTick()
    expect(wrapper.find('.project-piano-roll__move-snap-guide').exists()).toBe(
      true,
    )
    expect(note.attributes('style')).toBe(snappedTransform)

    keyboard.bindingRegistry.dispatch('Escape')
    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('cancels an active Note move on Window blur without committing Pointer Up', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-move-window-blur')
    const noteId = fixture.projectMidiNotes.addMidiNote({
      clipId: fixture.presentation.clipId,
      clipStartTick: parseTick(960),
      pitch: parseMidiPitch(60),
      requestedDurationTick: parsePositiveTick(240),
    }).noteId
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const note = wrapper.get(`[data-piano-roll-note-id="${noteId}"]`)
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    const revisionBeforeMove = fixture.session.modelRevision
    dispatchPointer(note.element, 'pointerdown', {
      clientX: 200,
      clientY: 120,
      pointerId: 56,
    })
    dispatchPointer(canvasHost.element, 'pointermove', {
      clientX: 260,
      clientY: 110,
      pointerId: 56,
    })
    await nextTick()
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'true',
    )

    window.dispatchEvent(new Event('blur'))
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 260,
      clientY: 110,
      pointerId: 56,
    })
    await nextTick()

    expect(fixture.session.modelRevision).toBe(revisionBeforeMove)
    expect(wrapper.get('.project-piano-roll').attributes('data-moving-notes')).toBe(
      'false',
    )

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('adds one snapped Note with Pencil, selects it and follows Project history', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-pencil')
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    expect(wrapper.get('button[aria-label="Pencil tool"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.get('button[aria-label="Cursor tool"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(
      wrapper
        .get('button[aria-label="Snap to 1/16 grid — on"]')
        .attributes('aria-pressed'),
    ).toBe('true')

    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    dispatchPointer(canvasHost.element, 'pointerdown', {
      clientX: 345,
      clientY: 125,
      pointerId: 11,
    })
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 345,
      clientY: 125,
      pointerId: 11,
    })
    await Promise.resolve()
    await nextTick()

    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toEqual([
      {
        channel: 0,
        durationTick: 240,
        id: 'surface-pencil-note-1',
        pitch: 60,
        startTick: 1_200,
        velocity: 100,
      },
    ])
    expect(
      wrapper
        .get('[data-piano-roll-note-id="surface-pencil-note-1"]')
        .classes(),
    ).toContain('sd-piano-roll-dom-note--selected')
    expect(wrapper.text()).toContain('1 selected')
    expect(wrapper.get('.project-piano-roll').attributes('data-tool')).toBe('pencil')

    fixture.session.undo()
    await Promise.resolve()
    await nextTick()
    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toEqual([])
    expect(wrapper.find('[data-piano-roll-note-id="surface-pencil-note-1"]').exists()).toBe(
      false,
    )
    expect(wrapper.text()).toContain('0 selected')

    fixture.session.redo()
    await Promise.resolve()
    await nextTick()
    expect(wrapper.find('[data-piano-roll-note-id="surface-pencil-note-1"]').exists()).toBe(
      true,
    )
    expect(wrapper.text()).toContain('0 selected')

    await wrapper.get('button[aria-label="Cursor tool"]').trigger('click')
    const restoredNote = wrapper.get(
      '[data-piano-roll-note-id="surface-pencil-note-1"]',
    )
    dispatchPointer(restoredNote.element, 'pointerdown', { pointerId: 12 })
    dispatchPointer(restoredNote.element, 'pointerup', { pointerId: 12 })
    await nextTick()
    expect(wrapper.text()).toContain('1 selected')

    await wrapper.get('button[aria-label="Pencil tool"]').trigger('click')
    dispatchPointer(restoredNote.element, 'pointerdown', { pointerId: 13 })
    dispatchPointer(restoredNote.element, 'pointerup', { pointerId: 13 })
    await nextTick()
    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toHaveLength(1)
    expect(wrapper.text()).toContain('1 selected')

    await wrapper
      .get('button[aria-label="Snap to 1/16 grid — on"]')
      .trigger('click')
    expect(
      wrapper
        .get('button[aria-label="Snap to 1/16 grid — off"]')
        .attributes('aria-pressed'),
    ).toBe('false')
    dispatchPointer(canvasHost.element, 'pointerdown', {
      clientX: 301,
      clientY: 100,
      pointerId: 14,
    })
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 301,
      clientY: 100,
      pointerId: 14,
    })
    await Promise.resolve()
    await nextTick()
    expect(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)
        .find(({ id }) => id === 'surface-pencil-note-2'),
    ).toMatchObject({
      durationTick: 240,
      pitch: 62,
      startTick: 1_204,
    })
    expect(wrapper.text()).toContain('1 selected')

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('removes a multi-Note selection as one focused keyboard Action and History step', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-remove')
    const noteIds = [
      fixture.projectMidiNotes.addMidiNote({
        clipId: fixture.presentation.clipId,
        clipStartTick: parseTick(960),
        pitch: parseMidiPitch(60),
        requestedDurationTick: parsePositiveTick(240),
      }).noteId,
      fixture.projectMidiNotes.addMidiNote({
        clipId: fixture.presentation.clipId,
        clipStartTick: parseTick(1_200),
        pitch: parseMidiPitch(64),
        requestedDurationTick: parsePositiveTick(240),
      }).noteId,
    ]
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: fixture.projectMidiNotes,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const firstNote = wrapper.get(`[data-piano-roll-note-id="${noteIds[0]}"]`)
    const secondNote = wrapper.get(`[data-piano-roll-note-id="${noteIds[1]}"]`)
    dispatchPointer(firstNote.element, 'pointerdown', { pointerId: 31 })
    dispatchPointer(firstNote.element, 'pointerup', { pointerId: 31 })
    dispatchPointer(secondNote.element, 'pointerdown', {
      pointerId: 32,
      shiftKey: true,
    })
    dispatchPointer(secondNote.element, 'pointerup', {
      pointerId: 32,
      shiftKey: true,
    })
    await nextTick()
    expect(wrapper.text()).toContain('2 selected')

    const revisionBeforeRemove = fixture.session.modelRevision
    const removeEvent = keyboard.bindingRegistry.dispatch('Backspace')
    await Promise.resolve()
    await nextTick()

    expect(removeEvent.defaultPrevented).toBe(true)
    expect(fixture.session.modelRevision).toBe(revisionBeforeRemove + 1)
    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toEqual([])
    expect(wrapper.text()).toContain('0 selected')
    expect(wrapper.find(`[data-piano-roll-note-id="${noteIds[0]}"]`).exists()).toBe(
      false,
    )
    expect(wrapper.find(`[data-piano-roll-note-id="${noteIds[1]}"]`).exists()).toBe(
      false,
    )

    fixture.session.undo()
    await Promise.resolve()
    await nextTick()
    expect(
      fixture.session
        .getSnapshot()
        .midiNotePartitions.flatMap(({ notes }) => notes)
        .map(({ id }) => id)
        .sort(),
    ).toEqual([...noteIds].sort())
    expect(wrapper.text()).toContain('0 selected')

    fixture.session.redo()
    await Promise.resolve()
    await nextTick()
    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toEqual([])

    wrapper.unmount()
    expect(keyboard.bindingRegistry.listeners.has('Backspace')).toBe(false)
    expect(keyboard.bindingRegistry.listeners.has('Delete')).toBe(false)
    keyboard.keyboardShortcuts.dispose()
  })

  it('keeps the selection and reports a handled failure when Note removal is rejected', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-remove-failure')
    fixture.projectMidiNotes.addMidiNote({
      clipId: fixture.presentation.clipId,
      clipStartTick: parseTick(960),
      pitch: parseMidiPitch(60),
      requestedDurationTick: parsePositiveTick(240),
    })
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    const toasts = useUiToastStore(pinia)
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const rejectedCoordinator: ProjectMidiNoteCoordinator = Object.freeze({
      addMidiNote: (input: AddMidiNoteInput) =>
        fixture.projectMidiNotes.addMidiNote(input),
      moveMidiNotes: (input: MoveMidiNotesInput) =>
        fixture.projectMidiNotes.moveMidiNotes(input),
      removeMidiNotes: () => {
        throw new Error('Test Project rejected the Note removal')
      },
    })
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: rejectedCoordinator,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const note = wrapper.get(
      '[data-piano-roll-note-id="surface-remove-failure-note-1"]',
    )
    dispatchPointer(note.element, 'pointerdown', { pointerId: 41 })
    dispatchPointer(note.element, 'pointerup', { pointerId: 41 })
    await nextTick()
    const revisionBeforeRemove = fixture.session.modelRevision
    const removeEvent = keyboard.bindingRegistry.dispatch('Delete')
    await nextTick()

    expect(removeEvent.defaultPrevented).toBe(true)
    expect(fixture.session.modelRevision).toBe(revisionBeforeRemove)
    expect(
      wrapper
        .get('[data-piano-roll-note-id="surface-remove-failure-note-1"]')
        .classes(),
    ).toContain('sd-piano-roll-dom-note--selected')
    expect(toasts.message).toMatchObject({
      description: 'Test Project rejected the Note removal',
      title: 'MIDI notes could not be removed',
      tone: 'danger',
    })

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('keeps selection and reports a visible failure when Pencil creation is rejected', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-failure')
    fixture.projectMidiNotes.addMidiNote({
      clipId: fixture.presentation.clipId,
      clipStartTick: parseTick(960),
      pitch: parseMidiPitch(60),
      requestedDurationTick: parsePositiveTick(240),
    })
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    const toasts = useUiToastStore(pinia)
    usePianoRollPreferencesStore(pinia).activateTool(PIANO_ROLL_TOOL.CURSOR)
    const rejectedCoordinator: ProjectMidiNoteCoordinator = Object.freeze({
      addMidiNote: () => {
        throw new Error('Test Project rejected the Note')
      },
      moveMidiNotes: (input: MoveMidiNotesInput) =>
        fixture.projectMidiNotes.moveMidiNotes(input),
      removeMidiNotes: (input: RemoveMidiNotesInput) =>
        fixture.projectMidiNotes.removeMidiNotes(input),
    })
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: rejectedCoordinator,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const existingNote = wrapper.get(
      '[data-piano-roll-note-id="surface-failure-note-1"]',
    )
    dispatchPointer(existingNote.element, 'pointerdown', { pointerId: 21 })
    dispatchPointer(existingNote.element, 'pointerup', { pointerId: 21 })
    await nextTick()
    expect(wrapper.text()).toContain('1 selected')

    await wrapper.get('button[aria-label="Pencil tool"]').trigger('click')
    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    dispatchPointer(canvasHost.element, 'pointerdown', {
      clientX: 600,
      clientY: 80,
      pointerId: 22,
    })
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 600,
      clientY: 80,
      pointerId: 22,
    })
    await nextTick()

    expect(
      wrapper
        .get('[data-piano-roll-note-id="surface-failure-note-1"]')
        .classes(),
    ).toContain('sd-piano-roll-dom-note--selected')
    expect(toasts.message).toMatchObject({
      description: 'Test Project rejected the Note',
      title: 'MIDI note could not be added',
      tone: 'danger',
    })
    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toHaveLength(1)

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })

  it('distinguishes a committed Note from a later selection failure', async () => {
    installSurfaceEnvironment()
    const fixture = createInteractiveFixture('surface-selection-failure')
    const keyboard = createKeyboardFixture()
    const pinia = createPinia()
    const toasts = useUiToastStore(pinia)
    const selectionFailureCoordinator: ProjectMidiNoteCoordinator = Object.freeze({
      addMidiNote: (input: AddMidiNoteInput) => {
        const result = fixture.projectMidiNotes.addMidiNote(input)
        return Object.freeze({
          ...result,
          noteId: parseNoteId('surface-selection-failure-missing-note'),
        })
      },
      moveMidiNotes: (input: MoveMidiNotesInput) =>
        fixture.projectMidiNotes.moveMidiNotes(input),
      removeMidiNotes: (input: RemoveMidiNotesInput) =>
        fixture.projectMidiNotes.removeMidiNotes(input),
    })
    const wrapper = mount(ProjectPianoRollSurface, {
      attachTo: document.body,
      props: {
        barSpanTick: parsePositiveTick(3_840),
        presentation: fixture.presentation,
        session: markRaw(fixture.session),
        timeSignatureNumerator: 4,
      },
      global: {
        plugins: [pinia],
        provide: {
          [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: Object.freeze({
            projectMidiNotes: selectionFailureCoordinator,
          }),
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboard.context,
        },
      },
    })
    await nextTick()

    const canvasHost = wrapper.get('.project-piano-roll__canvas-host')
    dispatchPointer(canvasHost.element, 'pointerdown', {
      clientX: 240,
      clientY: 125,
      pointerId: 31,
    })
    dispatchPointer(canvasHost.element, 'pointerup', {
      clientX: 240,
      clientY: 125,
      pointerId: 31,
    })
    await Promise.resolve()
    await nextTick()

    expect(
      fixture.session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes),
    ).toHaveLength(1)
    expect(wrapper.text()).not.toContain('1 selected')
    expect(toasts.message).toMatchObject({
      title: 'MIDI note was added but could not be selected',
      tone: 'warning',
    })

    wrapper.unmount()
    keyboard.keyboardShortcuts.dispose()
  })
})
