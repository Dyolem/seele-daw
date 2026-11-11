import { TEMPO_EDITING_KEY } from '@/features/project-workspace/tempo-track/tempo-editing'
import { createTestProjectWorkspace } from './support/project-workspace-test-support'
import { createTestTempoEditing } from './support/tempo-track-test-support'
import { provideTestStudioServices } from '@/__tests__/support/studio-services-test-support'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioActionControl } from '@/workbench/actions/studio-action-control'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import {
  createInitialProjectSession,
  parseClipId,
  parseDeviceTypeId,
  parsePositiveTick,
  parseProjectColor,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ClipId,
  type ProjectCommit,
  type TrackId,
} from '@seele-daw/project-core'
import { parseSoundbankId } from '@seele-daw/playback'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowRef, type ShallowRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { createStudioActionPresentation } from '@/workbench/actions/studio-action'
import { presentProjectWorkbenchActions } from '@/features/project-workspace/actions/project-workbench-action-controls'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import ProjectWorkbenchTransport from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTransport.vue'
import ProjectWorkbenchWorkspace from '@/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue'
import { useProjectWorkbenchSelectionStore } from '@/workbench/project/project-workbench-selection-store'
import {
  PROJECT_TRACK_INSTRUMENT_STATUS,
  type ProjectTrackPresentation,
} from '@/features/project-workspace/project-track-presentation'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectSaveStatus,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import type { ClipEdits } from '@/workbench/edits/clip-edits'
import type { TrackEdits } from '@/workbench/edits/track-edits'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import { type ProjectPlaybackVueContext } from '@/workbench/project/playback/vue/project-playback-vue-binding'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640)
})
afterEach(() => {
  vi.restoreAllMocks()
})

interface MountShellOptions {
  readonly isDirty?: boolean
  readonly saveFailure?: Error | null
  readonly saveStatus?: ActiveProjectSaveStatus
  readonly selectedClipId?: ClipId | null
  readonly selectedTrackId?: TrackId | null
}

const PROJECT_ID = parseProjectId('workbench-shell-project')

const STUDIO_GRAND_INSTRUMENT = Object.freeze({
  deviceTypeId: parseDeviceTypeId('seele.sample-instrument'),
  displayName: 'Studio Grand',
  soundbankId: parseSoundbankId('studio-grand'),
  status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
})

/** The coordinator's invoke, spied on by the latest mount. */
let invoke: MockInstance<StudioActionCoordinator['invoke']>
let playbackState: ShallowRef<ProjectPlaybackState>
let playbackVisualPosition: ShallowRef<ProjectPlaybackVisualPosition>

/** Pinia, services and action controls shared by the Shell and the Workspace below it. */
function createShellEnvironment(options: MountShellOptions = {}) {
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  const projectId = PROJECT_ID
  selection.activateProject(projectId)
  if (options.selectedTrackId && options.selectedClipId) {
    selection.selectClip(options.selectedTrackId, options.selectedClipId)
  } else if (options.selectedTrackId) {
    selection.selectTrack(options.selectedTrackId)
  }
  const clips: ClipEdits = {
    addEmpty: vi.fn<ClipEdits['addEmpty']>((input) => ({
      clipId: parseClipId('shell-created-clip'),
      commit: Object.freeze({}) as ProjectCommit,
      trackId: input.trackId,
    })),
  }
  const tracks: TrackEdits = {
    addInstrumentTrack: vi.fn<TrackEdits['addInstrumentTrack']>(() => ({
      commit: Object.freeze({}) as ProjectCommit,
      trackId: parseTrackId('shell-created-track'),
    })),
    selectBuiltInInstrument: vi.fn<TrackEdits['selectBuiltInInstrument']>(),
  }
  playbackState = shallowRef<ProjectPlaybackState>(
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
  playbackVisualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      positionProjectSecond: 0,
      positionTick: 0 as ProjectPlaybackVisualPosition['positionTick'],
      projectId,
    }),
  )
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    beginTimelineLocate: () => null,
    canReturnToLastStartPosition: () => false,
    state: playbackState.value,
    locateAtTick: () => false,
    pause: () => false,
    play: async () => false,
    readVisualPosition: () => playbackVisualPosition.value,
    returnToLastStartPosition: () => false,
    subscribe: () => () => {},
    togglePlayPause: () => false,
    dispose() {},
  })
  const playbackContext: ProjectPlaybackVueContext = Object.freeze({
    projectPlayback,
    state: playbackState,
    visualPosition: playbackVisualPosition,
  })
  const actionFixture = createTestStudioActionRuntime()
  invoke = vi.spyOn(actionFixture.runtime.actions, 'invoke')
  const controls = presentProjectWorkbenchActions(
    actionFixture.runtime.actions,
    actionFixture.runtime.keyboard,
  )
  const enabled = (control: StudioActionControl) => ({
    ...control,
    ...createStudioActionPresentation(control.label),
    title: control.label,
  })
  const actionControls = {
    ...controls,
    undo: enabled(controls.undo),
    togglePlayback: enabled(controls.togglePlayback),
    projects: enabled(controls.projects),
    importMidiProject: enabled(controls.importMidiProject),
    importMidiTracks: enabled(controls.importMidiTracks),
    openMidiEditor: { ...enabled(controls.openMidiEditor), checked: true },
    save: {
      ...controls.save,
      ...createStudioActionPresentation(
        options.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED ? 'Retry save' : 'Save',
        options.isDirty ? null : 'All changes are saved.',
      ),
    },
  }

  return {
    actionControls,
    pinia,
    provide: {
      [TEMPO_EDITING_KEY as symbol]: createTestTempoEditing([]).tempo,
      ...provideTestStudioServices({
        actions: actionFixture.runtime,
        edits: { clips, tracks },
        playback: playbackContext,
      }),
    },
  }
}

