import {
  parseClipId,
  parseDeviceTypeId,
  parsePositiveTick,
  parseProjectColor,
  parseProjectId,
  parseTick,
  parseTrackId,
  type ProjectCommit,
} from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
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
  readonly wrapper: VueWrapper
}

interface MountArrangementOptions {
  readonly clips?: readonly ProjectMidiClipPresentation[]
  readonly createClipFailure?: Error
  readonly tracks?: InstanceType<typeof ProjectWorkbenchArrangement>['$props']['tracks']
}

function mountArrangement(options: MountArrangementOptions = {}): ArrangementFixture {
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  const toasts = useUiToastStore(pinia)
  selection.activateProject(parseProjectId('arrangement-selection-project'))
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
  const wrapper = mount(ProjectWorkbenchArrangement, {
    props: {
      barSpanTick: parsePositiveTick(3_840),
      clips: options.clips ?? Object.freeze([]),
      tracks: options.tracks ?? Object.freeze([]),
    },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_CLIP_CONTEXT_KEY as symbol]: clipContext,
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: context,
      },
    },
  })
  mountedWrappers.push(wrapper)

  return {
    addEmptyMidiClip,
    addInstrumentTrack,
    selection,
    toasts,
    wrapper,
  }
}

async function openAddTrackMenu(wrapper: VueWrapper): Promise<HTMLElement[]> {
  await wrapper.get('.project-add-track__trigger').trigger('click')
  await nextTick()
  return [...document.body.querySelectorAll<HTMLElement>('.project-add-track__option')]
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('ProjectWorkbenchArrangement', () => {
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

  it('positions visible MIDI Clips against the fixed eight-bar Arrangement', () => {
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
