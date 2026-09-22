import { createDeferredActionResult } from '@/workbench/actions/__tests__/support/deferred-action-test-support'
import { createStandardMidiFileSourceEnvelope, type MidiFileDocument } from '@seele-daw/midi-file'
import { createStudioGrandDeviceDescriptor } from '@seele-daw/playback'
import {
  createInitialProjectSession,
  createAllProjectCommitsSubscription,
  createReplaceTempoEventBpmCommand,
  parseClipId,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_INSTRUMENT_MAPPING_KIND,
  createProjectMidiImportDraft,
} from '@seele-daw/project-midi'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'

import ProjectWorkspacePage from '@/features/project-workspace/ProjectWorkspacePage.vue'
import { STUDIO_ACTION, STUDIO_ACTION_NOT_APPLIED } from '@/workbench/actions/studio-action'
import { createStudioKeyboardKeymap } from '@/workbench/keyboard/studio-default-keymap'
import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { createStudioRouter } from '@/router'
import {
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_NAME,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
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
  NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
  NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
} from '@/workbench/project/midi-import/__tests__/support/project-midi-import-test-support'
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
import { createProjectTempoEventCoordinator } from '@/workbench/project/tempo-event/project-tempo-event-coordinator'
import {
  PROJECT_TEMPO_EVENT_CONTEXT_KEY,
  type ProjectTempoEventVueContext,
} from '@/workbench/project/tempo-event/vue/project-tempo-event-context'
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

async function mountPage(
  fixture: PageFixture,
  projectId: ProjectId,
  actionOptions: Parameters<typeof createTestStudioActionRuntime>[0] = {},
) {
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
    selectBuiltInInstrument: vi.fn<ProjectTrackCoordinator['selectBuiltInInstrument']>(),
  })
  const projectClipContext: ProjectClipVueContext = Object.freeze({ projectClips })
  const projectTrackContext: ProjectTrackVueContext = Object.freeze({ projectTracks })
  let tempoEventIdentity = 0
  const projectTempoEventContext: ProjectTempoEventVueContext = Object.freeze({
    projectTempoEvents: createProjectTempoEventCoordinator({
      activeProject: fixture.activeProjectContext.activeProject,
      createUniqueId: () => `workspace-page-tempo-event-${++tempoEventIdentity}`,
    }),
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
  const actionFixture = createTestStudioActionRuntime({
    ...actionOptions,
    isModalActive: () => pendingNavigationDecision.value !== null,
  })
  const keyboardBindingRegistry = actionFixture.bindingRegistry
  const invoke = vi.spyOn(actionFixture.runtime.actions, 'invoke')
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
        [PROJECT_TEMPO_EVENT_CONTEXT_KEY as symbol]: projectTempoEventContext,
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: projectTrackContext,
        ...actionFixture.provide,
      },
    },
  })

  onTestFinished(() => {
    if (wrapper.exists()) wrapper.unmount()
  })
  return {
    router,
    invoke,
    actionFixture,
    keyboardBindingRegistry,
    pendingNavigationDecision,
    projectPlayback,
    playbackState,
    playbackVisualPosition,
    selection: useProjectWorkbenchSelectionStore(pinia),
    wrapper,
  }
}

async function openProjectMenuItem(wrapper: VueWrapper, label: string): Promise<HTMLElement> {
  const trigger = wrapper.get('button[aria-label="Open project menu"]')
  if (trigger.attributes('aria-expanded') !== 'true') await trigger.trigger('click')
  await flushPromises()
  const item = [
    ...document.body.querySelectorAll<HTMLElement>('.project-workbench__menu-item'),
  ].find((entry) => entry.querySelector('.ui-menu-item__label')?.textContent?.trim() === label)
  if (item === undefined) throw new Error(`Expected project menu item: ${label}`)
  return item
}

function selectMidiFile(input: HTMLInputElement): File {
  const file = new File([], 'workbench-action.mid', { type: 'audio/midi' })
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: { item: (index: number) => (index === 0 ? file : null), length: 1 },
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  return file
}

