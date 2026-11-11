import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/contracts/studio-keyboard-binding'

export type StudioKeyboardKeymapOverrides = Partial<
  Record<StudioActionId, readonly StudioKeyboardBinding[]>
>

/** Every catalogue action gets a binding list; actions without an override keep their keys. */
export function createStudioKeyboardKeymap(
  catalogue: readonly StudioActionDescriptor[],
  overrides: StudioKeyboardKeymapOverrides = {},
): StudioKeyboardKeymap<StudioActionId> {
  // Object.fromEntries loses the keys; the catalogue enumerates every action.
  return Object.freeze(
    Object.fromEntries(
      catalogue.map(({ id, keys }) => [id, Object.freeze([...(overrides[id] ?? keys)])]),
    ),
  ) as StudioKeyboardKeymap<StudioActionId>
}
