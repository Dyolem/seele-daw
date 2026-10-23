import { markRaw, shallowReadonly, shallowRef, type ShallowRef } from 'vue'

import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type {
  ProjectPlaybackVisualFrameHandle,
  ProjectPlaybackVisualFramePort,
  ProjectPlaybackVisualPosition,
} from '@/workbench/project/playback/project-playback-visual-position'

export interface ProjectPlaybackVueContext {
  readonly projectPlayback: ProjectPlaybackCoordinator
  readonly state: Readonly<ShallowRef<ProjectPlaybackState>>
  readonly visualPosition: Readonly<ShallowRef<ProjectPlaybackVisualPosition>>
}

/**
 * Projects low-frequency playback state into Vue, and samples the Transport position once per
 * visual frame while playing. Runtime resources never enter the reactive graph.
 */
export function createProjectPlaybackVueBinding(
  projectPlaybackInput: ProjectPlaybackCoordinator,
  visualFrame: ProjectPlaybackVisualFramePort,
) {
  const projectPlayback = markRaw(projectPlaybackInput)
  const state = shallowRef(projectPlayback.state)
  const visualPosition = shallowRef(projectPlayback.readVisualPosition())
  let frame: ProjectPlaybackVisualFrameHandle | null = null
  let disposed = false

  function requestFrame(): void {
    if (disposed || frame !== null) return
    if (visualPosition.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING) return
    frame = visualFrame.request(() => {
      frame = null
      if (disposed) return
      visualPosition.value = projectPlayback.readVisualPosition()
      requestFrame()
    })
  }

  function cancelFrame(): void {
    if (frame === null) return
    visualFrame.cancel(frame)
    frame = null
  }

  const unsubscribe = projectPlayback.subscribe({
    onStateChange: (next) => {
      state.value = next
      if (next.phase !== PROJECT_PLAYBACK_PHASE.PLAYING) cancelFrame()
      visualPosition.value = projectPlayback.readVisualPosition()
      requestFrame()
    },
    onError: (failure) => console.error('Project Playback state was not delivered to Vue', failure),
  })
  requestFrame()

  return {
    context: Object.freeze<ProjectPlaybackVueContext>({
      projectPlayback,
      state: shallowReadonly(state),
      visualPosition: shallowReadonly(visualPosition),
    }),
    dispose(): void {
      if (disposed) return
      disposed = true
      cancelFrame()
      unsubscribe()
    },
  }
}
