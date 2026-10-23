import {
  createInitialProjectSession,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { computed, defineComponent, nextTick, shallowReadonly, shallowRef } from 'vue'

import { provideTestStudioServices } from '@/__tests__/support/studio-services-test-support'
import {
  provideTempoEditing,
  type TempoEditing,
} from '@/features/project-workspace/tempo-track/tempo-editing'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createTempoEdits } from '@/workbench/edits/tempo-edits'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

const PROJECT_ID = parseProjectId('tempo-editing-project')

function readyState(session: ProjectSession): ReadyActiveProjectState {
  return Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: PROJECT_ID,
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

function setup() {
  const session = createInitialProjectSession({
    projectId: PROJECT_ID,
    projectName: 'Tempo Editing',
    tempoEventId: parseTempoEventId('tempo-editing-initial'),
    timeSignatureEventId: parseTimeSignatureEventId('tempo-editing-meter'),
  })
  const state = shallowRef<ActiveProjectState>(readyState(session))
  const activeProject: ActiveProjectService = {
    get state() {
      return state.value
    },
    create: vi.fn<ActiveProjectService['create']>(),
    createFromSession: vi.fn<ActiveProjectService['createFromSession']>(),
    open: vi.fn<ActiveProjectService['open']>(),
    save: vi.fn<ActiveProjectService['save']>(),
    subscribe: () => () => undefined,
    subscribeCommits: () => () => undefined,
    dispose() {},
  }
  let identity = 0
  const playbackState = shallowRef<ProjectPlaybackState>(
    Object.freeze({
      diagnostics: Object.freeze([]),
      failureCause: null,
      feedback: null,
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      planStatus: 'playable',
      positionProjectSecond: 0,
      projectId: PROJECT_ID,
    }),
  )
  const visualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.STOPPED,
      positionProjectSecond: 0,
      positionTick: 0 as ProjectPlaybackVisualPosition['positionTick'],
      projectId: PROJECT_ID,
    }),
  )
  const pause = vi.fn<ProjectPlaybackCoordinator['pause']>(() => false)
  const projectPlayback: ProjectPlaybackCoordinator = Object.freeze({
    beginTimelineLocate: () => null,
    canReturnToLastStartPosition: () => false,
    get state() {
      return playbackState.value
    },
    locateAtTick: () => false,
    pause,
    play: async () => false,
    readVisualPosition: () => visualPosition.value,
    returnToLastStartPosition: () => false,
    subscribe: () => () => undefined,
    togglePlayPause: () => false,
    dispose() {},
  })
  const pinia = createPinia()
  setActivePinia(pinia)
  let tempo!: TempoEditing
  const host = mount(
    defineComponent({
      setup() {
        tempo = provideTempoEditing(
          computed(() => (state.value.phase === ACTIVE_PROJECT_PHASE.READY ? state.value : null)),
        )
        return () => null
      },
    }),
    {
      global: {
        plugins: [pinia],
        provide: provideTestStudioServices({
          edits: {
            tempo: createTempoEdits({
              activeProject,
              createId: () => `tempo-editing-event-${++identity}`,
            }),
          },
          playback: {
            projectPlayback,
            state: shallowReadonly(playbackState),
            visualPosition: shallowReadonly(visualPosition),
          },
          project: { activeProject, state: shallowReadonly(state) },
        }),
      },
    },
  )
  onTestFinished(() => host.unmount())
  return {
    tempo,
    session,
    pause,
    playbackState,
    toasts: useUiToastStore(pinia),
    /** Republishes the active state, as the Vue binding does after each commit. */
    async publish() {
      state.value = readyState(session)
      await nextTick()
    },
  }
}

describe('Tempo editing', () => {
  it('pauses playback for each edit and keeps the selection on events that exist', async () => {
    const { tempo, session, pause, playbackState, publish } = setup()
    playbackState.value = Object.freeze({
      ...playbackState.value,
      modelRevision: session.modelRevision,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
    })
    pause.mockImplementation(() => {
      playbackState.value = Object.freeze({
        ...playbackState.value,
        phase: PROJECT_PLAYBACK_PHASE.PAUSED,
      })
      return true
    })

    tempo.add(parseTempoBpm(96), parseTick(960))
    expect(pause).toHaveBeenCalledOnce()
    const added = parseTempoEventId('tempo-editing-event-1')
    expect(session.getSnapshot().tempoEvents).toContainEqual({ bpm: 96, id: added, tick: 960 })
    await publish()
    expect(tempo.selectedEventId.value).toBe(added)

    tempo.move(added, parseTick(1_920))
    tempo.commitBpmInput(added, '101.25')
    expect(session.getSnapshot().tempoEvents).toContainEqual({
      bpm: 101.25,
      id: added,
      tick: 1_920,
    })

    expect(tempo.remove(added)).toEqual({ status: 'completed' })
    await publish()
    expect(session.getSnapshot().tempoEvents).toHaveLength(1)
    expect(tempo.selectedEventId.value).toBeNull()
  })

  it('reports a rejected edit without changing Project history', () => {
    const { tempo, session, toasts } = setup()
    const revision = session.modelRevision

    tempo.add(parseTempoBpm(90), parseTick(0))

    expect(session.modelRevision).toBe(revision)
    expect(toasts.message).toMatchObject({
      title: 'Tempo Event could not be added',
      tone: 'danger',
    })
  })
})
