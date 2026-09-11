import { presentProjectWorkbenchActions } from '@/features/project-workspace/actions/project-workbench-action-controls'
import { HotkeyManager } from '@tanstack/hotkeys'
import { flushPromises, mount } from '@vue/test-utils'
import { h, shallowRef } from 'vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import UiAlertDialog from '@/ui/components/UiAlertDialog.vue'
import {
  STUDIO_ACTION,
  STUDIO_ACTION_COMPLETED,
  type StudioActionId,
  type StudioActionSource,
  type StudioActionFailure,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { STUDIO_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-action-context'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import { ACTIVE_PROJECT_SAVE_STATUS } from '@/workbench/project/active-project-state'

describe('Project menu keyboard ownership', () => {
  it.each(['Cancel', 'Escape'] as const)(
    'hands focus to the navigation dialog and returns to the menu trigger on %s',
    async (dismissal) => {
      const isDialogOpen = shallowRef(false)
      const runtime = createStudioActionRuntime({
        bindingRegistry: createBrowserTanStackHotkeyRegistry({ platform: 'mac', target: document }),
        isModalActive: () => isDialogOpen.value,
        reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
      })
      const controls = presentProjectWorkbenchActions(runtime.actions, runtime.keyboard)
      const invokeAction = vi.fn<(actionId: StudioActionId, source: StudioActionSource) => void>(
        () => {
          isDialogOpen.value = true
        },
      )
      const wrapper = mount(
        {
          render: () =>
            h('div', [
              h(ProjectWorkbenchGlobalBar, {
                actionControls: {
                  ...controls,
                  projects: { ...controls.projects, enabled: true },
                },
                isDirty: true,
                projectId: 'menu-navigation-focus',
                projectName: 'Navigation Focus',
                saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
                onInvokeAction: invokeAction,
              }),
              h(
                UiAlertDialog,
                {
                  open: isDialogOpen.value,
                  onRequestClose: () => {
                    isDialogOpen.value = false
                  },
                },
                {
                  title: () => 'Save changes before leaving?',
                  description: () => 'Cancel to keep editing.',
                  cancel: () => h('button', { type: 'button' }, 'Cancel'),
                },
              ),
            ]),
        },
        {
          attachTo: document.body,
          global: { provide: { [STUDIO_ACTION_CONTEXT_KEY as symbol]: runtime } },
        },
      )
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
      const projects = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (item) => item.textContent?.trim() === 'Projects',
      )
      if (projects === undefined) throw new Error('Expected the Projects menu item')
      projects.focus()
      projects.click()
      await flushPromises()

      expect(invokeAction).toHaveBeenCalledExactlyOnceWith(STUDIO_ACTION.PROJECTS_SHOW, 'menu')
      expect(document.body.querySelector('[role="menu"]')).toBeNull()
      const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]')
      const cancel = dialog?.querySelector('button')
      if (dialog === null || cancel === null || cancel === undefined)
        throw new Error('Expected the navigation dialog Cancel button')
      await vi.waitFor(() => expect(document.activeElement).toBe(cancel))

      if (dismissal === 'Cancel') cancel.click()
      else
        cancel.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
        )
      await flushPromises()

      expect(isDialogOpen.value).toBe(false)
      expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
      await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
      expect(invokeAction).toHaveBeenCalledOnce()
    },
  )

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
        actionControls: presentProjectWorkbenchActions(runtime.actions, runtime.keyboard),
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
    // Focus restoration completes in a later browser task, after the menu is removed.
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger.element))
    expect(clearSelection).not.toHaveBeenCalled()
    editor.focus()
    editor.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }),
    )
    expect(clearSelection).toHaveBeenCalledOnce()
  })
})
