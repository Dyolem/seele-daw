import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'
import {
  presentStudioAction,
  type StudioActionControl,
} from '@/workbench/actions/studio-action-control'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInput } from '@/workbench/keyboard/studio-keyboard-input-router'

export function presentProjectWorkbenchActions(
  actions: StudioActionCoordinator,
  keyboard: StudioKeyboardInput,
) {
  function present(actionId: StudioActionId): StudioActionControl {
    return presentStudioAction(actions, keyboard, actionId)
  }

  return Object.freeze({
    save: present(STUDIO_ACTION.PROJECT_SAVE),
    undo: present(STUDIO_ACTION.HISTORY_UNDO),
    redo: present(STUDIO_ACTION.HISTORY_REDO),
    togglePlayback: present(STUDIO_ACTION.PLAYBACK_TOGGLE),
    returnToStart: present(STUDIO_ACTION.PLAYBACK_RETURN_TO_START),
    projects: present(STUDIO_ACTION.PROJECTS_SHOW),
    importMidiProject: present(STUDIO_ACTION.PROJECT_IMPORT_MIDI),
    importMidiTracks: present(STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS),
    openMidiEditor: present(STUDIO_ACTION.MIDI_EDITOR_OPEN),
    keyboardShortcuts: present(STUDIO_ACTION.SHORTCUTS_SHOW),
  })
}

export type ProjectWorkbenchActionControls = ReturnType<typeof presentProjectWorkbenchActions>
