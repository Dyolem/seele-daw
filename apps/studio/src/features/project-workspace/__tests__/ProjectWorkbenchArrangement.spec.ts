import {
  parseProjectColor,
  parseProjectId,
  parseTrackId,
  type ProjectCommit,
} from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'

const mountedWrappers: VueWrapper[] = []

interface ArrangementFixture {
  readonly addInstrumentTrack: ReturnType<
    typeof vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>
  >
  readonly selection: ReturnType<typeof useProjectWorkbenchSelectionStore>
  readonly wrapper: VueWrapper
}

function mountArrangement(
  tracks: InstanceType<typeof ProjectWorkbenchArrangement>['$props']['tracks'] = Object.freeze([]),
): ArrangementFixture {
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  selection.activateProject(parseProjectId('arrangement-selection-project'))
  const addInstrumentTrack = vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(
    () =>
      Object.freeze({
        commit: Object.freeze({}) as ProjectCommit,
        trackId: parseTrackId('track-created-from-menu'),
      }),
  )
  const context: ProjectTrackVueContext = Object.freeze({
    projectTracks: Object.freeze({ addInstrumentTrack }),
  })
  const wrapper = mount(ProjectWorkbenchArrangement, {
    props: { tracks },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: context,
      },
    },
  })
  mountedWrappers.push(wrapper)

  return {
    addInstrumentTrack,
    selection,
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
    const { addInstrumentTrack, selection, wrapper } = mountArrangement()
    const options = await openAddTrackMenu(wrapper)
    const instrument = options.find((option) => option.textContent?.includes('Virtual instrument'))
    if (instrument === undefined) throw new Error('Expected the Virtual instrument option')

    instrument.click()
    await nextTick()

    expect(addInstrumentTrack).toHaveBeenCalledOnce()
    expect(selection.selectedTrackId).toBe('track-created-from-menu')
    expect(document.body.querySelector('.ui-toast')).toBeNull()
  })

  it('keeps future Track types discoverable and explains their current state', async () => {
    const { addInstrumentTrack, wrapper } = mountArrangement()
    const options = await openAddTrackMenu(wrapper)
    const sampler = options.find((option) => option.textContent?.includes('Sampler'))
    if (sampler === undefined) throw new Error('Expected the Sampler option')

    sampler.click()
    await nextTick()

    expect(addInstrumentTrack).not.toHaveBeenCalled()
    expect(document.body.querySelector('.ui-toast')?.textContent).toContain(
      'Sampler is in development',
    )
  })

  it('renders ordered Track facts as aligned shell rows and Arrangement lanes', () => {
    const { wrapper } = mountArrangement(
      Object.freeze([
        Object.freeze({
          color: parseProjectColor('#4F8CFF'),
          id: parseTrackId('track-visible'),
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    )

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
        kind: 'instrument' as const,
        name: 'Instrument 1',
      }),
      Object.freeze({
        color: parseProjectColor('#23B26D'),
        id: parseTrackId('track-selection-second'),
        kind: 'instrument' as const,
        name: 'Instrument 2',
      }),
    ])
    const { selection, wrapper } = mountArrangement(tracks)
    const rowButtons = wrapper.findAll('.project-track-row__select')
    const lanes = wrapper.findAll('.project-workbench__arrangement-lane')

    await rowButtons[1]!.trigger('click')

    expect(selection.selectedTrackId).toBe('track-selection-second')
    expect(rowButtons[1]!.attributes('aria-pressed')).toBe('true')
    expect(lanes[1]!.attributes('aria-pressed')).toBe('true')

    await lanes[0]!.trigger('click')

    expect(selection.selectedTrackId).toBe('track-selection-first')
    expect(rowButtons[0]!.attributes('aria-pressed')).toBe('true')
    expect(lanes[0]!.classes()).toContain('project-workbench__arrangement-lane--selected')
  })
})
