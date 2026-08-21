import type { MidiFileDocument } from '@seele-daw/midi-file'
import { createStudioGrandDeviceDescriptor } from '@seele-daw/playback'
import {
  createInitialProjectSession,
  parseClipId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { createProjectMidiImportDraft } from '@seele-daw/project-midi'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import ProjectWorkspacePage from '@/features/project-workspace/ProjectWorkspacePage.vue'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { createStudioRouter } from '@/router'
import {
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_NAME,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import { createStudioKeyboardShortcutCoordinator } from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import {
  STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY,
  type StudioKeyboardShortcutVueContext,
} from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  createProjectClipCoordinator,
  type ProjectClipCoordinator,
} from '@/workbench/project/clip/project-clip-coordinator'
import {
  PROJECT_CLIP_CONTEXT_KEY,
  type ProjectClipVueContext,
} from '@/workbench/project/clip/vue/project-clip-context'
import {
  PROJECT_ENTRY_FAILURE_OPERATION,
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinator,
  type ProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import type {
  ProjectMidiImportCoordinator,
  ProjectMidiImportResult,
  ProjectMidiTrackImportResult,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  PROJECT_MIDI_IMPORT_CONTEXT_KEY,
  type ProjectMidiImportVueContext,
} from '@/workbench/project/midi-import/vue/project-midi-import-context'
import {
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationDecisionRequest,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import {
  PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
  type PendingProjectNavigationDecision,
  type ProjectNavigationDecisionVueContext,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
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
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  type ActiveProjectVueContext,
} from '@/workbench/project/vue/active-project-context'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'

interface PageFixture {
  readonly activeProjectContext: ActiveProjectVueContext
  readonly importLocalFileAsNewTracks: ReturnType<
    typeof vi.fn<ProjectMidiImportCoordinator['importLocalFileAsNewTracks']>
  >
  readonly importLocalFileReplacingActiveProject: ReturnType<
    typeof vi.fn<ProjectMidiImportCoordinator['importLocalFileReplacingActiveProject']>
  >
  readonly projectMidiImportContext: ProjectMidiImportVueContext
  readonly resolve: ReturnType<typeof vi.fn<ProjectEntryCoordinator['resolve']>>
  readonly save: ReturnType<typeof vi.fn<ActiveProjectService['save']>>
  readonly projectEntryContext: ProjectEntryVueContext
  readonly state: ShallowRef<ActiveProjectState>
}

const STOPPED_PLAYBACK_STATE = Object.freeze<ProjectPlaybackState>({
  diagnostics: Object.freeze([]),
  failureCause: null,
  feedback: null,
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.STOPPED,
  planStatus: null,
  positionProjectSecond: 0,
  projectId: null,
})

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve(value) {
      if (resolvePromise === null) throw new Error('Deferred resolver is unavailable')
      resolvePromise(value)
    },
  }
}

function createReadyState(
  projectId: ProjectId,
  session: ProjectSession = createTestSession(projectId),
): ReadyActiveProjectState {
  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId,
    session,
    modelRevision: session.modelRevision,
    contentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    savedContentStateId: session.contentStateId,
    isDirty: false,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    saveFailure: null,
    recoveryFailures: Object.freeze([]),
  })
}

function createFixture(
  resolveImplementation: ProjectEntryCoordinator['resolve'],
  initialState: ActiveProjectState = Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
): PageFixture {
  const state = shallowRef(initialState)
  const resolve = vi.fn<ProjectEntryCoordinator['resolve']>(resolveImplementation)
  const save = vi.fn<ActiveProjectService['save']>(async () => undefined)
  const importLocalFileReplacingActiveProject = vi.fn<
    ProjectMidiImportCoordinator['importLocalFileReplacingActiveProject']
  >(async () => null)
  const importLocalFileAsNewTracks =
    vi.fn<ProjectMidiImportCoordinator['importLocalFileAsNewTracks']>()
  const activeProject: ActiveProjectService = {
    get state() {
      return state.value
    },
    create: async () => parseProjectId('workspace-created-project'),
    createFromSession: async (session) => session.getSnapshot().project.id,
    open: async () => undefined,
    save,
    subscribe: () => () => undefined,
    subscribeCommits: () => () => undefined,
    dispose() {},
  }

  return {
    activeProjectContext: Object.freeze({
      activeProject,
      state: shallowReadonly(state),
    }),
    projectEntryContext: Object.freeze({
      projectEntry: Object.freeze({ resolve }),
    }),
    importLocalFileAsNewTracks,
    importLocalFileReplacingActiveProject,
    projectMidiImportContext: Object.freeze({
      projectMidiImport: Object.freeze({
        importLocalFile: vi.fn<ProjectMidiImportCoordinator['importLocalFile']>(),
        importLocalFileAsNewTracks,
        importLocalFileReplacingActiveProject,
      }),
    }),
    resolve,
    save,
    state,
  }
}

