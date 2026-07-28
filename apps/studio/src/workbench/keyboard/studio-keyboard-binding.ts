import type { Hotkey } from '@tanstack/hotkeys'

declare const studioKeyboardBindingBrand: unique symbol

/**
 * A Binding accepted by the Studio shortcut system.
 *
 * Built-in bindings use the compile-time authoring helper. Dynamic user input
 * must cross the runtime validation boundary in the browser adapter.
 */
export type StudioKeyboardBinding = string & {
  readonly [studioKeyboardBindingBrand]: 'StudioKeyboardBinding'
}

export type StudioKeyboardKeymap<ActionId extends string = string> = Readonly<
  Record<ActionId, readonly StudioKeyboardBinding[]>
>

export interface StudioKeyboardBindingValidation {
  readonly binding: StudioKeyboardBinding | null
  readonly errors: readonly string[]
  readonly input: string
  readonly valid: boolean
  readonly warnings: readonly string[]
}

/** Gives built-in keymaps TanStack's compile-time Hotkey vocabulary. */
export function defineStudioKeyboardBinding<const Binding extends Hotkey>(
  binding: Binding,
): StudioKeyboardBinding {
  return binding as StudioKeyboardBinding
}
