import type { ProjectWorkbenchMidiEditor } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  defineStudioAction,
  defineStudioContext,
  type StudioActionCompletion,
  type StudioActionState,
} from '@/workbench/actions/studio-action'
import {
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'

export interface ProjectWorkbenchActionTarget {
  getReadyProject(): ReadyActiveProjectState | null
  save(): Promise<void>
  readonly playback: ProjectPlaybackCoordinator
  getPlaybackState(): ProjectPlaybackState
  canReturnToLastStartPosition(): boolean
  isShowingProjects(): boolean
  showProjects(): Promise<StudioActionCompletion>
  getMidiImportPhase(): 'idle' | 'selecting' | 'importing'
  canChooseMidiFile(): boolean
  importMidi(target: 'new-project' | 'new-tracks'): Promise<StudioActionCompletion>
  getMidiEditor(): ProjectWorkbenchMidiEditor | null
}

export const WORKBENCH_CONTEXT = defineStudioContext<ProjectWorkbenchActionTarget>({
  id: 'workbench',
  label: 'Project workbench',
  priority: 1,
  isActive: (workbench) => workbench.getReadyProject() !== null,
})

/** Workbench actions exist only for a ready Project and expire with its session. */
function forReadyProject(
  resolve: (
    workbench: ProjectWorkbenchActionTarget,
    ready: ReadyActiveProjectState,
  ) => StudioActionState,
) {
  return (workbench: ProjectWorkbenchActionTarget): StudioActionState | null => {
    const ready = workbench.getReadyProject()
    if (ready === null) return null
    return {
      isCurrent: () => workbench.getReadyProject()?.session === ready.session,
      ...resolve(workbench, ready),
    }
  }
}

function playbackCompletion(
  workbench: ProjectWorkbenchActionTarget,
  applied: boolean,
): StudioActionCompletion {
  if (applied) return STUDIO_ACTION_COMPLETED
  const result = workbench.getPlaybackState()
  if (result.phase === PROJECT_PLAYBACK_PHASE.FAILED) {
    return { status: 'failed', cause: result.failureCause, reported: true }
  }
  return STUDIO_ACTION_NOT_APPLIED
}

function importMidi(destination: 'new-project' | 'new-tracks') {
  return forReadyProject((workbench) => {
    const phase = workbench.getMidiImportPhase()
    let label: string | undefined
    let disabledReason: string | null = null
    if (phase === 'selecting') {
      label = 'Choosing MIDI file…'
      disabledReason = 'Finish choosing a MIDI file first.'
    } else if (phase === 'importing') {
      label = 'Importing MIDI…'
      disabledReason = 'A MIDI file is being imported.'
    } else if (!workbench.canChooseMidiFile()) {
      disabledReason = 'The MIDI file chooser is unavailable.'
    }
    return {
      label,
      disabledReason,
      busy: phase !== 'idle',
      execute: () => workbench.importMidi(destination),
    }
  })
}

export const PROJECT_WORKBENCH_ACTIONS = [
  defineStudioAction({
    id: 'project.save',
    context: WORKBENCH_CONTEXT,
    label: 'Save',
    description: 'Save the current project.',
    category: 'project',
    keywords: ['保存', 'project'],
    keys: ['Mod+S'],
    resolve: forReadyProject((workbench, ready) => {
      const busy = ready.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING
      let label: string | undefined
      if (busy) label = 'Saving…'
      else if (ready.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED) label = 'Retry save'
      let disabledReason: string | null = null
      if (busy) disabledReason = 'The project is being saved.'
      else if (!ready.isDirty) disabledReason = 'All changes are saved.'
      return {
        label,
        disabledReason,
        busy,
        async execute() {
          try {
            await workbench.save()
            return STUDIO_ACTION_COMPLETED
          } catch (cause) {
            return {
              status: 'failed',
              cause,
              reported: workbench.getReadyProject()?.saveFailure === cause,
            }
          }
        },
      }
    }),
  }),
  defineStudioAction({
    id: 'history.undo',
    context: WORKBENCH_CONTEXT,
    label: 'Undo',
    description: 'Undo the last project edit.',
    category: 'history',
    keywords: ['撤销'],
    keys: ['Mod+Z'],
    repeat: true,
    resolve: forReadyProject((_workbench, { session }) => ({
      disabledReason: session.canUndo ? null : 'There is nothing to undo.',
      execute: () =>
        session.undo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
    })),
  }),
  defineStudioAction({
    id: 'history.redo',
    context: WORKBENCH_CONTEXT,
    label: 'Redo',
    description: 'Redo the last undone project edit.',
    category: 'history',
    keywords: ['重做'],
    keys: ['Mod+Shift+Z', 'Control+Y'],
    repeat: true,
    resolve: forReadyProject((_workbench, { session }) => ({
      disabledReason: session.canRedo ? null : 'There is nothing to redo.',
      execute: () =>
        session.redo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
    })),
  }),
  defineStudioAction({
    id: 'playback.toggle',
    context: WORKBENCH_CONTEXT,
    label: 'Play / pause',
    description: 'Play or pause the current project.',
    category: 'playback',
    keywords: ['播放', '暂停', 'transport'],
    keys: ['Space'],
    resolve: forReadyProject((workbench, ready) => {
      const state = workbench.getPlaybackState()
      const busy = state.phase === PROJECT_PLAYBACK_PHASE.LOADING
      const playing = state.phase === PROJECT_PLAYBACK_PHASE.PLAYING
      const playable =
        state.projectId === ready.projectId &&
        (state.planStatus === 'playable' || state.planStatus === 'partial')
      let label = playing ? 'Pause' : 'Play'
      if (busy) label = 'Loading…'
      let disabledReason: string | null = null
      if (busy) disabledReason = 'Playback is loading.'
      else if (!playable)
        disabledReason = state.feedback?.message ?? 'No playable audio is available.'
      return {
        label,
        disabledReason,
        busy,
        checked: playing,
        async execute() {
          const applied = playing ? workbench.playback.pause() : await workbench.playback.play()
          return playbackCompletion(workbench, applied)
        },
      }
    }),
  }),
  defineStudioAction({
    id: 'playback.return-to-last-start-position',
    context: WORKBENCH_CONTEXT,
    label: 'Return to last start position',
    description: 'Stop playback and return to the last start position.',
    category: 'playback',
    keywords: ['返回', '起点', 'transport'],
    keys: ['Home'],
    resolve: forReadyProject((workbench) => ({
      disabledReason: workbench.canReturnToLastStartPosition()
        ? null
        : 'Already at the last start position.',
      execute: () => playbackCompletion(workbench, workbench.playback.returnToLastStartPosition()),
    })),
  }),
  defineStudioAction({
    id: 'projects.show',
    context: WORKBENCH_CONTEXT,
    label: 'Projects',
    description: 'Return to the project list.',
    category: 'project',
    keywords: ['项目', '导航'],
    keys: ['Mod+Alt+O'],
    resolve: forReadyProject((workbench) => {
      const busy = workbench.isShowingProjects()
      return {
        disabledReason: busy ? 'Project navigation is awaiting completion.' : null,
        busy,
        execute: () => workbench.showProjects(),
      }
    }),
  }),
  defineStudioAction({
    id: 'project.import-midi',
    context: WORKBENCH_CONTEXT,
    label: 'Import MIDI as new project…',
    description: 'Create a project from a MIDI file.',
    category: 'project',
    keywords: ['导入', 'MIDI'],
    keys: ['Mod+Alt+Shift+M'],
    resolve: importMidi('new-project'),
  }),
  defineStudioAction({
    id: 'project.import-midi-tracks',
    context: WORKBENCH_CONTEXT,
    label: 'Import MIDI as new tracks…',
    description: 'Add the tracks from a MIDI file to the current project.',
    category: 'project',
    keywords: ['导入', '轨道', 'MIDI'],
    keys: ['Mod+I'],
    resolve: importMidi('new-tracks'),
  }),
  defineStudioAction({
    id: 'midi-editor.open',
    context: WORKBENCH_CONTEXT,
    label: 'Open MIDI editor',
    description: 'Open or restore the MIDI editor dock.',
    category: 'interface',
    keywords: ['钢琴卷帘', '面板', 'dock'],
    keys: ['P'],
    resolve: forReadyProject((workbench) => {
      const editor = workbench.getMidiEditor()
      return {
        disabledReason: editor === null ? 'The MIDI editor workspace is unavailable.' : null,
        checked: editor?.isOpen() ?? false,
        execute: () => {
          if (editor === null) return STUDIO_ACTION_NOT_APPLIED
          editor.open()
          return STUDIO_ACTION_COMPLETED
        },
      }
    }),
  }),
] as const
