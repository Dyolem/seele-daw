import type { ProjectId, ProjectSession, Tick } from '@seele-daw/project-core'
import { computed, inject, provide, type InjectionKey, type Ref } from 'vue'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/types/piano-roll-presentation'
import type { ProjectWorkbenchActionControls } from '@/features/project-workspace/actions/project-workbench-action-controls'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import {
  useWorkspacePresentation,
  type ProjectPresentation,
} from '@/features/project-workspace/use-workspace-presentation'
import type { ReadyActiveProjectState } from '@/workbench/project/active-project-state'

export type ProjectWorkspaceSession = Pick<ProjectSession, 'modelRevision' | 'query' | 'subscribe'>

/**
 * The open Project as its workbench shows it. The Shell provides it for one ready Project; the
 * views inside read what they need from it instead of receiving it through every layer.
 */
export interface ProjectWorkspace {
  readonly actionControls: Readonly<Ref<ProjectWorkbenchActionControls>>
  readonly clips: Readonly<Ref<readonly ProjectMidiClipPresentation[]>>
  readonly pianoRoll: Readonly<Ref<ProjectPianoRollPresentation | null>>
  readonly pianoRollTrack: Readonly<Ref<ProjectPianoRollTrackPresentation | null>>
  readonly project: Readonly<Ref<ProjectPresentation>>
  readonly projectId: Readonly<Ref<ProjectId>>
  readonly session: Readonly<Ref<ProjectWorkspaceSession>>
  readonly timelineEndTick: Readonly<Ref<Tick>>
  readonly tracks: Readonly<Ref<readonly ProjectTrackPresentation[]>>
}

export const PROJECT_WORKSPACE_KEY: InjectionKey<ProjectWorkspace> = Symbol(
  'seele/studio/ProjectWorkspace',
)

export function provideProjectWorkspace(
  readyProject: Readonly<Ref<ReadyActiveProjectState>>,
  actionControls: Readonly<Ref<ProjectWorkbenchActionControls>>,
): ProjectWorkspace {
  const presentation = useWorkspacePresentation(readyProject)
  const workspace = Object.freeze<ProjectWorkspace>({
    actionControls,
    clips: presentation.clips,
    pianoRoll: presentation.pianoRoll,
    pianoRollTrack: presentation.pianoRollTrack,
    project: presentation.project,
    projectId: computed(() => readyProject.value.projectId),
    session: computed(() => readyProject.value.session),
    timelineEndTick: presentation.timelineEndTick,
    tracks: presentation.tracks,
  })
  provide(PROJECT_WORKSPACE_KEY, workspace)
  return workspace
}

export function useProjectWorkspace(): ProjectWorkspace {
  const workspace = inject(PROJECT_WORKSPACE_KEY, null)
  if (workspace === null) throw new Error('The project workspace has not been provided')
  return workspace
}
