import { computed, shallowRef } from 'vue'
import type { StudioKeyboardInput } from '@/workbench/keyboard/contracts/studio-keyboard-input'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/runtime/studio-keyboard-input-router'
import type { StudioUserKeymapRuntime } from '@/workbench/keyboard/runtime/studio-user-keymap'

/** Vue observes the committed snapshot; components cannot replace physical registrations. */
export function createStudioKeyboardVueBinding(
  router: StudioKeyboardInputRouter,
  userKeymap: StudioUserKeymapRuntime,
) {
  const state = shallowRef(userKeymap.state)
  const unsubscribe = userKeymap.subscribe((snapshot) => {
    state.value = snapshot
  })
  const keyboard = Object.freeze<StudioKeyboardInput>({
    get keymap() {
      return state.value.keymap
    },
    bindingsFor: (actionId) => state.value.keymap[actionId],
    displayBindingsFor: (actionId) =>
      Object.freeze(state.value.keymap[actionId].map(router.formatBinding)),
    formatBinding: router.formatBinding,
    validateBindingInput: router.validateBindingInput,
    suspend: router.suspend,
  })
  return { keyboard, keymapState: computed(() => state.value), dispose: unsubscribe }
}
