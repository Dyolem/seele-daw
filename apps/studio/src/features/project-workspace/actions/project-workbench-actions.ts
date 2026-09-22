import { describeStudioAction } from '@/workbench/actions/studio-action-catalogue'
import type { ProjectWorkbenchMidiEditor } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  createStudioActionPresentation,
  type StudioActionDefinition,
  type StudioActionCompletion,
  type StudioActionDescriptor,
  type StudioActionResolution,
} from '@/workbench/actions/studio-action'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
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

/** Business owners provide capability; keyboard focus is resolved by the input router. */
export function createProjectWorkbenchActions(
  targets: StudioActionTargetSlot<ProjectWorkbenchActionTarget>,
): readonly StudioActionDefinition[] {
  function define(
    actionId: StudioActionDescriptor['actionId'],
    resolve: (
      target: ProjectWorkbenchActionTarget,
      ready: ReadyActiveProjectState,
      defaultLabel: string,
    ) => Pick<StudioActionResolution, 'presentation' | 'execute'>,
  ): StudioActionDefinition {
    const descriptor = describeStudioAction(actionId)
    return Object.freeze({
      ...descriptor,
      resolve() {
        const binding = targets.current
        const ready = binding?.value.getReadyProject() ?? null
        if (binding === null || ready === null) return null
        return {
          ...resolve(binding.value, ready, descriptor.label),
          isCurrent: () =>
            binding.isCurrent() && binding.value.getReadyProject()?.session === ready.session,
          onInvalidated: binding.onInvalidated,
        }
      },
    })
  }

  function defineMidiImport(
    actionId: StudioActionDescriptor['actionId'],
    destination: 'new-project' | 'new-tracks',
  ): StudioActionDefinition {
    const { label } = describeStudioAction(actionId)
    return define(actionId, (target) => {
      const phase = target.getMidiImportPhase()
      const busy = phase !== 'idle'
      let reason: string | null = null
      let currentLabel = label
      if (phase === 'selecting') {
        reason = 'Finish choosing a MIDI file first.'
        currentLabel = 'Choosing MIDI file…'
      } else if (phase === 'importing') {
        reason = 'A MIDI file is being imported.'
        currentLabel = 'Importing MIDI…'
      } else if (!target.canChooseMidiFile()) {
        reason = 'The MIDI file chooser is unavailable.'
      }
      return {
        presentation: createStudioActionPresentation(currentLabel, reason, { busy }),
        execute: () => target.importMidi(destination),
      }
    })
  }

  function playbackCompletion(
    target: ProjectWorkbenchActionTarget,
    applied: boolean,
  ): StudioActionCompletion {
    if (applied) return STUDIO_ACTION_COMPLETED
    const result = target.getPlaybackState()
    if (result.phase === PROJECT_PLAYBACK_PHASE.FAILED) {
      return { status: 'failed', cause: result.failureCause, reported: true }
    }
    return STUDIO_ACTION_NOT_APPLIED
  }

  return Object.freeze([
    define(STUDIO_ACTION.PROJECT_SAVE, (target, ready, defaultLabel) => {
      const busy = ready.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING
      let label = defaultLabel
      if (busy) label = 'Saving…'
      else if (ready.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.FAILED) label = 'Retry save'
      let reason: string | null = null
      if (busy) reason = 'The project is being saved.'
      else if (!ready.isDirty) reason = 'All changes are saved.'
      return {
        presentation: createStudioActionPresentation(label, reason, { busy }),
        async execute() {
          try {
            await target.save()
            return STUDIO_ACTION_COMPLETED
          } catch (cause) {
            return {
              status: 'failed',
              cause,
              reported: target.getReadyProject()?.saveFailure === cause,
            }
          }
        },
      }
    }),
    define(STUDIO_ACTION.HISTORY_UNDO, (_target, ready, label) => ({
      presentation: createStudioActionPresentation(
        label,
        ready.session.canUndo ? null : 'There is nothing to undo.',
      ),
      execute: () =>
        ready.session.undo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
    })),
    define(STUDIO_ACTION.HISTORY_REDO, (_target, ready, label) => ({
      presentation: createStudioActionPresentation(
        label,
        ready.session.canRedo ? null : 'There is nothing to redo.',
      ),
      execute: () =>
        ready.session.redo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
    })),
    define(STUDIO_ACTION.PLAYBACK_TOGGLE, (target, ready) => {
      const state = target.getPlaybackState()
      const busy = state.phase === PROJECT_PLAYBACK_PHASE.LOADING
      const playing = state.phase === PROJECT_PLAYBACK_PHASE.PLAYING
      const playable =
        state.projectId === ready.projectId &&
        (state.planStatus === 'playable' || state.planStatus === 'partial')
      let label = playing ? 'Pause' : 'Play'
      if (busy) label = 'Loading…'
      let reason: string | null = null
      if (busy) reason = 'Playback is loading.'
      else if (!playable) reason = state.feedback?.message ?? 'No playable audio is available.'
      return {
        presentation: createStudioActionPresentation(label, reason, { busy, checked: playing }),
        async execute() {
          const applied = playing ? target.playback.pause() : await target.playback.play()
          return playbackCompletion(target, applied)
        },
      }
    }),
    define(STUDIO_ACTION.PLAYBACK_RETURN_TO_START, (target, _ready, label) => ({
      presentation: createStudioActionPresentation(
        label,
        target.canReturnToLastStartPosition() ? null : 'Already at the last start position.',
      ),
      execute: () => playbackCompletion(target, target.playback.returnToLastStartPosition()),
    })),
    define(STUDIO_ACTION.PROJECTS_SHOW, (target, _ready, label) => {
      const busy = target.isShowingProjects()
      return {
        presentation: createStudioActionPresentation(
          label,
          busy ? 'Project navigation is awaiting completion.' : null,
          { busy },
        ),
        execute: () => target.showProjects(),
      }
    }),
    defineMidiImport(STUDIO_ACTION.PROJECT_IMPORT_MIDI, 'new-project'),
    defineMidiImport(STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS, 'new-tracks'),
    define(STUDIO_ACTION.MIDI_EDITOR_OPEN, (target, _ready, label) => {
      const editor = target.getMidiEditor()
      return {
        presentation: createStudioActionPresentation(
          label,
          editor === null ? 'The MIDI editor workspace is unavailable.' : null,
          { checked: editor?.isOpen() ?? false },
        ),
        execute() {
          if (editor === null) return STUDIO_ACTION_NOT_APPLIED
          editor.open()
          return STUDIO_ACTION_COMPLETED
        },
      }
    }),
  ])
}
