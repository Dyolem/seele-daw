import type { StudioActionId } from '@/workbench/actions/studio-actions'
import {
  presentStudioAction,
  type StudioActionControl,
} from '@/workbench/actions/studio-action-control'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInput } from '@/workbench/keyboard'

export function presentProjectWorkbenchActions(
  actions: StudioActionCoordinator,
  keyboard: StudioKeyboardInput,
) {
  function present(actionId: StudioActionId): StudioActionControl {
    return presentStudioAction(actions, keyboard, actionId)
  }

  return Object.freeze({
    save: present('project.save'),
    undo: present('history.undo'),
    redo: present('history.redo'),
    togglePlayback: present('playback.toggle'),
    returnToStart: present('playback.return-to-last-start-position'),
    projects: present('projects.show'),
    importMidiProject: present('project.import-midi'),
    importMidiTracks: present('project.import-midi-tracks'),
    openMidiEditor: present('midi-editor.open'),
    keyboardShortcuts: present('shortcuts.show'),
  })
}

export type ProjectWorkbenchActionControls = ReturnType<typeof presentProjectWorkbenchActions>
