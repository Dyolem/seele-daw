import {
  STUDIO_ACTION,
  type StudioActionId,
  type StudioActionPresentation,
} from '@/workbench/actions/studio-action'
import type { StudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'

export interface ProjectWorkbenchActionControl extends StudioActionPresentation {
  readonly actionId: StudioActionId
  readonly shortcut: string
  readonly title: string
}

/** Menus and buttons share business presentation and platform-formatted hints. */
export function presentProjectWorkbenchActions(
  actions: StudioActionCoordinator,
  keyboard: StudioKeyboardInputRouter,
) {
  function present(actionId: StudioActionId): ProjectWorkbenchActionControl {
    const presentation = actions.presentationFor(actionId)
    const shortcut = keyboard.displayBindingsFor(actionId).join(' / ')
    let title = presentation.label
    if (shortcut) title += ` (${shortcut})`
    if (presentation.disabledReason !== null) title += ` — ${presentation.disabledReason}`
    return Object.freeze({ ...presentation, actionId, shortcut, title })
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
  })
}

export type ProjectWorkbenchActionControls = ReturnType<typeof presentProjectWorkbenchActions>
