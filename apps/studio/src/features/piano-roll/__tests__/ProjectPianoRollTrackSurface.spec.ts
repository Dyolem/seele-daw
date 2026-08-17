import {
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProjectPianoRollTrackSurface from '@/features/piano-roll/ProjectPianoRollTrackSurface.vue'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  createProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { createProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { createProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'
import {
  PROJECT_MIDI_NOTE_CONTEXT_KEY,
  type ProjectMidiNoteVueContext,
} from '@/workbench/project/midi-note/vue/project-midi-note-context'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import {
  PROJECT_PLAYBACK_CONTEXT_KEY,
  type ProjectPlaybackVueContext,
} from '@/workbench/project/playback/vue/project-playback-context'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

const ORIGINAL_POINTER_CAPTURE_DESCRIPTORS = Object.freeze({
  hasPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hasPointerCapture'),
  releasePointerCapture: Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'releasePointerCapture',
  ),
  setPointerCapture: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setPointerCapture'),
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

function createIdentitySource(...identities: string[]): () => string {
  let index = 0
  return () => {
    const identity = identities[index]
    if (identity === undefined) throw new Error('Test identity source exhausted')
    index += 1
    return identity
  }
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

function dispatchPointer(
  target: Element,
  type: string,
  input: { readonly clientX: number; readonly clientY: number },
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: input.clientX,
    clientY: input.clientY,
    composed: true,
  })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  })
  target.dispatchEvent(event)
}

function installSurfaceEnvironment(): void {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains('project-piano-roll-track__canvas-host') ? 12_000 : 960
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(250)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createFakeCanvasContext())
  vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
    getPropertyValue: () => '#111111',
  } as unknown as CSSStyleDeclaration)
  installPointerCapture()
}

function createSurfaceFixture() {
  installSurfaceEnvironment()
  const projectId = parseProjectId('track-surface-project')
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Track Surface',
    tempoEventId: parseTempoEventId('track-surface-tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('track-surface-meter'),
  })
  const readyState = createReadyState(session)
  const track = createProjectTrackCoordinator({
    activeProject: { state: readyState },
    createRandomValue: () => 0,
    createUniqueId: createIdentitySource('track-surface-track', 'track-surface-device'),
  }).addInstrumentTrack()
  const clip = createProjectClipCoordinator({
    activeProject: { state: readyState },
    createUniqueId: createIdentitySource('track-surface-clip', 'track-surface-source'),
  }).addEmptyMidiClip({
    targetTick: parseTick(0),
    trackId: track.trackId,
  })
  const presentation = createProjectPianoRollTrackPresentation(
    session.getSnapshot(),
    track.trackId,
    clip.clipId,
  )
  if (presentation?.status !== PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY) {
    throw new Error('Expected a ready Track Piano Roll presentation')
  }

  const projectMidiNotes = createProjectMidiNoteCoordinator({
    activeProject: { state: readyState },
    createUniqueId: () => 'track-surface-note',
  })
  const midiNoteContext: ProjectMidiNoteVueContext = Object.freeze({
    projectMidiNotes,
  })
  const playbackState = shallowRef<ProjectPlaybackState>(
    Object.freeze({
      diagnostics: Object.freeze([]),
      failureCause: null,
      feedback: null,
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      planStatus: 'playable',
      positionProjectSecond: 0,
      projectId,
    }),
  )
  const playbackVisualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      positionProjectSecond: 1,
      positionTick: 3_840 as ProjectPlaybackVisualPosition['positionTick'],
      projectId,
    }),
  )
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    dispose() {},
    pause: () => false,
    play: async () => false,
    readVisualPosition: () => playbackVisualPosition.value,
    returnToStart: () => false,
    state: playbackState.value,
    subscribe: () => () => undefined,
    togglePlayPause: () => false,
  })
  const playbackContext: ProjectPlaybackVueContext = Object.freeze({
    projectPlayback,
    state: playbackState,
    visualPosition: playbackVisualPosition,
  })
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  selection.activateProject(projectId)
  selection.selectClip(track.trackId, clip.clipId)
  const wrapper = mount(ProjectPianoRollTrackSurface, {
    attachTo: document.body,
    props: {
      barSpanTick: parseTick(3_840),
      presentation,
      timelineEndTick: parseTick(576_000),
      timeSignatureNumerator: 4,
    },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_MIDI_NOTE_CONTEXT_KEY as symbol]: midiNoteContext,
        [PROJECT_PLAYBACK_CONTEXT_KEY as symbol]: playbackContext,
      },
    },
  })

  return {
    clip,
    playbackState,
    playbackVisualPosition,
    presentation,
    selection,
    session,
    wrapper,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  restorePrototypeProperty('hasPointerCapture')
  restorePrototypeProperty('releasePointerCapture')
  restorePrototypeProperty('setPointerCapture')
  document.body.replaceChildren()
})

