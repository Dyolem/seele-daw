import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'

import { TestStudioKeyboardBindingRegistry } from '@/workbench/keyboard/__tests__/studio-keyboard-shortcut-test-support'
import {
  STUDIO_KEYBOARD_ACTION,
  STUDIO_KEYBOARD_SCOPE,
  createStudioKeyboardShortcutCoordinator,
} from '@/workbench/keyboard/studio-keyboard-shortcut-coordinator'
import { STUDIO_DEFAULT_KEYMAP } from '@/workbench/keyboard/studio-default-keymap'
import {
  STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY,
  useStudioKeyboardShortcutRegistration,
  useStudioKeyboardShortcuts,
} from '@/workbench/keyboard/vue/studio-keyboard-shortcut-context'

function createActionOwner(label: string) {
  return defineComponent({
    name: `${label}ActionOwner`,
    setup() {
      const { keyboardShortcuts } = useStudioKeyboardShortcuts()
      useStudioKeyboardShortcutRegistration(keyboardShortcuts, [
        {
          actionId: STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE,
          bindings: keyboardShortcuts.bindingsFor(STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE),
          description: `Remove the ${label} selection.`,
          label: `Remove ${label} selection`,
          run: () => true,
          scope: STUDIO_KEYBOARD_SCOPE.PIANO_ROLL,
        },
      ])

      return () => h('div', label)
    },
  })
}

describe('Studio Keyboard Shortcut Vue Context', () => {
  it('releases a component Action before a mutually exclusive replacement registers it', async () => {
    const bindingRegistry = new TestStudioKeyboardBindingRegistry()
    const keyboardShortcuts = createStudioKeyboardShortcutCoordinator({
      bindingRegistry,
      keymap: STUDIO_DEFAULT_KEYMAP,
    })
    const TrackSurface = createActionOwner('Track')
    const ClipSurface = createActionOwner('Clip')
    const scope = ref<'clip' | 'track'>('track')
    const Host = defineComponent({
      setup() {
        return () => (scope.value === 'track' ? h(TrackSurface) : h(ClipSurface))
      },
    })
    const wrapper = mount(Host, {
      global: {
        provide: {
          [STUDIO_KEYBOARD_SHORTCUT_CONTEXT_KEY as symbol]: Object.freeze({ keyboardShortcuts }),
        },
      },
    })
    const removeBinding = STUDIO_DEFAULT_KEYMAP[STUDIO_KEYBOARD_ACTION.PIANO_ROLL_NOTES_REMOVE][0]
    if (removeBinding === undefined) throw new Error('Expected a default Piano Roll remove binding')

    expect(keyboardShortcuts.listShortcuts().map(({ label }) => label)).toEqual([
      'Remove Track selection',
    ])

    scope.value = 'clip'
    await nextTick()

    expect(keyboardShortcuts.listShortcuts().map(({ label }) => label)).toEqual([
      'Remove Clip selection',
    ])
    expect(bindingRegistry.registrationCountByBinding.get(removeBinding)).toBe(2)
    expect(bindingRegistry.disposalCountByBinding.get(removeBinding)).toBe(1)

    scope.value = 'track'
    await nextTick()

    expect(keyboardShortcuts.listShortcuts().map(({ label }) => label)).toEqual([
      'Remove Track selection',
    ])
    expect(bindingRegistry.registrationCountByBinding.get(removeBinding)).toBe(3)
    expect(bindingRegistry.disposalCountByBinding.get(removeBinding)).toBe(2)

    wrapper.unmount()

    expect(keyboardShortcuts.listShortcuts()).toEqual([])
    expect(bindingRegistry.disposalCountByBinding.get(removeBinding)).toBe(3)
    keyboardShortcuts.dispose()
  })
})
