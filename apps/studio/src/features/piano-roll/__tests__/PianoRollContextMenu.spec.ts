import { HotkeyManager } from '@tanstack/hotkeys'
import { flushPromises, mount } from '@vue/test-utils'
import { ContextMenuRoot } from 'reka-ui'
import { defineComponent, shallowRef } from 'vue'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import {
  createStudioActionRuntime,
  type StudioActionRuntime,
} from '@/bootstrap/studio-action-runtime'
import PianoRollContextMenu from '@/features/piano-roll/actions/PianoRollContextMenu.vue'
import { PIANO_ROLL_ACTION_TARGET_KEY } from '@/features/piano-roll/actions/piano-roll-action-context'
import {
  getPianoRollContextMenu,
  getPianoRollContextMenuItem,
  requestPianoRollContextMenu,
} from '@/features/piano-roll/__tests__/support/piano-roll-context-menu-test-support'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  type StudioActionCompletion,
  type StudioActionFailure,
} from '@/workbench/actions/studio-action'
import { STUDIO_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-action-context'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import { createStudioKeyboardKeymap } from '@/workbench/keyboard/studio-default-keymap'

const cleanups: Array<() => void> = []

function mountMenu(runtime: StudioActionRuntime) {
  const hasSelection = shallowRef(true)
  const canPrepare = shallowRef(true)
  const deleteSelection = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
  const clearSelection = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
  const target = {
    isFocused: () => true,
    hasInteraction: () => false,
    hasSelection: () => hasSelection.value,
    selectionLabel: () => 'Notes',
    deleteSelection,
    clearSelection,
    cancelInteraction: () => STUDIO_ACTION_COMPLETED,
  }
  const releaseTarget = runtime.pianoRollTarget.bind(target)
  const binding = runtime.pianoRollTarget.current
  const wrapper = mount(
    defineComponent({
      components: { ContextMenuRoot, PianoRollContextMenu },
      setup() {
        return {
          prepare(event: MouseEvent) {
            if (
              !canPrepare.value ||
              binding === null ||
              !(event.currentTarget instanceof HTMLElement)
            )
              return null
            event.currentTarget.focus()
            return { binding, focusElement: event.currentTarget }
          },
        }
      },
      template:
        '<ContextMenuRoot><PianoRollContextMenu :prepare-target="prepare"><div tabindex="0" data-editor>Notes</div></PianoRollContextMenu></ContextMenuRoot>',
    }),
    {
      attachTo: document.body,
      global: {
        provide: {
          [STUDIO_ACTION_CONTEXT_KEY as symbol]: runtime,
          [PIANO_ROLL_ACTION_TARGET_KEY as symbol]: runtime.pianoRollTarget,
        },
      },
    },
  )
  cleanups.push(() => {
    wrapper.unmount()
    releaseTarget()
  })
  return {
    wrapper,
    editor: wrapper.get<HTMLElement>('[data-editor]'),
    hasSelection,
    canPrepare,
    target,
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  document.body.replaceChildren()
})

describe('Piano Roll context menu', () => {
  it('uses live Action presentation and invokes an unbound Action through the same coordinator', async () => {
    const fixture = createTestStudioActionRuntime({
      keymap: createStudioKeyboardKeymap({ [STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE]: [] }),
    })
    const invoke = vi.spyOn(fixture.runtime.actions, 'invoke')
    const { editor, target } = mountMenu(fixture.runtime)
    await requestPianoRollContextMenu(editor.element)
    const item = getPianoRollContextMenuItem('Delete selection — Notes')
    expect(item.find('.piano-roll-context-menu__shortcut').exists()).toBe(false)
    expect(getPianoRollContextMenuItem('Clear selection').text()).toContain('display:Escape')
    expect(fixture.runtime.keyboard.bindingsFor(STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE)).toEqual(
      [],
    )
    await item.trigger('click')
    await flushPromises()
    expect(invoke).toHaveBeenCalledWith(STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE, 'context-menu')
    expect(target.deleteSelection).toHaveBeenCalledOnce()
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
  })

  it('lets Reka own Escape and restores editor focus before resuming keyboard actions', async () => {
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ platform: 'mac', target: document }),
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    onTestFinished(() => {
      runtime.dispose()
      HotkeyManager.resetInstance()
    })
    const { editor, target } = mountMenu(runtime)
    await requestPianoRollContextMenu(editor.element)
    const menu = getPianoRollContextMenu()
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Backspace' }),
    )
    expect(target.deleteSelection).not.toHaveBeenCalled()
    menu.element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
    await flushPromises()
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
    expect(target.clearSelection).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editor.element)
    editor.element.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
    expect(target.clearSelection).toHaveBeenCalledOnce()
  })

  it('does not open without an eligible target or executable selection action', async () => {
    const { runtime, bindingRegistry } = createTestStudioActionRuntime()
    const { editor, canPrepare, hasSelection } = mountMenu(runtime)
    canPrepare.value = false
    expect((await requestPianoRollContextMenu(editor.element)).defaultPrevented).toBe(true)
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
    canPrepare.value = true
    hasSelection.value = false
    await requestPianoRollContextMenu(editor.element)
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
    hasSelection.value = true
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(true)
  })

  it('closes when selection disappears and never invokes a replacement target from a retired menu', async () => {
    const { runtime } = createTestStudioActionRuntime()
    const { editor, target, hasSelection } = mountMenu(runtime)
    await requestPianoRollContextMenu(editor.element)
    hasSelection.value = false
    await flushPromises()
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
    hasSelection.value = true
    await requestPianoRollContextMenu(editor.element)
    const staleItem = getPianoRollContextMenuItem('Delete selection')
    const replacementDelete = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    runtime.pianoRollTarget.bind({ ...target, deleteSelection: replacementDelete })
    // Dispatch before Vue teardown to exercise the capability guard itself.
    await staleItem.trigger('click')
    await flushPromises()
    expect(target.deleteSelection).not.toHaveBeenCalled()
    expect(replacementDelete).not.toHaveBeenCalled()
    expect(document.body.querySelector('.piano-roll-context-menu')).toBeNull()
  })

  it('contains a failed menu Action and releases input ownership for a later retry', async () => {
    const { runtime, failures, bindingRegistry } = createTestStudioActionRuntime()
    const { editor, target } = mountMenu(runtime)
    target.deleteSelection.mockImplementationOnce(() => {
      throw new Error('Rejected removal')
    })
    await requestPianoRollContextMenu(editor.element)
    await getPianoRollContextMenuItem('Delete selection').trigger('click')
    await flushPromises()
    expect(failures).toHaveLength(1)
    expect(bindingRegistry.dispatch('Delete').defaultPrevented).toBe(true)
    expect(target.deleteSelection).toHaveBeenCalledTimes(2)
  })
})
