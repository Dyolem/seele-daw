import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  createStudioActionPresentation,
  type StudioActionDefinition,
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
}

/** Business owners provide capability; keyboard focus is resolved by the input router. */
export function createProjectWorkbenchActions(
  targets: StudioActionTargetSlot<ProjectWorkbenchActionTarget>,
): readonly StudioActionDefinition[] {
  function define(
    descriptor: StudioActionDescriptor,
    resolve: (
      target: ProjectWorkbenchActionTarget,
      ready: ReadyActiveProjectState,
    ) => Pick<StudioActionResolution, 'presentation' | 'execute'>,
  ): StudioActionDefinition {
    return Object.freeze({
      ...descriptor,
      resolve() {
        const binding = targets.current
        const ready = binding?.value.getReadyProject() ?? null
        if (binding === null || ready === null) return null
        return {
          ...resolve(binding.value, ready),
          isCurrent: () =>
            binding.isCurrent() && binding.value.getReadyProject()?.session === ready.session,
          onInvalidated: binding.onInvalidated,
        }
      },
    })
  }

  return Object.freeze([
    define(
      {
        actionId: STUDIO_ACTION.PROJECT_SAVE,
        label: 'Save',
        description: 'Save the current project.',
      },
      (target, ready) => {
        const busy = ready.saveStatus === ACTIVE_PROJECT_SAVE_STATUS.SAVING
        let label = 'Save'
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
      },
    ),
    define(
      {
        actionId: STUDIO_ACTION.HISTORY_UNDO,
        label: 'Undo',
        description: 'Undo the last project edit.',
      },
      (_target, ready) => ({
        presentation: createStudioActionPresentation(
          'Undo',
          ready.session.canUndo ? null : 'There is nothing to undo.',
        ),
        execute: () =>
          ready.session.undo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
      }),
    ),
    define(
      {
        actionId: STUDIO_ACTION.HISTORY_REDO,
        label: 'Redo',
        description: 'Redo the last undone project edit.',
      },
      (_target, ready) => ({
        presentation: createStudioActionPresentation(
          'Redo',
          ready.session.canRedo ? null : 'There is nothing to redo.',
        ),
        execute: () =>
          ready.session.redo() === null ? STUDIO_ACTION_NOT_APPLIED : STUDIO_ACTION_COMPLETED,
      }),
    ),
    define(
      {
        actionId: STUDIO_ACTION.PLAYBACK_TOGGLE,
        label: 'Play',
        description: 'Play or pause the current project.',
      },
      (target, ready) => {
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
            if (applied) return STUDIO_ACTION_COMPLETED
            const result = target.getPlaybackState()
            if (result.phase === PROJECT_PLAYBACK_PHASE.FAILED) {
              return { status: 'failed', cause: result.failureCause, reported: true }
            }
            return STUDIO_ACTION_NOT_APPLIED
          },
        }
      },
    ),
  ])
}