async function mountPage(fixture: PageFixture, projectId: ProjectId) {
  const router = createStudioRouter(createMemoryHistory())
  const pinia = createPinia()
  await router.push(createProjectWorkspaceLocation(projectId))
  await router.isReady()
  const projectClips: ProjectClipCoordinator = Object.freeze({
    addEmptyMidiClip: vi.fn<ProjectClipCoordinator['addEmptyMidiClip']>((input) =>
      Object.freeze({
        clipId: parseClipId('workspace-page-created-clip'),
        commit: Object.freeze({}) as ProjectCommit,
        trackId: input.trackId,
      }),
    ),
  })
  const projectTracks: ProjectTrackCoordinator = Object.freeze({
    addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(() =>
      Object.freeze({
        commit: Object.freeze({}) as ProjectCommit,
        trackId: parseTrackId('workspace-page-created-track'),
      }),
    ),
    useStudioGrand: vi.fn<ProjectTrackCoordinator['useStudioGrand']>(),
  })
  const projectClipContext: ProjectClipVueContext = Object.freeze({ projectClips })
  const projectTrackContext: ProjectTrackVueContext = Object.freeze({ projectTracks })
  const keyboardBindingRegistry = new TestStudioKeyboardBindingRegistry()
  const keyboardShortcuts = createStudioKeyboardShortcutCoordinator({
    bindingRegistry: keyboardBindingRegistry,
    keymap: STUDIO_DEFAULT_KEYMAP,
  })
  const keyboardShortcutContext: StudioKeyboardShortcutVueContext = Object.freeze({
    keyboardShortcuts,
  })
  const playbackState = shallowRef(STOPPED_PLAYBACK_STATE)
  const playbackVisualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      positionProjectSecond: 0,
      positionTick: 0 as ProjectPlaybackVisualPosition['positionTick'],
      projectId: null,
    }),
  )
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    beginTimelineLocate: vi.fn<ProjectPlaybackCoordinator['beginTimelineLocate']>(() => null),
    canReturnToLastStartPosition: vi.fn<ProjectPlaybackCoordinator['canReturnToLastStartPosition']>(
      () => false,
    ),
    get state() {
      return playbackState.value
    },
    locateAtTick: vi.fn<ProjectPlaybackCoordinator['locateAtTick']>(() => false),
    pause: vi.fn<ProjectPlaybackCoordinator['pause']>(() => false),
    play: vi.fn<ProjectPlaybackCoordinator['play']>(async () => false),
    readVisualPosition: vi.fn<ProjectPlaybackCoordinator['readVisualPosition']>(
      () => playbackVisualPosition.value,
    ),
    returnToLastStartPosition: vi.fn<ProjectPlaybackCoordinator['returnToLastStartPosition']>(
      () => false,
    ),
    subscribe: vi.fn<ProjectPlaybackCoordinator['subscribe']>(() => () => undefined),
    togglePlayPause: vi.fn<ProjectPlaybackCoordinator['togglePlayPause']>(() => true),
    dispose: vi.fn<ProjectPlaybackCoordinator['dispose']>(),
  })
  const projectPlaybackContext: ProjectPlaybackVueContext = Object.freeze({
    projectPlayback,
    state: shallowReadonly(playbackState),
    visualPosition: shallowReadonly(playbackVisualPosition),
  })
  const pendingNavigationDecision = shallowRef<PendingProjectNavigationDecision | null>(null)
  const projectNavigationDecisionContext: ProjectNavigationDecisionVueContext = Object.freeze({
    pendingDecision: shallowReadonly(pendingNavigationDecision),
    resolve: () => false,
  })
  const wrapper = mount(ProjectWorkspacePage, {
    props: { projectId },
    global: {
      plugins: [pinia, router],
      stubs: {
        ProjectPianoRollTrackSurface: true,
      },
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: fixture.activeProjectContext,
        [PROJECT_CLIP_CONTEXT_KEY as symbol]: projectClipContext,
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: fixture.projectEntryContext,
        [PROJECT_MIDI_IMPORT_CONTEXT_KEY as symbol]: fixture.projectMidiImportContext,
        [PROJECT_NAVIGATION_DECISION_CONTEXT_KEY as symbol]: projectNavigationDecisionContext,
        [PROJECT_PLAYBACK_CONTEXT_KEY as symbol]: projectPlaybackContext,
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: projectTrackContext,
        [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboardShortcutContext,
      },
    },
  })

  return {
    router,
    keyboardBindingRegistry,
    pendingNavigationDecision,
    projectPlayback,
    playbackState,
    playbackVisualPosition,
    selection: useProjectWorkbenchSelectionStore(pinia),
    wrapper,
  }
}

