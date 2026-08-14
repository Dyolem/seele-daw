import type { AudibleMidiTransportSnapshot } from '@seele-daw/playback'
import type { ModelRevision, ProjectId } from '@seele-daw/project-core'

import type { ProjectPlaybackPhase } from '@/workbench/project/playback/project-playback-state'

export type ProjectPlaybackVisualFrameHandle = number | object

export interface ProjectPlaybackVisualFramePort {
  cancel(handle: ProjectPlaybackVisualFrameHandle): void
  request(callback: () => void): ProjectPlaybackVisualFrameHandle
}

/** Ephemeral Transport position sampled by visual consumers without becoming a Project fact. */
export interface ProjectPlaybackVisualPosition {
  readonly modelRevision: ModelRevision | null
  readonly phase: ProjectPlaybackPhase
  readonly positionProjectSecond: number
  readonly positionTick: AudibleMidiTransportSnapshot['positionTick']
  readonly projectId: ProjectId | null
}
