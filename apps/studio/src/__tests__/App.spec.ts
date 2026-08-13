import {
  parseClipId,
  parseProjectId,
  parseTrackId,
  type ProjectCommit,
  type ProjectId,
} from '@seele-daw/project-core'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { shallowReadonly, shallowRef } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import { createStudioRouter } from '@/router'
import { createProjectWorkspaceLocation, PROJECT_ROUTE_NAME } from '@/router/project-routes'
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
} from '@/workbench/project/active-project-state'
import type { ProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import {
  PROJECT_CLIP_CONTEXT_KEY,
  type ProjectClipVueContext,
} from '@/workbench/project/clip/vue/project-clip-context'
import {
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinator,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import {
  PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
  type ProjectNavigationDecisionVueContext,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import {
  PROJECT_PLAYBACK_CONTEXT_KEY,
  type ProjectPlaybackVueContext,
} from '@/workbench/project/playback/vue/project-playback-context'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'
import {
  ACTIVE_PROJECT_CONTEXT_KEY,
  type ActiveProjectVueContext,
} from '@/workbench/project/vue/active-project-context'

function createActiveProjectContext(state: ActiveProjectState): ActiveProjectVueContext {
  const stateRef = shallowRef(state)
  const activeProject: ActiveProjectService = {
    get state() {
      return stateRef.value
    },
    create: async () => parseProjectId('app-created-project'),
    open: async () => undefined,
    save: async () => undefined,
    subscribe: () => () => undefined,
    dispose() {},
  }

  return Object.freeze({ activeProject, state: shallowReadonly(stateRef) })
}

function createProjectEntryContext(readyProjectId: ProjectId | null): ProjectEntryVueContext {
  return Object.freeze({
    projectEntry: Object.freeze({
      resolve: vi.fn<ProjectEntryCoordinator['resolve']>(async (requestedProjectId) => {
        if (requestedProjectId !== null && requestedProjectId === readyProjectId) {
          return Object.freeze({
            kind: PROJECT_ENTRY_RESOLUTION_KIND.ACTIVE,
            projectId: requestedProjectId,
          })
        }

        return Object.freeze({
          kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
          reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
          requestedProjectId: null,
          recentProjects: Object.freeze([]),
        })
      }),
    }),
  })
}

function createProjectNavigationDecisionContext(): ProjectNavigationDecisionVueContext {
  const pendingDecision = shallowRef(null)

  return Object.freeze({
    pendingDecision: shallowReadonly(pendingDecision),
    resolve: () => false,
  })
}

function createProjectTrackContext(): ProjectTrackVueContext {
  return Object.freeze({
    projectTracks: Object.freeze({
      addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(() =>
        Object.freeze({
          commit: Object.freeze({}) as ProjectCommit,
          trackId: parseTrackId('app-created-track'),
        }),
      ),
      useStudioGrand: vi.fn<ProjectTrackCoordinator['useStudioGrand']>(),
    }),
  })
}

function createProjectClipContext(): ProjectClipVueContext {
  return Object.freeze({
    projectClips: Object.freeze({
      addEmptyMidiClip: vi.fn<ProjectClipCoordinator['addEmptyMidiClip']>((input) =>
        Object.freeze({
          clipId: parseClipId('app-created-clip'),
          commit: Object.freeze({}) as ProjectCommit,
          trackId: input.trackId,
        }),
      ),
    }),
  })
}

function createKeyboardShortcutContext(): StudioKeyboardShortcutVueContext {
  return Object.freeze({
    keyboardShortcuts: createStudioKeyboardShortcutCoordinator({
      bindingRegistry: new TestStudioKeyboardBindingRegistry(),
      keymap: STUDIO_DEFAULT_KEYMAP,
    }),
  })
}

function createProjectPlaybackContext(): ProjectPlaybackVueContext {
  const state = shallowRef<ProjectPlaybackState>(
    Object.freeze({
      diagnostics: Object.freeze([]),
      failureCause: null,
      feedback: Object.freeze({ kind: 'info', message: 'No audible MIDI notes to play.' }),
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      planStatus: 'empty',
      positionProjectSecond: 0,
      projectId: null,
    }),
  )
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    get state() {
      return state.value
    },
    pause: () => false,
    play: async () => false,
    returnToStart: () => false,
    subscribe: () => () => undefined,
    togglePlayPause: () => false,
    dispose() {},
  })
  return Object.freeze({ projectPlayback, state: shallowReadonly(state) })
}

async function mountApp(state: ActiveProjectState, projectId: ProjectId | null = null) {
  const router = createStudioRouter(createMemoryHistory())
  await router.push(
    projectId === null
      ? { name: PROJECT_ROUTE_NAME.ENTRY }
      : createProjectWorkspaceLocation(projectId),
  )
  await router.isReady()

  const wrapper = mount(App, {
    global: {
      plugins: [createPinia(), router],
      provide: {
        [ACTIVE_PROJECT_CONTEXT_KEY as symbol]: createActiveProjectContext(state),
        [PROJECT_CLIP_CONTEXT_KEY as symbol]: createProjectClipContext(),
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: createProjectEntryContext(projectId),
        [PROJECT_NAVIGATION_DECISION_CONTEXT_KEY as symbol]:
          createProjectNavigationDecisionContext(),
        [PROJECT_PLAYBACK_CONTEXT_KEY as symbol]: createProjectPlaybackContext(),
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: createProjectTrackContext(),
        [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: createKeyboardShortcutContext(),
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('App', () => {
  it('renders Project Entry while the Entry Route is active', async () => {
    const wrapper = await mountApp(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))

    await vi.waitFor(() => expect(wrapper.text()).toContain('No projects yet'))
    expect(wrapper.text()).toContain('Recent projects')
  })

  it('composes the Workbench Shell for a ready Project Route', async () => {
    const projectId = parseProjectId('app-ready-project')
    const session = createTestSession(projectId)
    const wrapper = await mountApp(
      Object.freeze({
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
      }),
      projectId,
    )

    expect(wrapper.find('.project-workbench').exists()).toBe(true)
    expect(wrapper.text()).toContain(`Test ${projectId}`)
    expect(wrapper.text()).toContain(projectId)
    expect(wrapper.text()).toContain('Select an instrument track before creating a MIDI clip')
    expect(wrapper.find('.project-entry').exists()).toBe(false)
  })
})