describe('ProjectWorkspacePage', () => {
  it('resolves a deep-linked Project and renders its Workbench Shell', async () => {
    const projectId = parseProjectId('project-workspace-page-ready')
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      createReadyState(projectId),
    )
    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(projectId)
    expect(wrapper.find('.project-workbench').exists()).toBe(true)
    expect(wrapper.text()).toContain(`Test ${projectId}`)
    expect(wrapper.text()).toContain(projectId)
    expect(wrapper.getComponent(ProjectWorkbenchShell).props('timelineEndTick')).toBe(576_000)
  })

  it('extends a long imported MIDI song through eight complete Timeline tail bars', async () => {
    const document: MidiFileDocument = {
      format: 1,
      name: 'Long Imported Song',
      ppq: 960,
      tempos: [{ tick: 0, bpm: 120 }],
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      keySignatures: [],
      textEvents: [],
      tracks: [
        {
          name: 'Piano',
          channel: 0,
          programNumber: 0,
          notes: [
            {
              tick: 576_000,
              durationTicks: 960,
              pitch: 60,
              velocity: 100,
              releaseVelocity: 0,
            },
          ],
          controlChanges: [],
          pitchBends: [],
        },
      ],
    }
    const imported = createProjectMidiImportDraft({
      document,
      createId: ({ kind, ordinal }) => `long-import-${kind}-${ordinal}`,
      createInstrumentDevice: ({ id }) => createStudioGrandDeviceDescriptor(id),
      createTrackColor: () => null,
    })
    const projectId = imported.session.getSnapshot().project.id
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, imported.session),
    )

    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    expect(wrapper.getComponent(ProjectWorkbenchShell).props('timelineEndTick')).toBe(610_560)
    const rulerBars = wrapper.findAll('.project-workbench__ruler li')
    expect(rulerBars).toHaveLength(159)
    expect(rulerBars[158]?.text()).toBe('159')
  })

  it('imports Arrangement MIDI as current-Project Tracks and selects the first Track', async () => {
    const projectId = parseProjectId('project-workspace-page-midi-import-source')
    const firstTrackId = parseTrackId('project-workspace-page-midi-import-first-track')
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId),
    )
    const importResult: ProjectMidiTrackImportResult = Object.freeze({
      diagnostics: Object.freeze([]),
      importedTrackIds: Object.freeze([
        firstTrackId,
        parseTrackId('project-workspace-page-midi-import-second-track'),
      ]),
      projectId,
      summary: Object.freeze({
        importedNoteCount: 32,
        importedTrackCount: 2,
        sourceFormat: 1,
        sourcePpq: 480,
        sourceTrackCount: 2,
      }),
    })
    fixture.importLocalFileAsNewTracks.mockResolvedValueOnce(importResult)
    const { playbackVisualPosition, router, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
    const requestFile = vi.spyOn(input.element, 'click').mockImplementation(() => undefined)

    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionTick: 7_680.4 as ProjectPlaybackVisualPosition['positionTick'],
    })
    await wrapper.get('.project-workbench__empty-midi-import').trigger('click')
    expect(requestFile).toHaveBeenCalledOnce()
    requestFile.mockRestore()

    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionTick: 11_520.2 as ProjectPlaybackVisualPosition['positionTick'],
    })

    const file = new File([], 'arrangement-import.mid', { type: 'audio/midi' })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: {
        item: (index: number) => (index === 0 ? file : null),
        length: 1,
      },
    })
    await input.trigger('change')
    await flushPromises()

    expect(fixture.importLocalFileAsNewTracks).toHaveBeenCalledExactlyOnceWith(
      file,
      parseTick(7_680),
    )
    expect(fixture.importLocalFileReplacingActiveProject).not.toHaveBeenCalled()
    expect(router.currentRoute.value.params.projectId).toBe(projectId)
    expect(useProjectWorkbenchSelectionStore().selectedTrackId).toBe(firstTrackId)
    expect(useUiToastStore().message).toMatchObject({
      description:
        '2 tracks and 32 notes imported. Current Project tempo and time signatures were kept.',
      title: 'MIDI tracks imported',
      tone: 'success',
    })
  })

  it('keeps the menu action that imports MIDI as a separate Project', async () => {
    const projectId = parseProjectId('project-workspace-page-midi-import-menu-source')
    const importedProjectId = parseProjectId('project-workspace-page-midi-import-menu-target')
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId),
    )
    const importResult: ProjectMidiImportResult = Object.freeze({
      diagnostics: Object.freeze([]),
      projectId: importedProjectId,
      summary: Object.freeze({
        importedNoteCount: 12,
        importedTrackCount: 1,
        sourceFormat: 1,
        sourcePpq: 480,
        sourceTrackCount: 1,
      }),
    })
    fixture.importLocalFileReplacingActiveProject.mockResolvedValueOnce(importResult)
    const { router, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')

    wrapper.getComponent(ProjectWorkbenchShell).vm.$emit('importMidiAsNewProject')
    await nextTick()
    const file = new File([], 'new-project.mid', { type: 'audio/midi' })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: {
        item: (index: number) => (index === 0 ? file : null),
        length: 1,
      },
    })
    await input.trigger('change')
    await flushPromises()

    expect(fixture.importLocalFileReplacingActiveProject).toHaveBeenCalledExactlyOnceWith(file)
    expect(fixture.importLocalFileAsNewTracks).not.toHaveBeenCalled()
    expect(router.currentRoute.value.params.projectId).toBe(importedProjectId)
    expect(useUiToastStore().message).toMatchObject({
      description: '1 track and 12 notes imported.',
      title: 'MIDI imported',
      tone: 'success',
    })
  })

  it('keeps the current Workbench and stays quiet when MIDI replacement is cancelled', async () => {
    const projectId = parseProjectId('project-workspace-page-midi-import-cancelled')
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId),
    )
    const { router, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
    wrapper.getComponent(ProjectWorkbenchShell).vm.$emit('importMidiAsNewProject')
    await nextTick()
    const file = new File([], 'cancelled.mid', { type: 'audio/midi' })
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: {
        item: (index: number) => (index === 0 ? file : null),
        length: 1,
      },
    })

    await input.trigger('change')
    await flushPromises()

    expect(fixture.importLocalFileReplacingActiveProject).toHaveBeenCalledExactlyOnceWith(file)
    expect(router.currentRoute.value.params.projectId).toBe(projectId)
    expect(useUiToastStore().message).toBeNull()
  })

  it('renders Transport time from the shared visual position source', async () => {
    const projectId = parseProjectId('project-workspace-page-visual-position')
    const session = createTestSession(projectId)
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { playbackState, playbackVisualPosition, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    playbackVisualPosition.value = Object.freeze({
      modelRevision: session.modelRevision,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      positionProjectSecond: 65.432,
      positionTick: 125_629.44 as ProjectPlaybackVisualPosition['positionTick'],
      projectId,
    })
    await nextTick()

    expect(playbackState.value.positionProjectSecond).toBe(0)
    expect(wrapper.get('[aria-label="Current play time"]').text()).toBe('01:05.432')
    expect(wrapper.get('.project-workbench__arrangement-playhead').attributes('style')).toContain(
      'transform: translate3d(163.58rem, 0, 0)',
    )
  })

  it('delegates a dirty Workbench Save action to Active Project', async () => {
    const projectId = parseProjectId('project-workspace-page-save')
    const ready = createReadyState(projectId)
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      Object.freeze({
        ...ready,
        isDirty: true,
        savedRevision: null,
        savedContentStateId: null,
      }),
    )
    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    await wrapper.get('.project-workbench__save').trigger('click')
    await flushPromises()

    expect(fixture.save).toHaveBeenCalledOnce()
  })

  it('handles Save through the Workbench shortcut only while saving is available', async () => {
    const projectId = parseProjectId('project-workspace-page-save-shortcut')
    const ready = createReadyState(projectId)
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      Object.freeze({
        ...ready,
        isDirty: true,
        savedRevision: null,
        savedContentStateId: null,
      }),
    )
    const { keyboardBindingRegistry, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    const handled = keyboardBindingRegistry.dispatch('Mod+S')
    await flushPromises()

    expect(handled.defaultPrevented).toBe(true)
    expect(fixture.save).toHaveBeenCalledOnce()

    fixture.state.value = createReadyState(projectId)
    await nextTick()
    const unhandled = keyboardBindingRegistry.dispatch('Mod+S')
    expect(unhandled.defaultPrevented).toBe(false)
    expect(fixture.save).toHaveBeenCalledOnce()

    wrapper.unmount()
    expect(keyboardBindingRegistry.listeners.size).toBe(0)
  })

  it('routes Undo and both Redo bindings to current Project History', async () => {
    const projectId = parseProjectId('project-workspace-page-history-shortcuts')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'History Shortcuts',
      tempoEventId: parseTempoEventId('tempo-history-shortcuts'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-history-shortcuts'),
    })
    const ready = createReadyState(projectId, session)
    createProjectTrackCoordinator({
      activeProject: { state: ready },
      createUniqueId: (() => {
        const identities = ['history-shortcut-track', 'history-shortcut-device']
        return () => identities.shift() ?? 'unused-history-shortcut-id'
      })(),
      createRandomValue: () => 0,
    }).addInstrumentTrack()
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      ready,
    )
    const { keyboardBindingRegistry } = await mountPage(fixture, projectId)
    await flushPromises()

    const undo = keyboardBindingRegistry.dispatch('Mod+Z')
    expect(undo.defaultPrevented).toBe(true)
    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(true)

    const redo = keyboardBindingRegistry.dispatch('Control+Y')
    expect(redo.defaultPrevented).toBe(true)
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(false)

    const unavailableRedo = keyboardBindingRegistry.dispatch('Mod+Shift+Z')
    expect(unavailableRedo.defaultPrevented).toBe(false)
  })

  it('toggles playable Transport through Space unless a navigation modal owns focus', async () => {
    const projectId = parseProjectId('project-workspace-page-playback-shortcut')
    const session = createTestSession(projectId)
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      createReadyState(projectId, session),
    )
    const { keyboardBindingRegistry, pendingNavigationDecision, projectPlayback, playbackState } =
      await mountPage(fixture, projectId)
    playbackState.value = Object.freeze({
      ...STOPPED_PLAYBACK_STATE,
      modelRevision: session.modelRevision,
      planStatus: 'playable',
      projectId,
    })
    await nextTick()

    const handled = keyboardBindingRegistry.dispatch('Space')

    expect(handled.defaultPrevented).toBe(true)
    expect(projectPlayback.togglePlayPause).toHaveBeenCalledOnce()

    const request: ProjectNavigationDecisionRequest = Object.freeze({
      activeProjectId: projectId,
      contentStateId: session.contentStateId,
      intent: Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT }),
      previousSaveFailure: null,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    })
    pendingNavigationDecision.value = Object.freeze<PendingProjectNavigationDecision>({ request })
    const ignored = keyboardBindingRegistry.dispatch('Space')

    expect(ignored.defaultPrevented).toBe(false)
    expect(projectPlayback.togglePlayPause).toHaveBeenCalledOnce()
  })

  it('keeps empty-plan guidance on the disabled Play control without a launch Toast', async () => {
    const projectId = parseProjectId('project-workspace-page-empty-playback')
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      createReadyState(projectId),
    )
    const { playbackState, wrapper } = await mountPage(fixture, projectId)
    playbackState.value = Object.freeze({
      ...STOPPED_PLAYBACK_STATE,
      feedback: Object.freeze({ kind: 'info', message: 'No audible MIDI notes to play.' }),
      planStatus: 'empty',
      projectId,
    })
    await nextTick()

    expect(wrapper.get('button[aria-label="Play — No audible MIDI notes to play."]')).toBeTruthy()
    expect(useUiToastStore().message).toBeNull()
  })

  it('returns a missing requested Project to Entry with an exclusion notice', async () => {
    const projectId = parseProjectId('project-workspace-page-missing')
    const fixture = createFixture(async () =>
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
        reason: PROJECT_ENTRY_SELECTION_REASON.REQUESTED_PROJECT_NOT_FOUND,
        requestedProjectId: projectId,
        recentProjects: Object.freeze([]),
      }),
    )
    const { router } = await mountPage(fixture, projectId)

    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY))
    expect(router.currentRoute.value.query[PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID]).toBe(
      projectId,
    )
  })

  it('keeps storage failures visible and retries the same Project', async () => {
    const projectId = parseProjectId('project-workspace-page-failed')
    const failedResolution: ProjectEntryResolution = Object.freeze({
      kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
      operation: PROJECT_ENTRY_FAILURE_OPERATION.OPEN_REQUESTED_PROJECT,
      requestedProjectId: projectId,
      failureCause: new Error('Checkpoint candidates are damaged'),
    })
    const fixture = createFixture(async () => failedResolution)
    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toBe('Checkpoint candidates are damaged')

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(fixture.resolve).toHaveBeenCalledTimes(2)
    expect(fixture.resolve).toHaveBeenNthCalledWith(2, projectId)
  })

  it('ignores a result from an older Project prop after a newer request starts', async () => {
    const firstProjectId = parseProjectId('project-workspace-page-first')
    const secondProjectId = parseProjectId('project-workspace-page-second')
    const first = createDeferred<ProjectEntryResolution>()
    const second = createDeferred<ProjectEntryResolution>()
    const fixture = createFixture((projectId) =>
      projectId === firstProjectId ? first.promise : second.promise,
    )
    const { router, selection, wrapper } = await mountPage(fixture, firstProjectId)
    await vi.waitFor(() => expect(fixture.resolve).toHaveBeenCalledOnce())
    selection.selectTrack(parseTrackId('workspace-selection-from-first-project'))

    await wrapper.setProps({ projectId: secondProjectId })
    await vi.waitFor(() => expect(fixture.resolve).toHaveBeenCalledTimes(2))
    expect(selection.projectId).toBe(secondProjectId)
    expect(selection.selectedTrackId).toBeNull()
    fixture.state.value = createReadyState(secondProjectId)
    second.resolve(
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
        projectId: secondProjectId,
      }),
    )
    await flushPromises()
    first.resolve(
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
        reason: PROJECT_ENTRY_SELECTION_REASON.REQUESTED_PROJECT_NOT_FOUND,
        requestedProjectId: firstProjectId,
        recentProjects: Object.freeze([]),
      }),
    )
    await flushPromises()

    expect(wrapper.text()).toContain(secondProjectId)
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(
      router.currentRoute.value.query[PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID],
    ).toBeUndefined()
  })

  it('reconciles Clip Selection from the latest Project ownership facts', async () => {
    const projectId = parseProjectId('project-workspace-page-clip-selection')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Clip Selection',
      tempoEventId: parseTempoEventId('tempo-workspace-clip-selection'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-workspace-clip-selection'),
    })
    const initialReadyState = createReadyState(projectId, session)
    const track = createProjectTrackCoordinator({
      activeProject: { state: initialReadyState },
      createUniqueId: (() => {
        const identities = ['track-workspace-clip', 'device-workspace-clip']
        return () => identities.shift() ?? 'unused-workspace-track-id'
      })(),
      createRandomValue: () => 0,
    }).addInstrumentTrack()
    const clip = createProjectClipCoordinator({
      activeProject: { state: initialReadyState },
      createUniqueId: (() => {
        const identities = ['clip-workspace-selection', 'source-workspace-selection']
        return () => identities.shift() ?? 'unused-workspace-clip-id'
      })(),
    }).addEmptyMidiClip({
      trackId: track.trackId,
      targetTick: parseTick(0),
    })
    const fixture = createFixture(
      async () =>
        Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
          projectId,
        }),
      createReadyState(projectId, session),
    )
    const { selection } = await mountPage(fixture, projectId)
    await flushPromises()

    selection.selectClip(track.trackId, clip.clipId)
    session.undo()
    fixture.state.value = createReadyState(projectId, session)
    await nextTick()

    expect(selection.selectedClipId).toBeNull()
    expect(selection.selectedTrackId).toBe(track.trackId)
  })
})
