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
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick, shallowReadonly, shallowRef, type ShallowRef } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import ProjectWorkspacePage from '@/features/project-workspace/ProjectWorkspacePage.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { createStudioRouter } from '@/router'
import {
  createProjectWorkspaceLocation,
  PROJECT_ROUTE_NAME,
  PROJECT_ROUTE_QUERY,
} from '@/router/project-routes'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'
import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import { createStudioKeyboardShortcutCoordinator } from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import {
  STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY,
  type StudioKeyboardShortcutVueContext,
} from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'
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
  readonly resolve: ReturnType<typeof vi.fn<ProjectEntryCoordinator['resolve']>>
  readonly save: ReturnType<typeof vi.fn<ActiveProjectService['save']>>
  readonly projectEntryContext: ProjectEntryVueContext
  readonly state: ShallowRef<ActiveProjectState>
}

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
  const activeProject: ActiveProjectService = {
    get state() {
      return state.value
    },
    create: async () => parseProjectId('workspace-created-project'),
    open: async () => undefined,
    save,
    subscribe: () => () => undefined,
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
    addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(
      () =>
        Object.freeze({
          commit: Object.freeze({}) as ProjectCommit,
          trackId: parseTrackId('workspace-page-created-track'),
        }),
    ),
  })
  const projectClipContext: ProjectClipVueContext = Object.freeze({ projectClips })
  const projectTrackContext: ProjectTrackVueContext = Object.freeze({ projectTracks })
  const keyboardBindingRegistry = new TestStudioKeyboardBindingRegistry()
  const keyboardShortcuts = createStudioKeyboardShortcutCoordinator({
    bindingRegistry: keyboardBindingRegistry,
  })
  const keyboardShortcutContext: StudioKeyboardShortcutVueContext = Object.freeze({
    keyboardShortcuts,
  })
  const wrapper = mount(ProjectWorkspacePage, {
    props: { projectId },
    global: {
      plugins: [pinia, router],
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: fixture.activeProjectContext,
        [PROJECT_CLIP_CONTEXT_KEY as symbol]: projectClipContext,
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: fixture.projectEntryContext,
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: projectTrackContext,
        [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: keyboardShortcutContext,
      },
    },
  })

  return {
    router,
    keyboardBindingRegistry,
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
      timeSignatureEventId: parseTimeSignatureEventId(
        'meter-history-shortcuts',
      ),
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
