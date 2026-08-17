import {
  parseClipId,
  parseDeviceTypeId,
  parsePositiveTick,
  parseProjectId,
  parseTick,
  parseTrackId,
  type ProjectCommit,
} from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import {
  PROJECT_TRACK_INSTRUMENT_STATUS,
  type ProjectTrackPresentation,
} from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import { PROJECT_WORKBENCH_DOCK_MODE } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'

const mountedWrappers: VueWrapper[] = []
const TRACK_ID = parseTrackId('track-instrument-inspector')

interface MountInspectorOptions {
  readonly selectedClip?: ProjectMidiClipPresentation | null
  readonly selectedTrack: ProjectTrackPresentation
  readonly selectionFailure?: Error
}

function mountInspector(options: MountInspectorOptions) {
  const pinia = createPinia()
  const toasts = useUiToastStore(pinia)
  const useStudioGrand = vi.fn<ProjectTrackCoordinator['useStudioGrand']>()
  if (options.selectionFailure !== undefined) {
    useStudioGrand.mockImplementation(() => {
      throw options.selectionFailure
    })
  }
  const context: ProjectTrackVueContext = Object.freeze({
    projectTracks: Object.freeze({
      addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(() =>
        Object.freeze({
          commit: Object.freeze({}) as ProjectCommit,
          trackId: TRACK_ID,
        }),
      ),
      useStudioGrand,
    }),
  })
  const wrapper = mount(ProjectWorkbenchContextEditorDock, {
    props: {
      barSpanTick: parsePositiveTick(3_840),
      dockMode: PROJECT_WORKBENCH_DOCK_MODE.DOCKED,
      isMaximized: false,
      pianoRollPresentation: null,
      pianoRollTrackPresentation: null,
      projectSession: createTestSession(parseProjectId('project-instrument-inspector')),
      selectedClip: options.selectedClip ?? null,
      selectedTrack: options.selectedTrack,
      timeSignatureNumerator: 4,
      timelineEndTick: parsePositiveTick(576_000),
    },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: context,
      },
    },
  })
  mountedWrappers.push(wrapper)

  return { toasts, useStudioGrand, wrapper }
}

function createTrack(
  instrument: NonNullable<ProjectTrackPresentation['instrument']>,
): ProjectTrackPresentation {
  return Object.freeze({
    color: null,
    id: TRACK_ID,
    instrument: Object.freeze(instrument),
    kind: 'instrument',
    name: 'Legacy Keys',
  })
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('Project Workbench Instrument Inspector', () => {
  it('keeps the legacy Slot action visible while its MIDI Clip is selected', async () => {
    const selectedClip: ProjectMidiClipPresentation = Object.freeze({
      color: null,
      id: parseClipId('clip-instrument-inspector'),
      muted: false,
      name: 'Verse Keys',
      spanTick: parsePositiveTick(3_840),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    })
    const { toasts, useStudioGrand, wrapper } = mountInspector({
      selectedClip,
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.instrument-slot'),
        displayName: 'No instrument selected',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
      }),
    })

    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Clip inspector')
    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Verse Keys')
    expect(wrapper.get('[aria-label="Track instrument"]').text()).toContain(
      'No instrument selected',
    )

    await wrapper.get('button').trigger('click')

    expect(useStudioGrand).toHaveBeenCalledExactlyOnceWith(TRACK_ID)
    expect(toasts.message).toBeNull()
  })

  it('shows Studio Grand as the selected Project fact without a duplicate action', () => {
    const { wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
        displayName: 'Studio Grand',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      }),
    })

    const instrument = wrapper.get('[aria-label="Track instrument"]')
    expect(instrument.text()).toContain('Studio Grand')
    expect(instrument.text()).toContain("Use the Transport to play this Track's MIDI notes.")
    expect(instrument.find('button').exists()).toBe(false)
  })

  it('preserves and identifies an unavailable Device without offering silent replacement', () => {
    const { wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('third-party.missing-instrument'),
        displayName: 'Missing instrument',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
      }),
    })

    const instrument = wrapper.get('[aria-label="Track instrument"]')
    expect(instrument.text()).toContain('Missing instrument')
    expect(instrument.text()).toContain('third-party.missing-instrument')
    expect(instrument.find('button').exists()).toBe(false)
  })

  it('keeps a rejected selection visible and reports the failure through the Toast channel', async () => {
    const { toasts, useStudioGrand, wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.instrument-slot'),
        displayName: 'No instrument selected',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
      }),
      selectionFailure: new Error('The Track no longer exists'),
    })

    await wrapper.get('button').trigger('click')

    expect(useStudioGrand).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('No instrument selected')
    expect(toasts.message).toMatchObject({
      title: 'Instrument could not be selected',
      description: 'The Track no longer exists',
      tone: 'danger',
    })
  })
})
