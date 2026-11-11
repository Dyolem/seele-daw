import {
  defineStudioKeyboardBinding,
  type StudioHotkey,
  type StudioKeyboardBinding,
} from '@/workbench/keyboard'

/**
 * Every action ID, as a key. A module that declares actions adds its IDs by declaration merging,
 * so neither this file nor the keyboard imports a feature; the composition root lists the
 * declarations themselves.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled in by the declaring modules
export interface StudioActionIds {}

export type StudioActionId = keyof StudioActionIds & string

/** The `StudioActionIds` entries of a list of declared actions. */
export type StudioActionIdsOf<Actions extends readonly { readonly id: string }[]> = Record<
  Actions[number]['id'],
  true
>

export type StudioActionSource = 'keyboard' | 'menu' | 'toolbar' | 'context-menu'

export type StudioActionCategory =
  | 'project'
  | 'history'
  | 'playback'
  | 'editor'
  | 'arrangement'
  | 'interface'

/**
 * A focus region or owner that actions run against. Views bind at most one target to a context
 * at a time; a key shared by several active contexts goes to the one with the highest priority.
 */
export interface StudioContext<Target = unknown> {
  readonly id: string
  readonly label: string
  readonly priority: number
  /** Same-priority contexts that can be active together, so they must not share a key. */
  readonly overlaps?: readonly StudioContext[]
  /** Enter on the focused target runs this context's action instead of activating the element. */
  readonly ownsEnter?: boolean
  isActive(target: Target): boolean
}

export interface StudioContextReader {
  isActive(context: StudioContext): boolean
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

/** What an action offers its bound target right now. */
export interface StudioActionState {
  /** Replaces the declared label, e.g. "Pause" while playing. */
  readonly label?: string
  /** Appended to the label, e.g. what the selection holds. */
  readonly detail?: string
  readonly disabledReason?: string | null
  readonly busy?: boolean
  readonly checked?: boolean
  /** Narrows currency beyond the context binding, e.g. to one Project session. */
  readonly isCurrent?: () => boolean
  /** Returning nothing means the action completed. */
  execute(): StudioActionCompletion | void | Promise<StudioActionCompletion | void>
}

export interface StudioActionDescriptor<Id extends string = StudioActionId> {
  readonly id: Id
  readonly label: string
  readonly description: string
  readonly category: StudioActionCategory
  readonly keywords: readonly string[]
  readonly context: StudioContext
  /** Default bindings; the user keymap can replace them. */
  readonly keys: readonly StudioKeyboardBinding[]
  /** Whether holding a key repeats the action. */
  readonly repeat: boolean
}

export interface StudioAction<
  Id extends string = StudioActionId,
  Target = unknown,
> extends StudioActionDescriptor<Id> {
  readonly context: StudioContext<Target>
  /** Null when the bound target cannot offer the action at all. */
  resolve(target: Target, contexts: StudioContextReader): StudioActionState | null
}

interface StudioActionDeclaration<Id extends string, Target> {
  readonly id: Id
  readonly context: StudioContext<Target>
  readonly label: string
  readonly description: string
  readonly category: StudioActionCategory
  readonly keywords?: readonly string[]
  readonly keys?: readonly StudioHotkey[]
  readonly repeat?: boolean
  resolve(target: Target, contexts: StudioContextReader): StudioActionState | null
}

export function defineStudioContext<Target>(context: StudioContext<Target>): StudioContext<Target> {
  return Object.freeze({ ...context })
}

/** The single declaration of an action: identity, text, default keys and behavior. */
export function defineStudioAction<const Id extends string, Target>(
  declaration: StudioActionDeclaration<Id, Target>,
): StudioAction<Id, Target> {
  return Object.freeze({
    ...declaration,
    keywords: Object.freeze([...(declaration.keywords ?? [])]),
    keys: Object.freeze((declaration.keys ?? []).map((key) => defineStudioKeyboardBinding(key))),
    repeat: declaration.repeat ?? false,
  })
}

/** A disposable projection of business capability, independent of keyboard focus. */
export interface StudioActionPresentation {
  readonly busy: boolean
  readonly checked?: boolean
  readonly disabledReason: string | null
  readonly enabled: boolean
  readonly label: string
}

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
