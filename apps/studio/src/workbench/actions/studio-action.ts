export const STUDIO_ACTION = {
  HISTORY_REDO: 'history.redo',
  HISTORY_UNDO: 'history.undo',
  INTERACTION_CANCEL: 'interaction.cancel',
  EDITOR_SELECTION_CLEAR: 'editor.selection.clear',
  EDITOR_SELECTION_DELETE: 'editor.selection.delete',
  ARRANGEMENT_CLIP_OPEN: 'arrangement.clip.open',
  ARRANGEMENT_CLIP_CREATE: 'arrangement.clip.create',
  PIANO_ROLL_TOOL_CURSOR: 'piano-roll.tool.cursor',
  PIANO_ROLL_TOOL_PENCIL: 'piano-roll.tool.pencil',
  PIANO_ROLL_SNAP_TOGGLE: 'piano-roll.snap.toggle',
  NOTIFICATIONS_FOCUS: 'notifications.focus',
  SHORTCUTS_SHOW: 'shortcuts.show',
  PLAYBACK_TOGGLE: 'playback.toggle',
  PLAYBACK_RETURN_TO_START: 'playback.return-to-last-start-position',
  PROJECTS_SHOW: 'projects.show',
  PROJECT_IMPORT_MIDI: 'project.import-midi',
  PROJECT_IMPORT_MIDI_TRACKS: 'project.import-midi-tracks',
  PROJECT_SAVE: 'project.save',
  MIDI_EDITOR_OPEN: 'midi-editor.open',
} as const

export type StudioActionId = (typeof STUDIO_ACTION)[keyof typeof STUDIO_ACTION]
export type StudioActionSource = 'keyboard' | 'menu' | 'toolbar' | 'context-menu'

export type StudioActionCategory =
  | 'project'
  | 'history'
  | 'playback'
  | 'editor'
  | 'arrangement'
  | 'interface'

export interface StudioActionDescriptor {
  readonly actionId: StudioActionId
  readonly description: string
  readonly label: string
  readonly category: StudioActionCategory
  readonly keywords: readonly string[]
}

/** A disposable projection of business capability, independent of keyboard focus. */
export interface StudioActionPresentation {
  readonly busy: boolean
  readonly checked?: boolean
  readonly disabledReason: string | null
  readonly enabled: boolean
  readonly label: string
}

export type StudioActionCompletion =
  | { readonly status: 'completed' | 'cancelled' | 'not-applied' }
  | { readonly status: 'failed'; readonly cause: unknown; readonly reported: boolean }

export const STUDIO_ACTION_COMPLETED: StudioActionCompletion = Object.freeze({
  status: 'completed',
})
export const STUDIO_ACTION_CANCELLED: StudioActionCompletion = Object.freeze({
  status: 'cancelled',
})
export const STUDIO_ACTION_NOT_APPLIED: StudioActionCompletion = Object.freeze({
  status: 'not-applied',
})

export interface StudioActionResolution {
  readonly presentation: StudioActionPresentation
  isCurrent(): boolean
  onInvalidated(listener: () => void): () => void
  execute(): StudioActionCompletion | Promise<StudioActionCompletion>
}

/** Features contribute one definition; mounted views only supply its current target. */
export interface StudioActionDefinition extends StudioActionDescriptor {
  resolve(): StudioActionResolution | null
}

export interface StudioActionFailure {
  readonly actionId: StudioActionId
  readonly cause: unknown
  readonly operation: 'presentation' | 'resolve' | 'execute'
  readonly source: StudioActionSource | null
}

export type StudioActionInvocation =
  | { readonly status: 'unavailable'; readonly reason: string }
  | { readonly status: 'failed'; readonly failure: StudioActionFailure }
  | { readonly status: 'accepted'; readonly completion: Promise<StudioActionCompletion> }

export function createStudioActionPresentation(
  label: string,
  disabledReason: string | null = null,
  options: { readonly busy?: boolean; readonly checked?: boolean } = {},
): StudioActionPresentation {
  return Object.freeze({
    busy: options.busy ?? false,
    checked: options.checked,
    disabledReason,
    enabled: disabledReason === null,
    label,
  })
}
