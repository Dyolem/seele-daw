import {
  createPlaybackEngine,
  type PlaybackEngine,
  type PlaybackEngineState,
  type PlaybackLocateSession,
  type PlaybackRuntimePort,
  type PlaybackTimerPort,
} from '@seele-daw/playback'
import {
  reportListenerError,
  type ProjectId,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import { ProjectPlaybackError } from '@/workbench/project/playback/project-playback-error'
import { describePlaybackFeedback } from '@/workbench/project/playback/project-playback-feedback'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
  type ProjectPlaybackStateListener,
  type ProjectPlaybackUnsubscribe,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

export interface ProjectPlaybackCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state' | 'subscribe' | 'subscribeCommits'>
  readonly runtime: PlaybackRuntimePort
  readonly timer: PlaybackTimerPort
}

export interface ProjectPlaybackCoordinator {
  readonly state: ProjectPlaybackState
  beginTimelineLocate(): PlaybackLocateSession | null
  canReturnToLastStartPosition(): boolean
  locateAtTick(tick: Tick): boolean
  pause(): boolean
  play(): Promise<boolean>
  readVisualPosition(): ProjectPlaybackVisualPosition
  returnToLastStartPosition(): boolean
  subscribe(listener: ProjectPlaybackStateListener): ProjectPlaybackUnsubscribe
  togglePlayPause(): boolean
  dispose(): void
}

interface PlayedProject {
  readonly projectId: ProjectId
  readonly session: ProjectSession
}

const NO_DIAGNOSTICS = Object.freeze([])

const UNAVAILABLE_STATE = Object.freeze<ProjectPlaybackState>({
  diagnostics: NO_DIAGNOSTICS,
  failureCause: null,
  feedback: null,
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.UNAVAILABLE,
  planStatus: null,
  positionProjectSecond: 0,
  projectId: null,
})

function projectPlaybackState(
  engine: PlaybackEngineState,
  projectId: ProjectId,
): ProjectPlaybackState {
  if (engine.phase === PROJECT_PLAYBACK_PHASE.UNAVAILABLE) return UNAVAILABLE_STATE
  return Object.freeze({
    diagnostics: engine.plan?.diagnostics ?? NO_DIAGNOSTICS,
    // Outside a failure, the instruments that could not load explain the tracks that are silent.
    failureCause:
      engine.phase === PROJECT_PLAYBACK_PHASE.FAILED
        ? engine.failureCause
        : engine.preparationFailures.length > 0
          ? engine.preparationFailures
          : null,
    feedback: describePlaybackFeedback(engine),
    modelRevision: engine.modelRevision,
    phase: engine.phase,
    planStatus: engine.plan?.status ?? null,
    positionProjectSecond: engine.positionProjectSecond,
    projectId,
  })
}

/**
 * Plays the active Project: loads each ready Project into the playback engine, forwards its
 * commits, and publishes the engine's state with the Project's identity and user-facing feedback.
 */
class ProjectPlaybackCoordinatorImpl implements ProjectPlaybackCoordinator {
  readonly #engine: PlaybackEngine
  readonly #listeners = new Set<ProjectPlaybackStateListener>()
  readonly #unsubscribeState: ProjectPlaybackUnsubscribe
  readonly #unsubscribeCommits: ProjectPlaybackUnsubscribe
  #project: PlayedProject | null = null
  #state: ProjectPlaybackState = UNAVAILABLE_STATE
  #disposed = false

  constructor(dependencies: ProjectPlaybackCoordinatorDependencies) {
    this.#engine = createPlaybackEngine({
      runtime: dependencies.runtime,
      timer: dependencies.timer,
      onStateChange: (state) => this.#publish(state),
    })
    this.#follow(dependencies.activeProject.state)
    // Playback that cannot follow the Project must stop where the user hears it, not just log.
    this.#unsubscribeState = dependencies.activeProject.subscribe((state) => {
      try {
        this.#follow(state)
      } catch (cause) {
        this.#engine.fail(cause)
      }
    })
    this.#unsubscribeCommits = dependencies.activeProject.subscribeCommits(
      ({ commit, projectId, session }) => {
        const project = this.#project
        if (this.#disposed || project?.projectId !== projectId || project.session !== session) {
          return
        }
        try {
          this.#engine.commit(commit, () => session.getSnapshot())
        } catch (cause) {
          this.#engine.fail(cause)
        }
      },
    )
  }

  get state(): ProjectPlaybackState {
    return this.#state
  }

  readVisualPosition(): ProjectPlaybackVisualPosition {
    this.#assertLive()
    const position = this.#engine.readVisualPosition()
    return Object.freeze({ ...position, projectId: this.#state.projectId })
  }

  beginTimelineLocate(): PlaybackLocateSession | null {
    this.#assertLive()
    return this.#engine.beginTimelineLocate()
  }

  locateAtTick(tick: Tick): boolean {
    this.#assertLive()
    return this.#engine.locateAtTick(tick)
  }

  canReturnToLastStartPosition(): boolean {
    this.#assertLive()
    return this.#engine.canReturnToLastStartPosition()
  }

  play(): Promise<boolean> {
    this.#assertLive()
    return this.#engine.play()
  }

  pause(): boolean {
    this.#assertLive()
    return this.#engine.pause()
  }

  returnToLastStartPosition(): boolean {
    this.#assertLive()
    return this.#engine.returnToLastStartPosition()
  }

  togglePlayPause(): boolean {
    this.#assertLive()
    return this.#engine.togglePlayPause()
  }

  subscribe(listener: ProjectPlaybackStateListener): ProjectPlaybackUnsubscribe {
    this.#assertLive()
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsubscribeState()
    this.#unsubscribeCommits()
    this.#engine.dispose()
    this.#project = null
    this.#state = UNAVAILABLE_STATE
    this.#listeners.clear()
  }

  #assertLive(): void {
    if (this.#disposed) {
      throw new ProjectPlaybackError('coordinator-disposed', 'Project Playback is disposed')
    }
  }

  #follow(state: ActiveProjectState): void {
    if (this.#disposed) return
    if (state.phase !== ACTIVE_PROJECT_PHASE.READY) {
      this.#project = null
      this.#engine.unload()
      return
    }
    const current = this.#project
    // The service publishes the matching ready state before forwarding its commit; the commit
    // reconciles the new revision, so a state update for the same session changes nothing here.
    if (current?.projectId === state.projectId && current.session === state.session) return
    this.#project = Object.freeze({ projectId: state.projectId, session: state.session })
    this.#engine.load(state.session.getSnapshot())
  }

  #publish(engine: PlaybackEngineState): void {
    const projectId = this.#project?.projectId
    const state =
      projectId === undefined ? UNAVAILABLE_STATE : projectPlaybackState(engine, projectId)
    this.#state = state
    for (const listener of this.#listeners) {
      try {
        listener(state)
      } catch (cause) {
        reportListenerError(cause)
      }
    }
  }
}

/** Creates the single framework-neutral playback coordinator for the Studio application graph. */
export function createProjectPlaybackCoordinator(
  dependencies: ProjectPlaybackCoordinatorDependencies,
): ProjectPlaybackCoordinator {
  return new ProjectPlaybackCoordinatorImpl(dependencies)
}
