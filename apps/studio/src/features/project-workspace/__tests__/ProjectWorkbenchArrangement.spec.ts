import {
  parseClipId,
  parseDeviceTypeId,
  parsePositiveTick,
  parseProjectColor,
  parseProjectId,
  parseTick,
  parseTrackId,
  type ProjectCommit,
  type Tick,
} from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { PROJECT_TRACK_INSTRUMENT_STATUS } from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import type { ProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import {
  PROJECT_CLIP_CONTEXT_KEY,
  type ProjectClipVueContext,
} from '@/workbench/project/clip/vue/project-clip-context'
import type {
  ProjectPlaybackCoordinator,
  ProjectPlaybackLocateSession,
} from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import {
  PROJECT_PLAYBACK_CONTEXT_KEY,
  type ProjectPlaybackVueContext,
} from '@/workbench/project/playback/vue/project-playback-context'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'

const mountedWrappers: VueWrapper[] = []
const STUDIO_GRAND_INSTRUMENT = Object.freeze({
  deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
  displayName: 'Studio Grand',
  status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
})

interface ArrangementFixture {
  readonly addEmptyMidiClip: ReturnType<typeof vi.fn<ProjectClipCoordinator['addEmptyMidiClip']>>
  readonly addInstrumentTrack: ReturnType<
    typeof vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>
  >
  readonly selection: ReturnType<typeof useProjectWorkbenchSelectionStore>
  readonly toasts: ReturnType<typeof useUiToastStore>
  readonly playbackState: ShallowRef<ProjectPlaybackState>
  readonly playbackVisualPosition: ShallowRef<ProjectPlaybackVisualPosition>
  readonly beginTimelineLocate: ReturnType<
    typeof vi.fn<ProjectPlaybackCoordinator['beginTimelineLocate']>
  >
  readonly cancelTimelineLocate: ReturnType<typeof vi.fn<ProjectPlaybackLocateSession['cancel']>>
  readonly commitTimelineLocate: ReturnType<typeof vi.fn<ProjectPlaybackLocateSession['commit']>>
  readonly wrapper: VueWrapper
}

interface MountArrangementOptions {
  readonly clips?: readonly ProjectMidiClipPresentation[]
  readonly createClipFailure?: Error
  readonly playbackPhase?: ProjectPlaybackState['phase']
  readonly playbackPositionTick?: number
  readonly timelineEndTick?: Tick
  readonly tracks?: InstanceType<typeof ProjectWorkbenchArrangement>['$props']['tracks']
}

function mountArrangement(options: MountArrangementOptions = {}): ArrangementFixture {
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  const toasts = useUiToastStore(pinia)
  const projectId = parseProjectId('arrangement-selection-project')
  selection.activateProject(projectId)
  const addEmptyMidiClip = vi.fn<ProjectClipCoordinator['addEmptyMidiClip']>((input) => {
    if (options.createClipFailure !== undefined) throw options.createClipFailure

    return Object.freeze({
      clipId: parseClipId('clip-created-from-lane'),
      commit: Object.freeze({}) as ProjectCommit,
      trackId: input.trackId,
    })
  })
  const addInstrumentTrack = vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(() =>
    Object.freeze({
      commit: Object.freeze({}) as ProjectCommit,
      trackId: parseTrackId('track-created-from-menu'),
    }),
  )
  const context: ProjectTrackVueContext = Object.freeze({
    projectTracks: Object.freeze({
      addInstrumentTrack,
      useStudioGrand: vi.fn<ProjectTrackCoordinator['useStudioGrand']>(),
    }),
  })
  const clipContext: ProjectClipVueContext = Object.freeze({
    projectClips: Object.freeze({ addEmptyMidiClip }),
  })
  const playbackState = shallowRef<ProjectPlaybackState>(
    Object.freeze({
      diagnostics: Object.freeze([]),
      failureCause: null,
      feedback: null,
      modelRevision: null,
      phase: options.playbackPhase ?? PROJECT_PLAYBACK_PHASE.STOPPED,
      planStatus: 'playable',
      positionProjectSecond: 0,
      projectId,
    }),
  )
  const playbackVisualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: playbackState.value.phase,
      positionProjectSecond: 0,
      positionTick: (options.playbackPositionTick ??
        0) as ProjectPlaybackVisualPosition['positionTick'],
      projectId,
    }),
  )
  const cancelTimelineLocate = vi.fn<ProjectPlaybackLocateSession['cancel']>(() => true)
  const commitTimelineLocate = vi.fn<ProjectPlaybackLocateSession['commit']>(() => true)
  const beginTimelineLocate = vi.fn<ProjectPlaybackCoordinator['beginTimelineLocate']>(() =>
    Object.freeze({
      cancel: cancelTimelineLocate,
      commit: commitTimelineLocate,
      startedWhilePlaying: playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING,
    }),
  )
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    beginTimelineLocate,
    state: playbackState.value,
    locateAtTick: () => false,
    pause: () => false,
    play: async () => false,
    readVisualPosition: () => playbackVisualPosition.value,
    returnToLastStartPosition: () => false,
    returnToStart: () => false,
    subscribe: () => () => {},
    togglePlayPause: () => false,
    dispose() {},
  })
  const playbackContext: ProjectPlaybackVueContext = Object.freeze({
    projectPlayback,
    state: playbackState,
    visualPosition: playbackVisualPosition,
  })
  const wrapper = mount(ProjectWorkbenchArrangement, {
    props: {
      barSpanTick: parsePositiveTick(3_840),
      clips: options.clips ?? Object.freeze([]),
      projectId,
      timelineEndTick: options.timelineEndTick ?? parseTick(3_840 * 8),
      tracks: options.tracks ?? Object.freeze([]),
    },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_CLIP_CONTEXT_KEY as symbol]: clipContext,
        [PROJECT_PLAYBACK_CONTEXT_KEY as symbol]: playbackContext,
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: context,
      },
    },
  })
  mountedWrappers.push(wrapper)

  return {
    addEmptyMidiClip,
    addInstrumentTrack,
    beginTimelineLocate,
    cancelTimelineLocate,
    commitTimelineLocate,
    selection,
    toasts,
    playbackState,
    playbackVisualPosition,
    wrapper,
  }
}

