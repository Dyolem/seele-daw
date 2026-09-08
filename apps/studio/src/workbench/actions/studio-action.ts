export const STUDIO_ACTION = {
  HISTORY_REDO: 'history.redo',
  HISTORY_UNDO: 'history.undo',
  PIANO_ROLL_INTERACTION_CANCEL: 'piano-roll.interaction.cancel',
  PIANO_ROLL_SELECTION_CLEAR: 'piano-roll.selection.clear',
  PIANO_ROLL_SELECTION_DELETE: 'piano-roll.selection.delete',
  PLAYBACK_TOGGLE: 'playback.toggle',
  PROJECT_SAVE: 'project.save',
} as const

export type StudioActionId = (typeof STUDIO_ACTION)[keyof typeof STUDIO_ACTION]
export type StudioActionSource = 'keyboard' | 'menu' | 'toolbar' | 'context-menu'

export interface StudioActionDescriptor {
  readonly actionId: StudioActionId
  readonly description: string
  readonly label: string
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
