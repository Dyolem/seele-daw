import {
  parseClipId,
  parseDeviceTypeId,
  parsePositiveTick,
  parseProjectId,
  parseTick,
  parseTrackId,
  type ProjectCommit,
} from '@seele-daw/project-core'
import { parseSoundbankId } from '@seele-daw/playback'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_EDITING_SCOPE,
  usePianoRollPreferencesStore,
} from '@/features/piano-roll/piano-roll-preferences-store'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import {
  PROJECT_TRACK_INSTRUMENT_STATUS,
  type ProjectTrackPresentation,
} from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import { PROJECT_WORKBENCH_DOCK_MODE } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  BUILT_IN_INSTRUMENT_PRESET_GROUPS,
  findAvailableBuiltInInstrumentPreset,
} from '@/workbench/instrument/built-in-instrument-catalogue'
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
  const pianoRollPreferences = usePianoRollPreferencesStore(pinia)
  const toasts = useUiToastStore(pinia)
  const selectBuiltInInstrument = vi.fn<ProjectTrackCoordinator['selectBuiltInInstrument']>()
  if (options.selectionFailure !== undefined) {
    selectBuiltInInstrument.mockImplementation(() => {
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
      selectBuiltInInstrument,
    }),
  })
  const projectSession = createTestSession(parseProjectId('project-instrument-inspector'))
  const wrapper = mount(ProjectWorkbenchContextEditorDock, {
    props: {
      barSpanTick: parsePositiveTick(3_840),
      dockMode: PROJECT_WORKBENCH_DOCK_MODE.DOCKED,
      isMaximized: false,
      pianoRollPresentation: null,
      pianoRollTrackPresentation: null,
      projectSession,
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

  return { pianoRollPreferences, projectSession, selectBuiltInInstrument, toasts, wrapper }
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

async function openInstrumentSelector(wrapper: VueWrapper): Promise<HTMLElement> {
  const trigger = wrapper.get<HTMLButtonElement>('[aria-label="Built-in instrument"]')
  await trigger.trigger('click')
  await flushPromises()

  const content = document.body.querySelector<HTMLElement>('.built-in-instrument-picker__content')
  if (content === null) throw new Error('Expected the Reka UI Instrument Popover content')
  return content
}

async function activateInstrumentCategory(content: HTMLElement, categoryId: string): Promise<void> {
  const category = content.querySelector<HTMLButtonElement>(`[data-category-id="${categoryId}"]`)
  if (category === null) throw new Error(`Expected the ${categoryId} Instrument category`)
  category.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))
  await flushPromises()
}

async function selectInstrument(wrapper: VueWrapper, soundbankId: string): Promise<void> {
  const content = await openInstrumentSelector(wrapper)
  const preset = findAvailableBuiltInInstrumentPreset(soundbankId)
  if (preset !== null) await activateInstrumentCategory(content, preset.categoryId)
  const item = content.querySelector<HTMLElement>(`[data-soundbank-id="${soundbankId}"]`)
  if (item === null) throw new Error(`Expected the ${soundbankId} Instrument option`)

  item.click()
  await flushPromises()
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount()
})