function mountShell(options: MountShellOptions = {}) {
  const environment = createShellEnvironment(options)
  const session = createInitialProjectSession({
    projectId: PROJECT_ID,
    projectName: 'Midnight Study',
    tempoEventId: parseTempoEventId('tempo-workbench-shell'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-workbench-shell'),
  })
  const readyProject: ReadyActiveProjectState = Object.freeze({
    contentStateId: session.contentStateId,
    isDirty: options.isDirty ?? false,
    modelRevision: session.modelRevision,
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: PROJECT_ID,
    recoveryFailures: Object.freeze([]),
    savedContentStateId: null,
    savedRevision: null,
    saveFailure: options.saveFailure ?? null,
    saveStatus: options.saveStatus ?? ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    session,
  })
  return mount(ProjectWorkbenchShell, {
    props: { actionControls: environment.actionControls, readyProject },
    global: { plugins: [environment.pinia], provide: environment.provide },
  })
}

/** The Workspace on its own, for what it shows of a given set of Tracks and Clips. */
function mountWorkspace(
  options: MountShellOptions & {
    readonly clips?: readonly ProjectMidiClipPresentation[]
    readonly tracks?: readonly ProjectTrackPresentation[]
  },
) {
  const environment = createShellEnvironment(options)
  const workspace = createTestProjectWorkspace({
    actionControls: environment.actionControls,
    clips: options.clips,
    projectId: PROJECT_ID,
    tracks: options.tracks,
  })
  return mount(ProjectWorkbenchWorkspace, {
    global: {
      plugins: [environment.pinia],
      provide: { ...environment.provide, ...workspace.provide },
    },
  })
}

describe('ProjectWorkbenchShell', () => {
  it('composes the Workbench modules through explicit component boundaries', () => {
    const wrapper = mountShell()
    const workspace = wrapper.getComponent(ProjectWorkbenchWorkspace)

    expect(wrapper.findComponent(ProjectWorkbenchGlobalBar).exists()).toBe(true)
    expect(wrapper.findComponent(ProjectWorkbenchTransport).exists()).toBe(true)
    expect(workspace.findComponent(ProjectWorkbenchArrangement).exists()).toBe(true)
    expect(
      wrapper.get('.project-workbench__ruler-locate-surface').attributes('aria-valuemax'),
    ).toBe('576000')
    expect(wrapper.get('.project-workbench__project-identity').attributes('title')).toBe(
      'workbench-shell-project',
    )
    expect(workspace.findComponent(ProjectWorkbenchContextEditorDock).exists()).toBe(true)
  })

  it('renders authentic Project chrome and keeps unavailable product controls disabled', () => {
    const wrapper = mountShell()

    expect(wrapper.get('.project-workbench__project-identity').text()).toContain('Midnight Study')
    expect(wrapper.get('.project-workbench__save-status').text()).toBe('Saved')
    expect(wrapper.get('.project-workbench__save').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button[aria-label="Redo"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="Play / pause"]').attributes('disabled')).toBeUndefined()
    expect(
      wrapper.get('button[aria-label="Return to last start position"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapper.get('.project-workbench__output-level').text()).toContain('Meter —')
    expect(
      wrapper.get('.project-workbench__track-actions button').attributes('disabled'),
    ).toBeUndefined()
  })

  it('emits history intents only from enabled controls', async () => {
    const wrapper = mountShell()

    await wrapper.get('button[aria-label="Undo"]').trigger('click')
    await wrapper.get('button[aria-label="Redo"]').trigger('click')

    expect(invoke.mock.calls).toEqual([['history.undo', 'toolbar']])
  })

  it('projects playback state and emits enabled Transport intents', async () => {
    const wrapper = mountShell()

    await wrapper.setProps({
      actionControls: {
        ...wrapper.props('actionControls'),
        returnToStart: {
          ...wrapper.props('actionControls').returnToStart,
          enabled: true,
          disabledReason: null,
        },
        togglePlayback: {
          ...wrapper.props('actionControls').togglePlayback,
          label: 'Pause',
          checked: true,
        },
      },
    })
    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionProjectSecond: 62.345,
    })
    playbackState.value = Object.freeze({
      ...playbackState.value,
      feedback: Object.freeze({ kind: 'warning', message: 'Some content will be skipped.' }),
    })
    await nextTick()

    expect(wrapper.get('button[aria-label="Pause"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('.project-workbench__time').text()).toBe('01:02.345')
    expect(wrapper.get('.project-workbench__time').attributes('title')).toBe(
      'Some content will be skipped.',
    )
    await wrapper.get('button[aria-label="Pause"]').trigger('click')
    await wrapper.get('button[aria-label="Return to last start position"]').trigger('click')

    expect(invoke.mock.calls).toEqual([
      ['playback.toggle', 'toolbar'],
      ['playback.return-to-last-start-position', 'toolbar'],
    ])
  })

  it('renders the Project menu through its portal with the styled overlay classes', async () => {
    const wrapper = mountShell()

    await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
    await nextTick()

    const menu = document.body.querySelector('.project-workbench__menu')
    expect(menu).not.toBeNull()
    const menuItems = [
      ...(menu?.querySelectorAll<HTMLElement>('.project-workbench__menu-item') ?? []),
    ]
    expect(menuItems).toHaveLength(10)
    expect(menu?.querySelectorAll('.project-workbench__menu-separator')).toHaveLength(3)

    const importAsProject = menuItems.find((item) =>
      item.textContent?.includes('Import MIDI as new project'),
    )
    const importAsTracks = menuItems.find((item) =>
      item.textContent?.includes('Import MIDI as new tracks'),
    )
    if (importAsProject === undefined || importAsTracks === undefined) {
      throw new Error('Expected both Project MIDI import menu items')
    }
    importAsProject.click()
    await flushPromises()
    expect(wrapper.get('button[aria-label="Open project menu"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(invoke.mock.calls).toEqual([['project.import-midi', 'menu']])

    await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
    await nextTick()
    const reopenedImportAsTracks = [
      ...(document.body.querySelectorAll<HTMLElement>('.project-workbench__menu-item') ?? []),
    ].find((item) => item.textContent?.includes('Import MIDI as new tracks'))
    if (reopenedImportAsTracks === undefined) {
      throw new Error('Expected the reopened current-Project MIDI import menu item')
    }
    reopenedImportAsTracks.click()
    await nextTick()
    expect(invoke.mock.calls).toEqual([
      ['project.import-midi', 'menu'],
      ['project.import-midi-tracks', 'menu'],
    ])

    wrapper.unmount()
  })

  it('exposes dirty and failed Save states and emits the real Save intent', async () => {
    const wrapper = mountShell({
      isDirty: true,
      saveFailure: new Error('Checkpoint write failed'),
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
    })

    expect(wrapper.get('.project-workbench__save-status').text()).toBe('Couldn’t save')
    expect(wrapper.get('.project-workbench__save-status').attributes('title')).toBe(
      'Checkpoint write failed',
    )
    expect(wrapper.get('.project-workbench__save').text()).toContain('Retry save')

    await wrapper.get('.project-workbench__save').trigger('click')

    expect(invoke.mock.calls).toEqual([['project.save', 'toolbar']])
  })

  it('moves the Context Editor through minimized, fullscreen, closed and restored modes', async () => {
    const wrapper = mountShell()
    const workspace = wrapper.get('.project-workbench__workspace')

    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Minimize MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('minimized')

    await wrapper.get('button[aria-label="Restore MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Maximize MIDI editor"]').trigger('click')
    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe('428')

    await wrapper.get('button[aria-label="Restore MIDI editor height"]').trigger('click')
    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe('360')

    await wrapper
      .get('button[aria-label="Open MIDI editor in workspace fullscreen"]')
      .trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('fullscreen')
    expect(wrapper.get('.project-workbench__arrangement-layout').isVisible()).toBe(false)

    await wrapper.get('button[aria-label="Exit workspace fullscreen"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Close MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('closed')
    expect(wrapper.find('.project-workbench__dock').exists()).toBe(false)
    expect(wrapper.vm.getMidiEditor()?.isOpen()).toBe(false)

    wrapper.vm.getMidiEditor()?.open()
    await nextTick()
    expect(workspace.attributes('data-dock-mode')).toBe('docked')
    expect(wrapper.vm.getMidiEditor()?.isOpen()).toBe(true)
  })

  it('supports keyboard resizing through the semantic Splitter', async () => {
    const wrapper = mountShell()
    await nextTick()
    const splitter = wrapper.get('[role="separator"]')

    expect(splitter.attributes('aria-valuenow')).toBe('360')

    await splitter.trigger('keydown', { key: 'ArrowUp' })

    expect(splitter.attributes('aria-valuenow')).toBe('376')
    expect(splitter.attributes('aria-orientation')).toBe('horizontal')
  })

  it('restores preferred height after constraints and keeps both pane recovery controls reachable', async () => {
    const wrapper = mountShell()
    await nextTick()
    const workspace = wrapper.get('.project-workbench__workspace')
    const element = workspace.element as HTMLElement
    let height = 640
    Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => height })
    const resize = async (next: number) => {
      height = next
      window.dispatchEvent(new Event('resize'))
      await nextTick()
    }
    await wrapper.get('[aria-label="Resize MIDI editor"]').trigger('keydown', { key: 'ArrowUp' })
    await resize(500)
    expect(wrapper.get('[aria-label="Resize MIDI editor"]').attributes('aria-valuenow')).toBe('288')
    await resize(640)
    expect(wrapper.get('[aria-label="Resize MIDI editor"]').attributes('aria-valuenow')).toBe('376')
    await wrapper.get('.project-workbench__dock').trigger('focusin')
    await resize(350)
    expect(workspace.attributes('style')).toContain('32px 0px 318px')
    await wrapper.get('.project-workbench__arrangement-restore').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('minimized')
    expect(workspace.attributes('style')).toContain('306px 0px 44px')
    await wrapper.get('[aria-label="Restore MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')
    expect(wrapper.find('.project-workbench__arrangement-restore').exists()).toBe(true)
    await resize(640)
    expect(wrapper.get('[aria-label="Resize MIDI editor"]').attributes('aria-valuenow')).toBe('376')
    wrapper.unmount()
    window.dispatchEvent(new Event('resize'))
  })

  it('projects the selected Track into the Context Editor Dock', () => {
    const selectedTrackId = parseTrackId('shell-selected-track')
    const wrapper = mountWorkspace({
      selectedTrackId,
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#8B5CF6'),
          id: selectedTrackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          name: 'Instrument 1',
        }),
      ]),
    })

    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Instrument 1')
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Instrument 1')
    expect(wrapper.get('.project-workbench__context-host').text()).toContain(
      'No MIDI clip selected',
    )
  })

  it('projects the selected MIDI Clip into the open Context Editor', () => {
    const selectedTrackId = parseTrackId('shell-clip-owner')
    const selectedClipId = parseClipId('shell-selected-clip')
    const wrapper = mountWorkspace({
      clips: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#8B5CF6'),
          id: selectedClipId,
          muted: false,
          name: 'Midnight Keys',
          spanTick: parsePositiveTick(3_840),
          startTick: parseTick(0),
          trackId: selectedTrackId,
        }),
      ]),
      selectedClipId,
      selectedTrackId,
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#8B5CF6'),
          id: selectedTrackId,
          instrument: STUDIO_GRAND_INSTRUMENT,
          name: 'Instrument 1',
        }),
      ]),
    })

    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Clip inspector')
    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Midnight Keys')
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Instrument 1')
    expect(wrapper.get('.project-workbench__context-host').text()).toContain(
      'Piano Roll context is unavailable',
    )
  })
})
