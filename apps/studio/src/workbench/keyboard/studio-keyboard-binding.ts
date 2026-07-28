import type { Hotkey } from '@tanstack/hotkeys'
import type { Brand } from '@seele-daw/type-utils'

/**
 * A Binding accepted by the Studio shortcut system.
 *
 * Built-in bindings use the compile-time authoring helper. Dynamic user input
 * must cross the runtime validation boundary in the browser adapter.
 */
export type StudioKeyboardBinding = Brand<string, 'StudioKeyboardBinding'>

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

/**
 * Brands a built-in Binding after TanStack checks its literal at compile time.
 *
 * This is intentionally a zero-runtime-cost conversion. Dynamic strings must
 * use the browser adapter's runtime validator instead.
 */
export function defineStudioKeyboardBinding<const Binding extends Hotkey>(
  binding: Binding,
): StudioKeyboardBinding {
  return binding as StudioKeyboardBinding
}