describe('Project Workbench Instrument Inspector', () => {
  it('switches the visible Piano Roll scope without changing Project facts or History', async () => {
    const selectedClip: ProjectMidiClipPresentation = Object.freeze({
      color: null,
      id: parseClipId('clip-scope-switch'),
      muted: false,
      name: 'Focused Verse',
      spanTick: parsePositiveTick(3_840),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    })
    const { pianoRollPreferences, projectSession, wrapper } = mountInspector({
      selectedClip,
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
        displayName: 'Studio Grand',
        soundbankId: parseSoundbankId('studio-grand'),
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      }),
    })
    const scopeSwitch = wrapper.get('[aria-label="Piano Roll editing scope"]')
    const [trackButton, clipFocusButton] = scopeSwitch.findAll('button')
    const initialRevision = projectSession.modelRevision
    const initialContentStateId = projectSession.contentStateId

    expect(trackButton?.text()).toBe('Track')
    expect(trackButton?.attributes('aria-pressed')).toBe('true')
    expect(clipFocusButton?.text()).toBe('Clip Focus')
    expect(clipFocusButton?.attributes('aria-pressed')).toBe('false')
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Legacy Keys')

    await clipFocusButton?.trigger('click')

    expect(pianoRollPreferences.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.CLIP)
    expect(trackButton?.attributes('aria-pressed')).toBe('false')
    expect(clipFocusButton?.attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Focused Verse')
    expect(projectSession.modelRevision).toBe(initialRevision)
    expect(projectSession.contentStateId).toBe(initialContentStateId)
    expect(projectSession.canUndo).toBe(false)

    await trackButton?.trigger('click')

    expect(pianoRollPreferences.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.TRACK)
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Legacy Keys')
    expect(projectSession.modelRevision).toBe(initialRevision)
    expect(projectSession.contentStateId).toBe(initialContentStateId)
    expect(projectSession.canUndo).toBe(false)
  })

  it('replaces a legacy Slot from the complete two-column Preset catalogue', async () => {
    const selectedClip: ProjectMidiClipPresentation = Object.freeze({
      color: null,
      id: parseClipId('clip-instrument-inspector'),
      muted: false,
      name: 'Verse Keys',
      spanTick: parsePositiveTick(3_840),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    })
    const { selectBuiltInInstrument, toasts, wrapper } = mountInspector({
      selectedClip,
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.instrument-slot'),
        displayName: 'No instrument selected',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
      }),
    })

    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Clip inspector')
    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Verse Keys')
    expect(wrapper.get('[aria-label="Track instrument"]').text()).toContain(
      'No instrument selected',
    )

    const selector = wrapper.get<HTMLButtonElement>('[aria-label="Built-in instrument"]')
    expect(selector.attributes('aria-haspopup')).toBe('dialog')
    expect(selector.attributes('aria-expanded')).toBe('false')
    expect(selector.text()).toContain('Choose a replacement')
    expect(wrapper.find('select').exists()).toBe(false)

    const content = await openInstrumentSelector(wrapper)
    expect(selector.attributes('aria-expanded')).toBe('true')
    expect(content.textContent).toContain('439 Presets · 289 playable')
    expect(
      [...content.querySelectorAll('.built-in-instrument-picker__family')].map((category) =>
        [...category.querySelectorAll('span')].map((label) => label.textContent?.trim()),
      ),
    ).toEqual(
      BUILT_IN_INSTRUMENT_PRESET_GROUPS.map((group) => [
        group.displayName,
        String(group.presets.length),
      ]),
    )
    const items = content.querySelectorAll('.built-in-instrument-picker__option')
    expect(items).toHaveLength(23)
    expect(
      [...items].every(
        (item) =>
          item.querySelector('.built-in-instrument-picker__check') !== null &&
          item.querySelector('.built-in-instrument-picker__names') !== null,
      ),
    ).toBe(true)

    await activateInstrumentCategory(content, 'drum-kit')
    expect(content.querySelectorAll('.built-in-instrument-picker__option')).toHaveLength(46)
    await activateInstrumentCategory(content, 'percussion')
    expect(
      content.querySelector('[data-soundbank-id="general-midi-percussion"]')?.textContent,
    ).toContain('General MIDI Percussion')

    await activateInstrumentCategory(content, 'piano')
    content.querySelector<HTMLButtonElement>('[data-soundbank-id="dark-grand"]')?.click()
    await flushPromises()

    expect(selectBuiltInInstrument).toHaveBeenCalledExactlyOnceWith(
      TRACK_ID,
      parseSoundbankId('dark-grand'),
    )
    expect(toasts.message).toBeNull()
  })

  it('keeps the Track unchanged and explains a synth-runtime option', async () => {
    const { selectBuiltInInstrument, toasts, wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
        displayName: 'Studio Grand',
        soundbankId: parseSoundbankId('studio-grand'),
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      }),
    })
    const content = await openInstrumentSelector(wrapper)
    await activateInstrumentCategory(content, 'synth-leads')

    const squareLead = content.querySelector<HTMLButtonElement>(
      '[data-source-preset-id="80s-square-lead-v4"]',
    )
    expect(squareLead?.textContent).toContain('80s Square Lead')
    expect(squareLead?.textContent).toContain('Not supported')
    squareLead?.click()
    await flushPromises()

    expect(selectBuiltInInstrument).not.toHaveBeenCalled()
    expect(toasts.message).toMatchObject({
      title: 'Instrument is not supported yet',
      description:
        '80s Square Lead requires the VASynth runtime. The current Track was not changed.',
      tone: 'warning',
    })
    expect(document.body.querySelector('.built-in-instrument-picker__content')).not.toBeNull()
  })

  it('shows and replaces the current Catalogue Instrument through the same selector', async () => {
    const { selectBuiltInInstrument, wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
        displayName: 'Studio Grand',
        soundbankId: parseSoundbankId('studio-grand'),
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      }),
    })

    const instrument = wrapper.get('[aria-label="Track instrument"]')
    expect(instrument.text()).toContain('Studio Grand')
    expect(instrument.text()).toContain("Use the Transport to play this Track's MIDI notes.")
    await flushPromises()
    const selector = instrument.get<HTMLButtonElement>('[aria-label="Built-in instrument"]')
    expect(selector.text()).toContain('Studio Grand')

    await selectInstrument(wrapper, 'flute')

    expect(selectBuiltInInstrument).toHaveBeenCalledExactlyOnceWith(
      TRACK_ID,
      parseSoundbankId('flute'),
    )
  })

  it('preserves and identifies an unavailable Device while offering an explicit replacement', () => {
    const { wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('third-party.missing-instrument'),
        displayName: 'Missing instrument',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
      }),
    })

    const instrument = wrapper.get('[aria-label="Track instrument"]')
    expect(instrument.text()).toContain('Missing instrument')
    expect(instrument.text()).toContain('third-party.missing-instrument')
    expect(instrument.get('[aria-label="Built-in instrument"]').text()).toContain(
      'Choose a replacement',
    )
  })

  it('explains an unsupported imported MIDI Program as a silent, repairable Track', () => {
    const { wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.midi-program-placeholder'),
        displayName: 'MIDI Program 81 unavailable',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.UNAVAILABLE,
      }),
    })

    const instrument = wrapper.get('[aria-label="Track instrument"]')
    expect(instrument.text()).toContain('MIDI Program 81 unavailable')
    expect(instrument.text()).toContain('The Track stays silent until you choose a replacement.')
    expect(instrument.text()).not.toContain('saved Instrument definition is not available')
    expect(instrument.get('[aria-label="Built-in instrument"]').text()).toContain(
      'Choose a replacement',
    )
  })

  it('keeps a rejected selection visible and reports the failure through the Toast channel', async () => {
    const { selectBuiltInInstrument, toasts, wrapper } = mountInspector({
      selectedTrack: createTrack({
        deviceTypeId: parseDeviceTypeId('seele.instrument-slot'),
        displayName: 'No instrument selected',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
      }),
      selectionFailure: new Error('The Track no longer exists'),
    })

    const selector = wrapper.get<HTMLButtonElement>('[aria-label="Built-in instrument"]')
    await selectInstrument(wrapper, 'studio-grand')

    expect(selectBuiltInInstrument).toHaveBeenCalledExactlyOnceWith(
      TRACK_ID,
      parseSoundbankId('studio-grand'),
    )
    expect(selector.text()).toContain('Choose a replacement')
    expect(wrapper.text()).toContain('No instrument selected')
    expect(toasts.message).toMatchObject({
      title: 'Instrument could not be selected',
      description: 'The Track no longer exists',
      tone: 'danger',
    })
  })
})