describe('ProjectWorkspacePage', () => {
  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'uses one History operation and shared capability through %s',
    async (source) => {
      const projectId = parseProjectId(`history-action-${source}`)
      const session = createInitialProjectSession({
        projectId,
        projectName: 'History Action',
        tempoEventId: parseTempoEventId(`tempo-${source}`),
        timeSignatureEventId: parseTimeSignatureEventId(`meter-${source}`),
      })
      const tempo = session.getSnapshot().tempoEvents[0]!
      session.execute(
        createReplaceTempoEventBpmCommand({
          baseRevision: session.modelRevision,
          bpm: parseTempoBpm(135),
          tempoEventId: tempo.id,
        }),
      )
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId, session),
      )
      const release = session.subscribe(createAllProjectCommitsSubscription(), {
        onCommit: () => {
          fixture.state.value = createReadyState(projectId, session)
        },
        onError: (failure) => {
          throw failure
        },
      })
      onTestFinished(release)
      const { wrapper, keyboardBindingRegistry, invoke } = await mountPage(fixture, projectId)
      await flushPromises()
      const undoRevision = session.modelRevision
      const undoItem = await openProjectMenuItem(wrapper, 'Undo')
      expect(undoItem.querySelector('.project-workbench__menu-shortcut')?.textContent).toBe(
        'display:Mod+Z',
      )
      expect(undoItem.title).toBe(wrapper.get('button[aria-label="Undo"]').attributes('title'))
      if (source === 'menu') undoItem.click()
      else {
        await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
        await flushPromises()
        if (source === 'toolbar') await wrapper.get('button[aria-label="Undo"]').trigger('click')
        else keyboardBindingRegistry.dispatch('Mod+Z')
      }
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.HISTORY_UNDO, source)
      expect(session.modelRevision).toBe(undoRevision + 1)
      expect(session.getSnapshot().tempoEvents[0]?.bpm).toBe(tempo.bpm)
      expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('button[aria-label="Redo"]').attributes('disabled')).toBeUndefined()

      invoke.mockClear()
      const redoRevision = session.modelRevision
      const undo = await openProjectMenuItem(wrapper, 'Undo')
      expect(undo.getAttribute('aria-disabled')).toBe('true')
      const redo = await openProjectMenuItem(wrapper, 'Redo')
      expect(redo.title).toBe(wrapper.get('button[aria-label="Redo"]').attributes('title'))
      if (source === 'menu') redo.click()
      else {
        await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
        await flushPromises()
        if (source === 'toolbar') await wrapper.get('button[aria-label="Redo"]').trigger('click')
        else keyboardBindingRegistry.dispatch('Mod+Shift+Z')
      }
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.HISTORY_REDO, source)
      expect(session.modelRevision).toBe(redoRevision + 1)
      expect(session.getSnapshot().tempoEvents[0]?.bpm).toBe(135)
      expect(wrapper.get('button[aria-label="Redo"]').attributes('disabled')).toBeDefined()
    },
  )

  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'shares loading, playing and pause state through %s',
    async (source) => {
      const projectId = parseProjectId(`playback-action-${source}`)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId),
      )
      const { wrapper, playbackState, projectPlayback, keyboardBindingRegistry, invoke } =
        await mountPage(fixture, projectId)
      const pending = createDeferredActionResult<boolean>()
      playbackState.value = { ...STOPPED_PLAYBACK_STATE, projectId, planStatus: 'playable' }
      vi.mocked(projectPlayback.play).mockImplementation(() => {
        playbackState.value = { ...playbackState.value, phase: PROJECT_PLAYBACK_PHASE.LOADING }
        return pending.promise
      })
      vi.mocked(projectPlayback.pause).mockImplementation(() => {
        playbackState.value = { ...playbackState.value, phase: PROJECT_PLAYBACK_PHASE.PAUSED }
        return true
      })
      await flushPromises()
      if (source === 'menu') (await openProjectMenuItem(wrapper, 'Play')).click()
      else if (source === 'toolbar') await wrapper.get('button[aria-label="Play"]').trigger('click')
      else keyboardBindingRegistry.dispatch('Space')
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PLAYBACK_TOGGLE, source)
      expect(projectPlayback.play).toHaveBeenCalledOnce()
      expect(wrapper.get('button[aria-label="Loading…"]').attributes('aria-busy')).toBe('true')
      expect(wrapper.get('button[aria-label="Loading…"]').attributes('disabled')).toBeDefined()
      expect(keyboardBindingRegistry.dispatch('Space').defaultPrevented).toBe(false)
      const loading = await openProjectMenuItem(wrapper, 'Loading…')
      expect(loading.getAttribute('aria-disabled')).toBe('true')
      expect(loading.title).toBe(wrapper.get('button[aria-label="Loading…"]').attributes('title'))
      await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
      await flushPromises()
      playbackState.value = { ...playbackState.value, phase: PROJECT_PLAYBACK_PHASE.PLAYING }
      pending.resolve(true)
      await flushPromises()
      expect(wrapper.get('button[aria-label="Pause"]').attributes('aria-pressed')).toBe('true')
      invoke.mockClear()
      if (source === 'menu') (await openProjectMenuItem(wrapper, 'Pause')).click()
      else if (source === 'toolbar')
        await wrapper.get('button[aria-label="Pause"]').trigger('click')
      else keyboardBindingRegistry.dispatch('Space')
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PLAYBACK_TOGGLE, source)
      expect(projectPlayback.pause).toHaveBeenCalledOnce()
      expect(projectPlayback.togglePlayPause).not.toHaveBeenCalled()
      expect(wrapper.get('button[aria-label="Play"]').attributes('aria-pressed')).toBe('false')
    },
  )

  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'allows Return during loading and follows the owner capability through %s',
    async (source) => {
      const projectId = parseProjectId(`return-action-${source}`)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId),
      )
      const { wrapper, playbackState, projectPlayback, keyboardBindingRegistry, invoke } =
        await mountPage(fixture, projectId, {
          keymap: createStudioKeyboardKeymap({
            [STUDIO_ACTION.PLAYBACK_RETURN_TO_START]: [defineStudioKeyboardBinding('Enter')],
          }),
        })
      vi.mocked(projectPlayback.canReturnToLastStartPosition).mockImplementation(
        () => playbackState.value.phase === PROJECT_PLAYBACK_PHASE.LOADING,
      )
      vi.mocked(projectPlayback.returnToLastStartPosition).mockImplementation(() => {
        playbackState.value = { ...playbackState.value, phase: PROJECT_PLAYBACK_PHASE.STOPPED }
        return true
      })
      playbackState.value = {
        ...STOPPED_PLAYBACK_STATE,
        projectId,
        planStatus: 'playable',
        phase: PROJECT_PLAYBACK_PHASE.LOADING,
      }
      await flushPromises()
      const label = 'Return to last start position'
      expect(wrapper.get(`button[aria-label="${label}"]`).attributes('disabled')).toBeUndefined()
      if (source === 'menu') (await openProjectMenuItem(wrapper, label)).click()
      else if (source === 'toolbar')
        await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
      else keyboardBindingRegistry.dispatch('Enter')
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PLAYBACK_RETURN_TO_START, source)
      expect(projectPlayback.returnToLastStartPosition).toHaveBeenCalledOnce()
      expect(wrapper.get(`button[aria-label="${label}"]`).attributes('disabled')).toBeDefined()
      expect(keyboardBindingRegistry.dispatch('Enter').defaultPrevented).toBe(false)
    },
  )

  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'keeps navigation under Router guards and allows retry after cancellation through %s',
    async (source) => {
      const projectId = parseProjectId(`projects-action-${source}`)
      const ready = { ...createReadyState(projectId), isDirty: true }
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        ready,
      )
      const { wrapper, router, actionFixture, keyboardBindingRegistry, invoke } = await mountPage(
        fixture,
        projectId,
        {
          keymap: createStudioKeyboardKeymap({
            [STUDIO_ACTION.PROJECTS_SHOW]: [defineStudioKeyboardBinding('Mod+P')],
          }),
        },
      )
      const pending = createDeferredActionResult<boolean>()
      const guard = vi.fn<() => Promise<boolean>>(() => pending.promise)
      const removeGuard = router.beforeEach(guard)
      await flushPromises()
      if (source === 'menu') (await openProjectMenuItem(wrapper, 'Projects')).click()
      else if (source === 'toolbar')
        await wrapper.get('.project-workbench__compact-warning button').trigger('click')
      else keyboardBindingRegistry.dispatch('Mod+P')
      await flushPromises()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PROJECTS_SHOW, source)
      const invocation = invoke.mock.results[0]?.value
      if (invocation?.status !== 'accepted') throw new Error('Expected pending navigation')
      expect(guard).toHaveBeenCalledOnce()
      expect(
        actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECTS_SHOW),
      ).toMatchObject({ busy: true, enabled: false })
      expect(actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECTS_SHOW, 'menu').status).toBe(
        'unavailable',
      )
      pending.resolve(false)
      await expect(invocation.completion).resolves.toEqual({ status: 'not-applied' })
      expect(router.currentRoute.value.params.projectId).toBe(projectId)
      expect(fixture.state.value).toBe(ready)
      expect(
        actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECTS_SHOW),
      ).toMatchObject({ busy: false, enabled: true })
      removeGuard()
      const retry = actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECTS_SHOW, 'toolbar')
      if (retry.status !== 'accepted') throw new Error('Expected navigation retry')
      await expect(retry.completion).resolves.toEqual({ status: 'completed' })
      expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)
      expect(actionFixture.failures).toEqual([])
    },
  )

  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'opens and restores the current MIDI editor through %s without writing project facts',
    async (source) => {
      const projectId = parseProjectId(`midi-editor-action-${source}`)
      const ready = createReadyState(projectId)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        ready,
      )
      const { wrapper, actionFixture, keyboardBindingRegistry, invoke } = await mountPage(
        fixture,
        projectId,
        {
          keymap: createStudioKeyboardKeymap({
            [STUDIO_ACTION.MIDI_EDITOR_OPEN]: [defineStudioKeyboardBinding('F4')],
          }),
        },
      )
      await flushPromises()
      const initialRevision = ready.session.modelRevision
      const openEditor = async () => {
        const item = await openProjectMenuItem(wrapper, 'Open MIDI editor')
        expect(item.title).toBe(
          wrapper.get('button[aria-label="Open MIDI editor"]').attributes('title'),
        )
        if (source === 'menu') item.click()
        else {
          await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
          await flushPromises()
          if (source === 'toolbar')
            await wrapper.get('button[aria-label="Open MIDI editor"]').trigger('click')
          else keyboardBindingRegistry.dispatch('F4')
        }
        await flushPromises()
      }
      await wrapper.get('button[aria-label="Close MIDI editor"]').trigger('click')
      expect(wrapper.get('button[aria-label="Open MIDI editor"]').attributes('aria-pressed')).toBe(
        'false',
      )
      await openEditor()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.MIDI_EDITOR_OPEN, source)
      expect(wrapper.get('.project-workbench__workspace').attributes('data-dock-mode')).toBe(
        'docked',
      )
      expect(wrapper.get('button[aria-label="Open MIDI editor"]').attributes('aria-pressed')).toBe(
        'true',
      )
      await wrapper.get('button[aria-label="Minimize MIDI editor"]').trigger('click')
      await openEditor()
      expect(wrapper.get('.project-workbench__workspace').attributes('data-dock-mode')).toBe(
        'docked',
      )
      expect(ready.session.modelRevision).toBe(initialRevision)
      wrapper.unmount()
      expect(
        actionFixture.runtime.actions.invoke(STUDIO_ACTION.MIDI_EDITOR_OPEN, 'menu').status,
      ).toBe('unavailable')
    },
  )

  it.each([
    { destination: 'new-tracks', source: 'menu' },
    { destination: 'new-tracks', source: 'toolbar' },
    { destination: 'new-tracks', source: 'keyboard' },
    { destination: 'new-project', source: 'menu' },
    { destination: 'new-project', source: 'keyboard' },
  ] as const)(
    'imports $destination from $source with one chooser and a shared pending result',
    async ({ destination, source }) => {
      const projectId = parseProjectId(`midi-action-${destination}-${source}`)
      const ready = createReadyState(projectId)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        ready,
      )
      const actionId =
        destination === 'new-tracks'
          ? STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS
          : STUDIO_ACTION.PROJECT_IMPORT_MIDI
      const {
        wrapper,
        router,
        actionFixture,
        playbackVisualPosition,
        keyboardBindingRegistry,
        invoke,
        selection,
      } = await mountPage(fixture, projectId, {
        keymap: createStudioKeyboardKeymap({ [actionId]: [defineStudioKeyboardBinding('Mod+I')] }),
      })
      const pending = createDeferredActionResult<void>()
      const importedTrackId = parseTrackId(`imported-track-${source}`)
      const result = {
        diagnostics: [],
        importedTrackIds: [importedTrackId],
        projectId:
          destination === 'new-project' ? parseProjectId(`imported-project-${source}`) : projectId,
        summary: {
          importedNoteCount: 12,
          importedTrackCount: 1,
          sourceFormat: 1 as const,
          sourceEnvelope: NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
          semanticBinding: NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
          sourcePpq: 480,
          sourceTrackCount: 1,
        },
      }
      fixture.importLocalFileAsNewTracks.mockImplementation(async () => {
        await pending.promise
        return result
      })
      fixture.importLocalFileReplacingActiveProject.mockImplementation(async () => {
        await pending.promise
        // Replacing the active Session retires the old Action target before route navigation.
        fixture.state.value = createReadyState(result.projectId)
        return result
      })
      await flushPromises()
      const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
      const chooser = vi.spyOn(input.element, 'click').mockImplementation(() => {})
      playbackVisualPosition.value = {
        ...playbackVisualPosition.value,
        positionTick: 7_680.4 as ProjectPlaybackVisualPosition['positionTick'],
      }
      if (source === 'menu') {
        ;(
          await openProjectMenuItem(
            wrapper,
            destination === 'new-tracks'
              ? 'Import MIDI as new tracks…'
              : 'Import MIDI as new project…',
          )
        ).click()
      } else if (source === 'toolbar')
        wrapper.get<HTMLButtonElement>('.project-workbench__empty-midi-import').element.click()
      else keyboardBindingRegistry.dispatch('Mod+I')
      // No microtask may separate the native chooser from the user activation.
      expect(chooser).toHaveBeenCalledOnce()
      expect(invoke).toHaveBeenCalledExactlyOnceWith(actionId, source)
      const invocation = invoke.mock.results[0]?.value
      if (invocation?.status !== 'accepted') throw new Error('Expected pending MIDI import')
      await flushPromises()
      expect(actionFixture.runtime.actions.presentationFor(actionId)).toMatchObject({
        label: 'Choosing MIDI file…',
        busy: true,
        enabled: false,
      })
      expect(actionFixture.runtime.actions.invoke(actionId, 'menu').status).toBe('unavailable')
      playbackVisualPosition.value = {
        ...playbackVisualPosition.value,
        positionTick: 11_520 as ProjectPlaybackVisualPosition['positionTick'],
      }
      const file = selectMidiFile(input.element)
      await flushPromises()
      for (const id of [
        STUDIO_ACTION.PROJECT_IMPORT_MIDI,
        STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS,
      ]) {
        expect(actionFixture.runtime.actions.presentationFor(id)).toMatchObject({
          label: 'Importing MIDI…',
          busy: true,
          enabled: false,
        })
      }
      expect(
        wrapper.get('.project-workbench__empty-midi-import').attributes('disabled'),
      ).toBeDefined()
      const item = await openProjectMenuItem(wrapper, 'Importing MIDI…')
      expect(item.getAttribute('aria-disabled')).toBe('true')
      await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
      expect(fixture.importLocalFileAsNewTracks.mock.calls).toEqual(
        destination === 'new-tracks' ? [[file, parseTick(7_680)]] : [],
      )
      expect(fixture.importLocalFileReplacingActiveProject.mock.calls).toEqual(
        destination === 'new-project' ? [[file]] : [],
      )
      pending.resolve()
      await flushPromises()
      await expect(invocation.completion).resolves.toEqual({
        status: destination === 'new-project' ? 'cancelled' : 'completed',
      })
      expect(router.currentRoute.value.params.projectId).toBe(result.projectId)
      expect(selection.selectedTrackId).toBe(destination === 'new-tracks' ? importedTrackId : null)
      expect(actionFixture.failures).toEqual([])
    },
  )

  it('settles native file cancellation without importing and lets the other import intent retry', async () => {
    const projectId = parseProjectId('midi-chooser-cancel')
    const fixture = createFixture(
      async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId),
    )
    const { wrapper, actionFixture } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
    const chooser = vi.spyOn(input.element, 'click').mockImplementation(() => {})
    const first = actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECT_IMPORT_MIDI, 'menu')
    if (first.status !== 'accepted') throw new Error('Expected file chooser')
    await input.trigger('cancel')
    await expect(first.completion).resolves.toEqual({ status: 'not-applied' })
    const retry = actionFixture.runtime.actions.invoke(
      STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS,
      'toolbar',
    )
    if (retry.status !== 'accepted') throw new Error('Expected chooser retry')
    expect(chooser).toHaveBeenCalledTimes(2)
    await input.trigger('cancel')
    await expect(retry.completion).resolves.toEqual({ status: 'not-applied' })
    expect(fixture.importLocalFileAsNewTracks).not.toHaveBeenCalled()
    expect(fixture.importLocalFileReplacingActiveProject).not.toHaveBeenCalled()
    expect(useUiToastStore().message).toBeNull()
  })

  it.each(['selecting', 'importing'] as const)(
    'settles %s on unmount and ignores late MIDI feedback',
    async (phase) => {
      const projectId = parseProjectId(`midi-release-${phase}`)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId),
      )
      const { wrapper, actionFixture } = await mountPage(fixture, projectId)
      const pending = createDeferredActionResult<ProjectMidiTrackImportResult>()
      fixture.importLocalFileAsNewTracks.mockReturnValue(pending.promise)
      await flushPromises()
      const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
      vi.spyOn(input.element, 'click').mockImplementation(() => {})
      const invocation = actionFixture.runtime.actions.invoke(
        STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS,
        'toolbar',
      )
      if (invocation.status !== 'accepted') throw new Error('Expected pending import')
      if (phase === 'importing') selectMidiFile(input.element)
      wrapper.unmount()
      await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
      if (phase === 'importing') pending.reject(new Error('Late decoder rejection'))
      else selectMidiFile(input.element)
      await flushPromises()
      expect(fixture.importLocalFileAsNewTracks).toHaveBeenCalledTimes(
        phase === 'importing' ? 1 : 0,
      )
      expect(actionFixture.failures).toEqual([])
      expect(useUiToastStore().message).toBeNull()
    },
  )

  it.each(['selecting', 'importing'] as const)(
    'invalidates a %s track import when its Session is replaced',
    async (phase) => {
      const projectId = parseProjectId('midi-replaced-session')
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId),
      )
      const { wrapper, actionFixture } = await mountPage(fixture, projectId)
      const pending = createDeferredActionResult<ProjectMidiTrackImportResult>()
      fixture.importLocalFileAsNewTracks.mockReturnValue(pending.promise)
      await flushPromises()
      const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
      vi.spyOn(input.element, 'click').mockImplementation(() => {})
      const invocation = actionFixture.runtime.actions.invoke(
        STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS,
        'menu',
      )
      if (invocation.status !== 'accepted') throw new Error('Expected pending chooser')
      if (phase === 'importing') selectMidiFile(input.element)
      fixture.state.value = createReadyState(projectId)
      await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
      if (phase === 'importing') pending.reject(new Error('Retired decoder failed'))
      else selectMidiFile(input.element)
      await flushPromises()
      expect(fixture.importLocalFileAsNewTracks).toHaveBeenCalledTimes(
        phase === 'importing' ? 1 : 0,
      )
      expect(useUiToastStore().message).toBeNull()
      expect(actionFixture.failures).toEqual([])
      expect(
        actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS),
      ).toMatchObject({ enabled: true, busy: false })
    },
  )

  it('contains navigation errors, clears busy state and keeps the Project intact', async () => {
    const projectId = parseProjectId('projects-navigation-failure')
    const ready = { ...createReadyState(projectId), isDirty: true }
    const fixture = createFixture(
      async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      ready,
    )
    const { wrapper, router, actionFixture, keyboardBindingRegistry } = await mountPage(
      fixture,
      projectId,
    )
    await flushPromises()
    const failure = new Error('Navigation failed')
    vi.spyOn(router, 'push').mockRejectedValueOnce(failure)
    const invocation = actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECTS_SHOW, 'menu')
    if (invocation.status !== 'accepted') throw new Error('Expected navigation invocation')
    await expect(invocation.completion).resolves.toEqual({
      status: 'failed',
      cause: failure,
      reported: true,
    })
    expect(fixture.state.value).toBe(ready)
    expect(router.currentRoute.value.params.projectId).toBe(projectId)
    expect(
      actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECTS_SHOW),
    ).toMatchObject({ enabled: true, busy: false })
    expect(actionFixture.failures).toMatchObject([
      { actionId: STUDIO_ACTION.PROJECTS_SHOW, cause: failure },
    ])
    expect(keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented).toBe(true)
    await flushPromises()
    expect(fixture.save).toHaveBeenCalledOnce()
    expect(wrapper.get('.project-workbench__save').attributes('disabled')).toBeUndefined()
  })

  it.each(['chooser', 'decoder'] as const)(
    'reports one %s failure and restores MIDI availability',
    async (failurePhase) => {
      const projectId = parseProjectId(`midi-failure-${failurePhase}`)
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        createReadyState(projectId),
      )
      const { wrapper, actionFixture } = await mountPage(fixture, projectId)
      const failure = new Error('MIDI operation failed')
      fixture.importLocalFileAsNewTracks.mockRejectedValue(failure)
      await flushPromises()
      const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')
      vi.spyOn(input.element, 'click').mockImplementation(() => {
        if (failurePhase === 'chooser') throw failure
      })
      const invocation = actionFixture.runtime.actions.invoke(
        STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS,
        'toolbar',
      )
      if (invocation.status !== 'accepted') throw new Error('Expected accepted MIDI operation')
      if (failurePhase === 'decoder') selectMidiFile(input.element)
      await expect(invocation.completion).resolves.toEqual({
        status: 'failed',
        cause: failure,
        reported: true,
      })
      expect(
        actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS),
      ).toMatchObject({ enabled: true, busy: false })
      expect(actionFixture.failures).toHaveLength(failurePhase === 'chooser' ? 1 : 0)
      expect(useUiToastStore().message?.title ?? null).toBe(
        failurePhase === 'decoder' ? 'MIDI could not be imported' : null,
      )
      expect(useUiToastStore().message?.description ?? null).toBe(
        failurePhase === 'decoder' ? failure.message : null,
      )
    },
  )

  it.each(['menu', 'toolbar', 'keyboard'] as const)(
    'shares Save capability, busy state and retry through %s',
    async (source) => {
      const projectId = parseProjectId(`save-action-${source}`)
      const ready = Object.freeze({ ...createReadyState(projectId), isDirty: true })
      const fixture = createFixture(
        async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
        ready,
      )
      const pending = createDeferredActionResult<void>()
      fixture.save.mockImplementationOnce(async () => {
        fixture.state.value = Object.freeze({
          ...ready,
          saveStatus: ACTIVE_PROJECT_SAVE_STATUS.SAVING,
        })
        try {
          await pending.promise
        } catch (cause) {
          fixture.state.value = Object.freeze({
            ...ready,
            saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
            saveFailure: cause,
          })
          throw cause
        }
      })
      const { wrapper, actionFixture, keyboardBindingRegistry, invoke } = await mountPage(
        fixture,
        projectId,
      )
      await flushPromises()
      let inputWasPrevented = false
      let menuShowsShortcut = false
      if (source === 'menu') {
        await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
        await flushPromises()
        const saveItem = [
          ...document.body.querySelectorAll<HTMLElement>('.project-workbench__menu-item'),
        ].find((item) => item.textContent?.includes('Save'))
        if (saveItem === undefined) throw new Error('Expected Save menu item')
        menuShowsShortcut = saveItem.textContent?.includes('display:Mod+S') ?? false
        // An open Reka menu owns keyboard input, while its explicit Save item remains usable.
        inputWasPrevented = keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented
        saveItem.click()
      } else if (source === 'toolbar') {
        await wrapper.get('.project-workbench__save').trigger('click')
      } else {
        inputWasPrevented = keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented
      }
      await flushPromises()
      expect(inputWasPrevented).toBe(source === 'keyboard')
      expect(menuShowsShortcut).toBe(source === 'menu')
      expect(invoke).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PROJECT_SAVE, source)
      expect(fixture.save).toHaveBeenCalledOnce()
      expect(actionFixture.runtime.workbenchTarget.current).not.toBeNull()
      expect(
        actionFixture.runtime.actions.presentationFor(STUDIO_ACTION.PROJECT_SAVE),
      ).toMatchObject({ busy: true })
      expect(
        wrapper.getComponent(ProjectWorkbenchShell).props('actionControls').save,
      ).toMatchObject({
        busy: true,
        enabled: false,
        label: 'Saving…',
      })
      expect(wrapper.get('.project-workbench__save').attributes('disabled')).toBeDefined()
      expect(keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented).toBe(false)
      expect(fixture.save).toHaveBeenCalledOnce()

      pending.reject(new Error('Checkpoint write failed'))
      await flushPromises()
      expect(wrapper.get('.project-workbench__save').text()).toContain('Retry save')
      expect(
        wrapper.getComponent(ProjectWorkbenchShell).props('actionControls').save,
      ).toMatchObject({
        busy: false,
        enabled: true,
        label: 'Retry save',
      })
      expect(actionFixture.failures).toEqual([])
      fixture.save.mockImplementationOnce(async () => {
        fixture.state.value = Object.freeze({ ...ready, isDirty: false })
      })
      await wrapper.get('.project-workbench__save').trigger('click')
      await flushPromises()
      expect(fixture.save).toHaveBeenCalledTimes(2)
      expect(wrapper.get('.project-workbench__save-status').text()).toBe('Saved')
      expect(wrapper.get('.project-workbench__save').attributes('disabled')).toBeDefined()
      expect(keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented).toBe(false)
      wrapper.unmount()
    },
  )

  it('keeps an unbound Save callable from the menu and settles it when the project target leaves', async () => {
    const projectId = parseProjectId('save-unbound')
    const ready = Object.freeze({ ...createReadyState(projectId), isDirty: true })
    const fixture = createFixture(
      async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      ready,
    )
    const pending = createDeferredActionResult<void>()
    fixture.save.mockReturnValueOnce(pending.promise)
    const { wrapper, actionFixture, keyboardBindingRegistry } = await mountPage(
      fixture,
      projectId,
      {
        keymap: createStudioKeyboardKeymap({ [STUDIO_ACTION.PROJECT_SAVE]: [] }),
      },
    )
    await flushPromises()
    expect(keyboardBindingRegistry.listeners.has('Mod+S')).toBe(false)
    expect(wrapper.getComponent(ProjectWorkbenchShell).props('actionControls').save.shortcut).toBe(
      '',
    )
    const invocation = actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECT_SAVE, 'menu')
    if (invocation.status !== 'accepted') throw new Error('Expected unbound Save')
    fixture.state.value = Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE })
    await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
    expect(actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECT_SAVE, 'menu').status).toBe(
      'unavailable',
    )
    pending.resolve()
    await flushPromises()
    expect(fixture.save).toHaveBeenCalledOnce()
    expect(actionFixture.failures).toEqual([])
    wrapper.unmount()
  })

  it('cancels a pending Save and releases input exactly once when the Action runtime closes before its view', async () => {
    const projectId = parseProjectId('save-runtime-disposal')
    const ready = Object.freeze({ ...createReadyState(projectId), isDirty: true })
    const fixture = createFixture(
      async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      ready,
    )
    const pending = createDeferredActionResult<void>()
    fixture.save.mockReturnValueOnce(pending.promise)
    const { wrapper, actionFixture, keyboardBindingRegistry } = await mountPage(fixture, projectId)
    await flushPromises()
    const before = ready.session.getSnapshot()
    const binding = actionFixture.runtime.workbenchTarget.current
    const releaseMenu = actionFixture.runtime.keyboard.suspend()
    const invocation = actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECT_SAVE, 'menu')
    if (invocation.status !== 'accepted') throw new Error('Expected pending Save')
    expect(fixture.save).toHaveBeenCalledOnce()

    actionFixture.runtime.dispose()
    actionFixture.runtime.dispose()
    releaseMenu()
    wrapper.unmount()

    await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
    expect(binding?.isCurrent()).toBe(false)
    expect(actionFixture.runtime.workbenchTarget.current).toBeNull()
    expect(actionFixture.runtime.selectionTarget.current).toBeNull()
    expect(keyboardBindingRegistry.listeners.size).toBe(0)
    expect(keyboardBindingRegistry.disposalCountByBinding.size).toBe(
      keyboardBindingRegistry.registrationCountByBinding.size,
    )
    expect(
      [...keyboardBindingRegistry.disposalCountByBinding.values()].every((count) => count === 1),
    ).toBe(true)
    expect(actionFixture.runtime.actions.invoke(STUDIO_ACTION.PROJECT_SAVE, 'toolbar').status).toBe(
      'unavailable',
    )

    pending.reject(new Error('Save failed after application disposal'))
    await flushPromises()
    expect(actionFixture.failures).toEqual([])
    expect(ready.session.getSnapshot()).toEqual(before)
    expect(fixture.state.value).toBe(ready)
  })

  it('keeps Workbench Save usable when an editor focus query fails', async () => {
    const projectId = parseProjectId('save-editor-failure')
    const ready = Object.freeze({ ...createReadyState(projectId), isDirty: true })
    const fixture = createFixture(
      async () => ({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      ready,
    )
    const { wrapper, actionFixture, keyboardBindingRegistry } = await mountPage(fixture, projectId)
    await flushPromises()
    actionFixture.runtime.selectionTarget.bind({
      isFocused: () => {
        throw new Error('Editor focus query failed')
      },
      hasSelection: () => true,
      selectionLabel: () => 'Notes',
      deleteSelection: () => STUDIO_ACTION_NOT_APPLIED,
      clearSelection: () => STUDIO_ACTION_NOT_APPLIED,
    })
    expect(keyboardBindingRegistry.dispatch('Delete').defaultPrevented).toBe(true)
    expect(actionFixture.failures).toHaveLength(1)
    expect(keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented).toBe(true)
    await flushPromises()
    expect(fixture.save).toHaveBeenCalledOnce()
    expect(actionFixture.failures).toHaveLength(1)
    wrapper.unmount()
  })

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

  it('preserves hidden Tempo precision until the user enters a visibly different value', async () => {
    const projectId = parseProjectId('project-workspace-page-tempo-edit')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Tempo Editing Project',
      tempoEventId: parseTempoEventId('project-workspace-page-tempo-edit-event'),
      timeSignatureEventId: parseTimeSignatureEventId('project-workspace-page-tempo-edit-meter'),
    })
    const tempoEvent = session.getSnapshot().tempoEvents[0]!
    session.execute(
      createReplaceTempoEventBpmCommand({
        baseRevision: session.modelRevision,
        bpm: parseTempoBpm(143.999_884_800_092_16),
        tempoEventId: tempoEvent.id,
      }),
    )
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { playbackState, projectPlayback, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Project tempo (BPM)"]')

    expect(input.element.value).toBe('144')
    const preciseRevision = session.modelRevision
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'Enter' })
    expect(session.modelRevision).toBe(preciseRevision)
    expect(session.getSnapshot().tempoEvents[0]?.bpm).toBe(143.999_884_800_092_16)

    playbackState.value = Object.freeze({
      ...STOPPED_PLAYBACK_STATE,
      modelRevision: session.modelRevision,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      planStatus: 'playable',
      projectId,
    })
    vi.mocked(projectPlayback.pause).mockImplementation(() => {
      playbackState.value = Object.freeze({
        ...playbackState.value,
        phase: PROJECT_PLAYBACK_PHASE.PAUSED,
      })
      return true
    })
    await nextTick()

    await input.trigger('focus')
    await input.setValue('121.25')
    await input.trigger('keydown', { key: 'Enter' })

    expect(projectPlayback.pause).toHaveBeenCalledOnce()
    expect(playbackState.value.phase).toBe(PROJECT_PLAYBACK_PHASE.PAUSED)
    expect(session.getSnapshot().tempoEvents[0]?.bpm).toBe(121.25)
    expect(session.modelRevision).toBe(preciseRevision + 1)
  })

  it('rejects Tempo input outside the two-decimal editing surface', async () => {
    const projectId = parseProjectId('project-workspace-page-tempo-invalid')
    const session = createTestSession(projectId)
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Project tempo (BPM)"]')
    const revision = session.modelRevision

    await input.trigger('focus')
    await input.setValue('120.125')
    await input.trigger('keydown', { key: 'Enter' })

    expect(session.modelRevision).toBe(revision)
    expect(useUiToastStore().message).toMatchObject({
      description: 'Tempo supports at most two decimal places.',
      title: 'Tempo was not changed',
      tone: 'warning',
    })
  })

  it('shows the current Playhead Tempo for multi-Tempo projects without allowing edits', async () => {
    const document: MidiFileDocument = {
      format: 1,
      sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
      name: 'Tempo Map Project',
      ppq: 960,
      tempos: [
        { tick: 0, bpm: 120 },
        { tick: 960, bpm: 90.25 },
      ],
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      keySignatures: [],
      textEvents: [],
      tracks: [],
    }
    const imported = createProjectMidiImportDraft({
      document,
      createId: ({ kind, ordinal }) => `tempo-map-${kind}-${ordinal}`,
      createInstrumentDevice: ({ id }) => ({
        device: createStudioGrandDeviceDescriptor(id),
        mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
      }),
      createTrackColor: () => null,
    })
    const session = imported.session
    const projectId = session.getSnapshot().project.id
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { playbackVisualPosition, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('input[aria-label="Current Tempo Map value (BPM)"]')

    expect(input.attributes('readonly')).toBeDefined()
    expect(input.element.value).toBe('120')
    expect(wrapper.text()).toContain('MAP')

    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionTick: 960 as ProjectPlaybackVisualPosition['positionTick'],
      projectId: parseProjectId('stale-tempo-map-project'),
    })
    await nextTick()
    expect(input.element.value).toBe('120')

    playbackVisualPosition.value = Object.freeze({
      ...playbackVisualPosition.value,
      positionTick: 960 as ProjectPlaybackVisualPosition['positionTick'],
      projectId,
    })
    await nextTick()
    expect(input.element.value).toBe('90.25')
  })

  it('coordinates Tempo Track add, move, numeric BPM edit, selection, and removal', async () => {
    const projectId = parseProjectId('project-workspace-page-tempo-track')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Tempo Track Project',
      tempoEventId: parseTempoEventId('tempo-track-project-initial'),
      timeSignatureEventId: parseTimeSignatureEventId('tempo-track-project-meter'),
    })
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { playbackState, projectPlayback, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const shell = wrapper.getComponent(ProjectWorkbenchShell)

    await wrapper.get('.tempo-track-lane__point').trigger('click')
    expect(
      wrapper.get<HTMLInputElement>('input[aria-label="Selected Tempo Event BPM"]').element.value,
    ).toBe('120')

    playbackState.value = Object.freeze({
      ...STOPPED_PLAYBACK_STATE,
      modelRevision: session.modelRevision,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      planStatus: 'playable',
      projectId,
    })
    vi.mocked(projectPlayback.pause).mockImplementation(() => {
      playbackState.value = Object.freeze({
        ...playbackState.value,
        phase: PROJECT_PLAYBACK_PHASE.PAUSED,
      })
      return true
    })
    await nextTick()

    shell.vm.$emit('tempoEventAdd', parseTempoBpm(96), parseTick(960))
    await nextTick()
    expect(projectPlayback.pause).toHaveBeenCalledOnce()
    expect(session.getSnapshot().tempoEvents).toContainEqual({
      bpm: 96,
      id: 'workspace-page-tempo-event-1',
      tick: 960,
    })

    fixture.state.value = createReadyState(projectId, session)
    await nextTick()
    expect(shell.props('selectedTempoEventId')).toBe('workspace-page-tempo-event-1')

    const addedTempoEventId = parseTempoEventId('workspace-page-tempo-event-1')
    shell.vm.$emit('tempoEventMove', addedTempoEventId, parseTick(1_920))
    shell.vm.$emit('tempoEventBpmCommit', addedTempoEventId, '101.25')
    expect(session.getSnapshot().tempoEvents).toContainEqual({
      bpm: 101.25,
      id: addedTempoEventId,
      tick: 1_920,
    })

    shell.vm.$emit('tempoEventRemove', addedTempoEventId)
    await nextTick()
    expect(session.getSnapshot().tempoEvents).toHaveLength(1)
    expect(shell.props('selectedTempoEventId')).toBeNull()
  })

  it('surfaces Tempo Track Tick collisions without changing Project history', async () => {
    const projectId = parseProjectId('project-workspace-page-tempo-track-collision')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Tempo Track Collision Project',
      tempoEventId: parseTempoEventId('tempo-track-collision-initial'),
      timeSignatureEventId: parseTimeSignatureEventId('tempo-track-collision-meter'),
    })
    const fixture = createFixture(
      async () => Object.freeze({ kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE, projectId }),
      createReadyState(projectId, session),
    )
    const { wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const revision = session.modelRevision

    wrapper
      .getComponent(ProjectWorkbenchShell)
      .vm.$emit('tempoEventAdd', parseTempoBpm(90), parseTick(0))
    await nextTick()

    expect(session.modelRevision).toBe(revision)
    expect(useUiToastStore().message).toMatchObject({
      title: 'Tempo Event could not be added',
      tone: 'danger',
    })
  })

  it('extends a long imported MIDI song through eight complete Timeline tail bars', async () => {
    const document: MidiFileDocument = {
      format: 1,
      sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
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
      createInstrumentDevice: ({ id }) => ({
        device: createStudioGrandDeviceDescriptor(id),
        mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
      }),
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
        sourceEnvelope: NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
        semanticBinding: NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
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
        sourceEnvelope: NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
        semanticBinding: NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
        sourcePpq: 480,
        sourceTrackCount: 1,
      }),
    })
    fixture.importLocalFileReplacingActiveProject.mockResolvedValueOnce(importResult)
    const { router, wrapper } = await mountPage(fixture, projectId)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-workspace__midi-file-input')

    wrapper
      .getComponent(ProjectWorkbenchShell)
      .vm.$emit('invokeAction', STUDIO_ACTION.PROJECT_IMPORT_MIDI, 'menu')
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
    wrapper
      .getComponent(ProjectWorkbenchShell)
      .vm.$emit('invokeAction', STUDIO_ACTION.PROJECT_IMPORT_MIDI, 'menu')
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
    expect(keyboardBindingRegistry.dispatch('Mod+S').defaultPrevented).toBe(false)
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
    expect(projectPlayback.play).toHaveBeenCalledOnce()

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
    expect(projectPlayback.play).toHaveBeenCalledOnce()
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

    const play = wrapper.get('button[aria-label="Play"]')
    expect(play.attributes('disabled')).toBeDefined()
    expect(play.attributes('title')).toContain('No audible MIDI notes to play.')
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