describe('ProjectPianoRollTrackSurface', () => {
  it('renders global Track time, previews extension and commits one Pencil placement', async () => {
    const { clip, presentation, selection, session, wrapper } = createSurfaceFixture()
    await nextTick()

    expect(wrapper.findAll('.project-piano-roll-track__ruler li')).toHaveLength(150)
    expect(
      wrapper.find('.project-piano-roll-track__timeline-content').attributes('style'),
    ).toContain('750rem')
    expect(wrapper.findAll('.project-piano-roll-track__clip-windows button')).toHaveLength(1)
    expect(
      (wrapper.find('.project-piano-roll-track__active-clip select').element as HTMLSelectElement)
        .value,
    ).toBe(clip.clipId)

    const host = wrapper.find('.project-piano-roll-track__canvas-host')
    dispatchPointer(host.element, 'pointermove', { clientX: 85, clientY: 125 })
    await nextTick()
    expect(wrapper.find('.project-piano-roll-track__preview-message').text()).toContain(
      'Extend the Clip',
    )
    expect(wrapper.find('.project-piano-roll-track__clip-preview').exists()).toBe(true)

    dispatchPointer(host.element, 'pointerdown', { clientX: 10, clientY: 125 })
    dispatchPointer(host.element, 'pointerup', { clientX: 10, clientY: 125 })
    await nextTick()

    expect(session.getSnapshot().midiNotePartitions.flatMap(({ notes }) => notes)).toContainEqual(
      expect.objectContaining({
        id: 'track-surface-note',
        pitch: 60,
        startTick: 480,
      }),
    )
    expect(session.modelRevision).toBe(presentation.readModel.modelRevision + 1)
    expect(selection.selectedClipId).toBe(clip.clipId)

    wrapper.unmount()
  })

  it('projects the shared global Tick and follows independent viewport pages', async () => {
    const { playbackState, playbackVisualPosition, wrapper } = createSurfaceFixture()
    await nextTick()

    const playhead = wrapper.get('.project-piano-roll-track__playhead')
    expect(playhead.attributes('style')).toContain('transform: translate3d(5rem, 0, 0)')
    expect(playhead.attributes('style')).not.toContain('left')

    const scrollViewport = wrapper.get('.project-piano-roll-track__scroll-viewport')
    const scrollElement = scrollViewport.element as HTMLElement
    Object.defineProperties(scrollElement, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1_600 },
    })
    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      positionTick: 144_000 as ProjectPlaybackVisualPosition['positionTick'],
    })
    playbackState.value = Object.freeze({
      ...playbackState.value,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    await nextTick()
    await nextTick()

    const followControl = wrapper.get('.project-piano-roll-track__follow-control')
    expect(scrollElement.scrollLeft).toBe(400)
    expect(followControl.attributes('aria-pressed')).toBe('true')
    expect(playhead.attributes('style')).toContain('transform: translate3d(187.5rem, 0, 0)')

    scrollElement.scrollLeft = 160
    await scrollViewport.trigger('scroll')
    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionTick: 432_000 as ProjectPlaybackVisualPosition['positionTick'],
    })
    await nextTick()

    expect(scrollElement.scrollLeft).toBe(160)
    expect(followControl.attributes('aria-label')).toBe('Resume Track timeline follow')
    expect(followControl.attributes('aria-pressed')).toBe('false')

    await followControl.trigger('click')
    await nextTick()

    expect(scrollElement.scrollLeft).toBe(1_200)
    expect(followControl.attributes('aria-pressed')).toBe('true')

    await wrapper.get('.project-piano-roll-track__ruler li').trigger('pointerdown')
    expect(followControl.attributes('aria-pressed')).toBe('false')

    playbackState.value = Object.freeze({
      ...playbackState.value,
      phase: PROJECT_PLAYBACK_PHASE.PAUSED,
    })
    await nextTick()
    expect(followControl.attributes('disabled')).toBeDefined()

    playbackState.value = Object.freeze({
      ...playbackState.value,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    await nextTick()
    await nextTick()
    expect(followControl.attributes('aria-pressed')).toBe('true')

    await scrollViewport.trigger('keydown', { key: 'ArrowRight' })
    expect(followControl.attributes('aria-pressed')).toBe('false')

    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      projectId: parseProjectId('stale-track-surface-project'),
    })
    await nextTick()
    expect(wrapper.find('.project-piano-roll-track__playhead').exists()).toBe(false)

    wrapper.unmount()
  })
})