async function openAddTrackMenu(wrapper: VueWrapper): Promise<HTMLElement[]> {
  await wrapper.get('.project-add-track__trigger').trigger('click')
  await nextTick()
  return [...document.body.querySelectorAll<HTMLElement>('.project-add-track__option')]
}

function setPlaybackPosition(fixture: ArrangementFixture, positionTick: number): void {
  fixture.playbackVisualPosition.value = Object.freeze({
    ...fixture.playbackVisualPosition.value,
    positionTick: positionTick as ProjectPlaybackVisualPosition['positionTick'],
  })
}

function setPlaybackPhase(fixture: ArrangementFixture, phase: ProjectPlaybackState['phase']): void {
  fixture.playbackState.value = Object.freeze({ ...fixture.playbackState.value, phase })
}

async function dispatchPointerEvent(
  element: Element,
  type: string,
  input: {
    readonly button?: number
    readonly clientX?: number
    readonly isPrimary?: boolean
    readonly pointerId: number
  },
): Promise<void> {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: input.button ?? 0,
    cancelable: true,
    clientX: input.clientX ?? 0,
  })
  Object.defineProperties(event, {
    isPrimary: { value: input.isPrimary ?? true },
    pointerId: { value: input.pointerId },
  })
  element.dispatchEvent(event)
  await nextTick()
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('ProjectWorkbenchArrangement', () => {
  it('renders the 150-bar minimum Timeline as one shared Ruler and lane width', () => {
    const { wrapper } = mountArrangement({
      timelineEndTick: parseTick(576_000),
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-150-bar-timeline'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Timeline Track',
        }),
      ]),
    })

    const bars = wrapper.findAll('.project-workbench__ruler li')
    const laneTargets = wrapper.findAll('.project-workbench__lane-grid button')

    expect(bars).toHaveLength(150)
    expect(bars[149]?.text()).toBe('150')
    expect(laneTargets).toHaveLength(150)
    expect(wrapper.get('.project-workbench__arrangement-layout').attributes('style')).toContain(
      '--project-workbench-timeline-inline-size: 750rem',
    )
  })

  it('preserves an exact partial final bar when authored content extends the minimum', () => {
    const { wrapper } = mountArrangement({ timelineEndTick: parseTick(577_920) })
    const bars = wrapper.findAll('.project-workbench__ruler li')

    expect(bars).toHaveLength(151)
    expect(bars[150]?.text()).toBe('151')
    expect(bars[150]?.attributes('style')).toContain('--project-workbench-bar-inline-size: 2.5rem')
    expect(wrapper.get('.project-workbench__arrangement-layout').attributes('style')).toContain(
      '--project-workbench-timeline-inline-size: 752.5rem',
    )
  })

  it('projects the shared Transport Tick through a transform-only Playhead layer', async () => {
    const fixture = mountArrangement({ playbackPositionTick: 3_840 })
    const playhead = fixture.wrapper.get('.project-workbench__arrangement-playhead')

    expect(playhead.attributes('aria-hidden')).toBe('true')
    expect(playhead.attributes('style')).toContain('transform: translate3d(5rem, 0, 0)')
    expect(playhead.attributes('style')).not.toContain('left')

    setPlaybackPosition(fixture, 7_680)
    await nextTick()

    expect(playhead.attributes('style')).toContain('transform: translate3d(10rem, 0, 0)')

    fixture.playbackVisualPosition.value = Object.freeze({
      ...fixture.playbackVisualPosition.value,
      positionTick: 15_360 as ProjectPlaybackVisualPosition['positionTick'],
      projectId: parseProjectId('stale-playhead-project'),
    })
    await nextTick()

    expect(playhead.attributes('style')).toContain('transform: translate3d(0rem, 0, 0)')
  })

  it('commits a Ruler click at the nearest Project Tick without locating from a lane', async () => {
    const fixture = mountArrangement()
    const viewport = fixture.wrapper.get('.project-workbench__arrangement-scroll-viewport')
      .element as HTMLElement
    viewport.scrollLeft = 400
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 1_600 })
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 500,
      left: 100,
      right: 500,
      toJSON: () => ({}),
      top: 100,
      width: 400,
      x: 100,
      y: 100,
    })
    const ruler = fixture.wrapper.get('.project-workbench__ruler-locate-surface')

    await dispatchPointerEvent(ruler.element, 'pointerdown', {
      button: 0,
      clientX: 300,
      isPrimary: true,
      pointerId: 7,
    })
    expect(fixture.beginTimelineLocate).toHaveBeenCalledOnce()
    expect(
      fixture.wrapper.get('.project-workbench__arrangement-locate-preview').attributes('style'),
    ).toContain('transform: translate3d(15rem, 0, 0)')

    await dispatchPointerEvent(ruler.element, 'pointerup', {
      button: 0,
      clientX: 300,
      pointerId: 7,
    })
    expect(fixture.commitTimelineLocate).toHaveBeenCalledWith(parseTick(11_520))
    expect(fixture.wrapper.find('.project-workbench__arrangement-locate-preview').exists()).toBe(
      false,
    )

    await dispatchPointerEvent(
      fixture.wrapper.get('.project-workbench__surface-empty').element,
      'pointerdown',
      {
        button: 0,
        clientX: 300,
        pointerId: 8,
      },
    )
    expect(fixture.beginTimelineLocate).toHaveBeenCalledOnce()
  })

  it('updates only the silent preview while dragging and cancels the gesture safely', async () => {
    const fixture = mountArrangement()
    const viewport = fixture.wrapper.get('.project-workbench__arrangement-scroll-viewport')
      .element as HTMLElement
    Object.defineProperty(viewport, 'scrollWidth', { configurable: true, value: 1_600 })
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      bottom: 600,
      height: 500,
      left: 100,
      right: 500,
      toJSON: () => ({}),
      top: 100,
      width: 400,
      x: 100,
      y: 100,
    })
    const ruler = fixture.wrapper.get('.project-workbench__ruler-locate-surface')

    await dispatchPointerEvent(ruler.element, 'pointerdown', {
      button: 0,
      clientX: 100,
      isPrimary: true,
      pointerId: 9,
    })
    await dispatchPointerEvent(ruler.element, 'pointermove', { clientX: 500, pointerId: 9 })

    expect(
      fixture.wrapper.get('.project-workbench__arrangement-locate-preview').attributes('style'),
    ).toContain('transform: translate3d(10rem, 0, 0)')
    expect(fixture.commitTimelineLocate).not.toHaveBeenCalled()

    await dispatchPointerEvent(ruler.element, 'pointercancel', { pointerId: 9 })
    expect(fixture.cancelTimelineLocate).toHaveBeenCalledOnce()
    expect(fixture.commitTimelineLocate).not.toHaveBeenCalled()
    expect(fixture.wrapper.find('.project-workbench__arrangement-locate-preview').exists()).toBe(
      false,
    )
  })

  it('follows the playing position by discrete Arrangement viewport pages', async () => {
    const fixture = mountArrangement({ playbackPhase: PROJECT_PLAYBACK_PHASE.PLAYING })
    const viewport = fixture.wrapper.get('.project-workbench__arrangement-scroll-viewport')
    const viewportElement = viewport.element as HTMLElement
    Object.defineProperties(viewportElement, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1_600 },
    })

    setPlaybackPosition(fixture, 7_680)
    await nextTick()

    expect(viewportElement.scrollLeft).toBe(400)
    expect(
      fixture.wrapper.get('.project-workbench__follow-control').attributes('aria-pressed'),
    ).toBe('true')

    viewportElement.scrollTop = 96
    await viewport.trigger('scroll')
    expect(
      fixture.wrapper.get('.project-workbench__follow-control').attributes('aria-pressed'),
    ).toBe('true')

    setPlaybackPosition(fixture, 15_360)
    await nextTick()

    expect(viewportElement.scrollLeft).toBe(800)
  })

  it('suspends Follow after manual Timeline navigation and can resume immediately', async () => {
    const fixture = mountArrangement({ playbackPhase: PROJECT_PLAYBACK_PHASE.PLAYING })
    const viewport = fixture.wrapper.get('.project-workbench__arrangement-scroll-viewport')
    const viewportElement = viewport.element as HTMLElement
    Object.defineProperties(viewportElement, {
      clientWidth: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 1_600 },
    })

    viewportElement.scrollLeft = 160
    await viewport.trigger('scroll')
    setPlaybackPosition(fixture, 23_040)
    await nextTick()

    const followControl = fixture.wrapper.get('.project-workbench__follow-control')
    expect(viewportElement.scrollLeft).toBe(160)
    expect(followControl.attributes('aria-label')).toBe('Resume timeline follow')
    expect(followControl.attributes('aria-pressed')).toBe('false')

    await followControl.trigger('click')
    await nextTick()

    expect(viewportElement.scrollLeft).toBe(1_200)
    expect(followControl.attributes('aria-pressed')).toBe('true')

    await fixture.wrapper.get('.project-workbench__ruler li').trigger('pointerdown')
    expect(followControl.attributes('aria-label')).toBe('Resume timeline follow')

    setPlaybackPhase(fixture, PROJECT_PLAYBACK_PHASE.PAUSED)
    await nextTick()
    expect(followControl.attributes('disabled')).toBeDefined()

    setPlaybackPhase(fixture, PROJECT_PLAYBACK_PHASE.PLAYING)
    await nextTick()

    expect(followControl.attributes('disabled')).toBeUndefined()
    expect(followControl.attributes('aria-pressed')).toBe('true')
  })

  it('presents all planned Track types in an accessible command menu', async () => {
    const { wrapper } = mountArrangement()
    const options = await openAddTrackMenu(wrapper)

    expect(document.body.querySelector('[role="menu"]')).not.toBeNull()
    expect(options).toHaveLength(6)
    expect(options.map((option) => option.textContent)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Voice / audio'),
        expect.stringContaining('Virtual instrument'),
        expect.stringContaining('Drum machine'),
        expect.stringContaining('Sampler'),
        expect.stringContaining('Guitar'),
        expect.stringContaining('Bass'),
      ]),
    )
    expect(wrapper.get('.project-add-track__trigger').attributes('aria-expanded')).toBe('true')
  })

  it('runs the real Instrument Track capability from the implemented menu option', async () => {
    const { addInstrumentTrack, selection, toasts, wrapper } = mountArrangement()
    const options = await openAddTrackMenu(wrapper)
    const instrument = options.find((option) => option.textContent?.includes('Virtual instrument'))
    if (instrument === undefined) throw new Error('Expected the Virtual instrument option')

    instrument.click()
    await nextTick()

    expect(addInstrumentTrack).toHaveBeenCalledOnce()
    expect(selection.selectedTrackId).toBe('track-created-from-menu')
    expect(toasts.message).toBeNull()
  })

  it('keeps future Track types discoverable and explains their current state', async () => {
    const { addInstrumentTrack, toasts, wrapper } = mountArrangement()
    const options = await openAddTrackMenu(wrapper)
    const sampler = options.find((option) => option.textContent?.includes('Sampler'))
    if (sampler === undefined) throw new Error('Expected the Sampler option')

    sampler.click()
    await nextTick()

    expect(addInstrumentTrack).not.toHaveBeenCalled()
    expect(toasts.message?.title).toBe('Sampler is in development')
  })

  it('renders ordered Track facts as aligned shell rows and Arrangement lanes', () => {
    const { wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-visible'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })

    const row = wrapper.get('.project-track-row')
    expect(row.text()).toContain('Instrument 1')
    expect(row.attributes('style')).toContain('--project-track-color: #4F8CFF')
    expect(wrapper.findAll('.project-workbench__arrangement-lane')).toHaveLength(1)
    expect(wrapper.find('.project-workbench__track-empty').exists()).toBe(false)
  })

  it('keeps ordered Track and Lane pairs under one Arrangement scroll authority', () => {
    const { wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-paired-first'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument' as const,
          name: 'First paired track',
        }),
        Object.freeze({
          color: parseProjectColor('#23B26D'),
          id: parseTrackId('track-paired-second'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument' as const,
          name: 'Second paired track',
        }),
      ]),
    })

    const scrollAuthority = wrapper.get('.project-workbench__arrangement-scroll-viewport')
    const trackRows = wrapper.findAll('.project-workbench__track-row-slot')
    const lanes = scrollAuthority.findAll('.project-workbench__arrangement-lane')

    expect(trackRows.map((row) => row.attributes('data-track-id'))).toEqual([
      'track-paired-first',
      'track-paired-second',
    ])
    expect(trackRows.map((row) => row.get('.project-track-row__identity strong').text())).toEqual([
      'First paired track',
      'Second paired track',
    ])
    expect(lanes.map((lane) => lane.attributes('data-track-id'))).toEqual([
      'track-paired-first',
      'track-paired-second',
    ])
    expect(lanes.map((lane) => lane.get('button').attributes('aria-label'))).toEqual([
      expect.stringContaining('First paired track'),
      expect.stringContaining('Second paired track'),
    ])
    expect(
      wrapper.get('.project-workbench__track-list').element.contains(scrollAuthority.element),
    ).toBe(false)
    expect(wrapper.find('.project-workbench__track-lane-row').exists()).toBe(false)
  })

  it('moves the clipped Track follower from Arrangement scroll events', async () => {
    const { wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-scroll-follower'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Scroll follower',
        }),
      ]),
    })
    const scrollAuthority = wrapper.get('.project-workbench__arrangement-scroll-viewport')
    const scrollElement = scrollAuthority.element as HTMLElement

    scrollElement.scrollTop = 96
    await scrollAuthority.trigger('scroll')

    expect(wrapper.get('.project-workbench__track-list').attributes('style')).toContain(
      '--project-workbench-track-scroll-offset: -96px',
    )
  })

  it('forwards vertical wheel input over Track controls to the Arrangement authority', async () => {
    const { wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-wheel-follower'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Wheel follower',
        }),
      ]),
    })
    const scrollElement = wrapper.get('.project-workbench__arrangement-scroll-viewport')
      .element as HTMLElement
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    })

    await wrapper.get('.project-workbench__track-viewport').trigger('wheel', {
      deltaMode: 0,
      deltaY: 48,
    })

    expect(scrollElement.scrollTop).toBe(48)
    expect(wrapper.get('.project-workbench__track-list').attributes('style')).toContain(
      '--project-workbench-track-scroll-offset: -48px',
    )
  })

  it('reveals a focused Track row by moving the Arrangement authority', async () => {
    const { wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-focus-visible'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument' as const,
          name: 'Visible focus row',
        }),
        Object.freeze({
          color: parseProjectColor('#23B26D'),
          id: parseTrackId('track-focus-clipped'),
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument' as const,
          name: 'Clipped focus row',
        }),
      ]),
    })
    const scrollElement = wrapper.get('.project-workbench__arrangement-scroll-viewport')
      .element as HTMLElement
    const trackViewportElement = wrapper.get('.project-workbench__track-viewport')
      .element as HTMLElement
    const clippedRow = wrapper.findAll('.project-workbench__track-row-slot')[1]!
    Object.defineProperties(scrollElement, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1_000 },
    })
    vi.spyOn(trackViewportElement, 'getBoundingClientRect').mockReturnValue({
      bottom: 300,
      height: 200,
      left: 0,
      right: 260,
      toJSON: () => ({}),
      top: 100,
      width: 260,
      x: 0,
      y: 100,
    })
    vi.spyOn(clippedRow.element, 'getBoundingClientRect').mockReturnValue({
      bottom: 376,
      height: 76,
      left: 0,
      right: 260,
      toJSON: () => ({}),
      top: 300,
      width: 260,
      x: 0,
      y: 300,
    })

    await clippedRow.get('.project-track-row__select').trigger('focusin')

    expect(scrollElement.scrollTop).toBe(76)
    expect(wrapper.get('.project-workbench__track-list').attributes('style')).toContain(
      '--project-workbench-track-scroll-offset: -76px',
    )
  })

  it('shares one Track selection between Track Rows and Arrangement Lanes', async () => {
    const tracks = Object.freeze([
      Object.freeze({
        color: parseProjectColor('#4F8CFF'),
        id: parseTrackId('track-selection-first'),
        instrument: STUDIO_GRAND_INSTRUMENT,
        kind: 'instrument' as const,
        name: 'Instrument 1',
      }),
      Object.freeze({
        color: parseProjectColor('#23B26D'),
        id: parseTrackId('track-selection-second'),
        instrument: STUDIO_GRAND_INSTRUMENT,
        kind: 'instrument' as const,
        name: 'Instrument 2',
      }),
    ])
    const { selection, wrapper } = mountArrangement({ tracks })
    const rowButtons = wrapper.findAll('.project-track-row__select')
    const lanes = wrapper.findAll('.project-workbench__arrangement-lane')
    const laneButtons = wrapper.findAll('.project-workbench__lane-grid button')

    await rowButtons[1]!.trigger('click')

    expect(selection.selectedTrackId).toBe('track-selection-second')
    expect(rowButtons[1]!.attributes('aria-pressed')).toBe('true')
    expect(laneButtons[8]!.attributes('aria-pressed')).toBe('true')

    await laneButtons[0]!.trigger('click')

    expect(selection.selectedTrackId).toBe('track-selection-first')
    expect(rowButtons[0]!.attributes('aria-pressed')).toBe('true')
    expect(lanes[0]!.classes()).toContain('project-workbench__arrangement-lane--selected')
  })

  it('positions visible MIDI Clips against the provided Timeline extent', () => {
    const trackId = parseTrackId('track-with-visible-clip')
    const clipId = parseClipId('clip-visible-on-arrangement')
    const { wrapper } = mountArrangement({
      clips: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: clipId,
          muted: false,
          name: 'Keys',
          spanTick: parsePositiveTick(3_840),
          startTick: parseTick(3_840),
          trackId,
        }),
      ]),
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: trackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Keys',
        }),
      ]),
    })

    const clip = wrapper.get('.project-midi-clip')
    expect(clip.text()).toContain('Keys')
    expect(clip.attributes('style')).toContain('--project-clip-offset: 12.5%')
    expect(clip.attributes('style')).toContain('--project-clip-width: 12.5%')
    expect(clip.attributes('style')).toContain('--project-clip-color: #4F8CFF')
  })

  it('creates and opens an empty MIDI Clip by double-clicking its target bar', async () => {
    const trackId = parseTrackId('track-create-clip')
    const { addEmptyMidiClip, selection, toasts, wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#23B26D'),
          id: trackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })
    const thirdBar = wrapper.findAll('.project-workbench__lane-grid button')[2]!

    await thirdBar.trigger('dblclick')

    expect(addEmptyMidiClip).toHaveBeenCalledExactlyOnceWith({
      targetTick: parseTick(7_680),
      trackId,
    })
    expect(selection.selectedTrackId).toBe(trackId)
    expect(selection.selectedClipId).toBe('clip-created-from-lane')
    expect(wrapper.emitted('openMidiClip')).toHaveLength(1)
    expect(toasts.message).toBeNull()
  })

  it('provides a keyboard path for creating a MIDI Clip on the focused bar', async () => {
    const trackId = parseTrackId('track-create-clip-keyboard')
    const { addEmptyMidiClip, wrapper } = mountArrangement({
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#16B8D4'),
          id: trackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })
    const secondBar = wrapper.findAll('.project-workbench__lane-grid button')[1]!

    await secondBar.trigger('keydown', { key: 'Enter' })

    expect(addEmptyMidiClip).toHaveBeenCalledExactlyOnceWith({
      targetTick: parseTick(3_840),
      trackId,
    })
  })

  it('keeps Clip creation failures atomic and visible', async () => {
    const trackId = parseTrackId('track-rejected-clip')
    const { selection, toasts, wrapper } = mountArrangement({
      createClipFailure: new Error('The target Track no longer exists'),
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#F59E0B'),
          id: trackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })

    await wrapper.get('.project-workbench__lane-grid button').trigger('dblclick')
    await nextTick()

    expect(selection.selectedClipId).toBeNull()
    expect(wrapper.emitted('openMidiClip')).toBeUndefined()
    expect(toasts.message?.description).toBe('The target Track no longer exists')
  })

  it('selects and opens an existing Clip without creating another one', async () => {
    const trackId = parseTrackId('track-existing-clip')
    const clipId = parseClipId('clip-existing')
    const { addEmptyMidiClip, selection, wrapper } = mountArrangement({
      clips: Object.freeze([
        Object.freeze({
          color: null,
          id: clipId,
          muted: false,
          name: 'Instrument 1',
          spanTick: parsePositiveTick(3_840),
          startTick: parseTick(0),
          trackId,
        }),
      ]),
      tracks: Object.freeze([
        Object.freeze({
          color: null,
          id: trackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })
    const clip = wrapper.get('.project-midi-clip')

    await clip.trigger('click')
    expect(selection.selectedClipId).toBe(clipId)

    await clip.trigger('dblclick')

    expect(addEmptyMidiClip).not.toHaveBeenCalled()
    expect(wrapper.emitted('openMidiClip')).toHaveLength(1)
    expect(clip.attributes('aria-pressed')).toBe('true')

    await clip.trigger('keydown', { key: 'Enter' })

    expect(addEmptyMidiClip).not.toHaveBeenCalled()
    expect(wrapper.emitted('openMidiClip')).toHaveLength(2)
  })
})
