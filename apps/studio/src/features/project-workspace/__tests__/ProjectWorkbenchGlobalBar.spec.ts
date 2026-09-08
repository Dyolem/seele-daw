import { HotkeyManager } from '@tanstack/hotkeys'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import {
  STUDIO_ACTION_COMPLETED,
  type StudioActionFailure,
  type StudioActionCompletion,
  createStudioActionPresentation,
} from '@/workbench/actions/studio-action'
import { STUDIO_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-action-context'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import { ACTIVE_PROJECT_SAVE_STATUS } from '@/workbench/project/active-project-state'

describe('Project menu keyboard ownership', () => {
  it('closes with Escape, restores the trigger focus and resumes editor input afterward', async () => {
    const clearSelection = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const runtime = createStudioActionRuntime({
      bindingRegistry: createBrowserTanStackHotkeyRegistry({ platform: 'mac', target: document }),
      isModalActive: () => false,
      reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
    })
    const editor = document.createElement('div')
    editor.tabIndex = 0
    document.body.append(editor)
    runtime.pianoRollTarget.bind({
      isFocused: () => document.activeElement === editor,
      hasSelection: () => true,
      hasInteraction: () => false,
      selectionLabel: () => 'Notes',
      clearSelection,
      deleteSelection: () => STUDIO_ACTION_COMPLETED,
      cancelInteraction: () => STUDIO_ACTION_COMPLETED,
    })
    const wrapper = mount(ProjectWorkbenchGlobalBar, {
      attachTo: document.body,
      props: {
        isDirty: true,
        projectId: 'menu-focus',
        projectName: 'Menu Focus',
        saveAction: createStudioActionPresentation('Save'),
        saveShortcut: '⌘S',
        saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      },
      global: { provide: { [STUDIO_ACTION_CONTEXT_KEY as symbol]: runtime } },
    })
    onTestFinished(() => {
      wrapper.unmount()
      runtime.dispose()
      HotkeyManager.resetInstance()
      document.body.replaceChildren()
    })
    const trigger = wrapper.get<HTMLButtonElement>('button[aria-label="Open project menu"]')
    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()
    const menu = document.body.querySelector<HTMLElement>('.project-workbench__menu')
    if (menu === null) throw new Error('Expected open project menu')
    menu.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.body.querySelector('.project-workbench__menu')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)
    expect(clearSelection).not.toHaveBeenCalled()
    editor.focus()
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
    expect(clearSelection).toHaveBeenCalledOnce()
  })
})
