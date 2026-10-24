import { describe, expect, it } from 'vitest'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { STUDIO_ACTIONS } from '@/workbench/actions/studio-actions'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/contracts/studio-keyboard-binding'
import { queryStudioShortcuts } from '@/workbench/keyboard/runtime/studio-shortcut-catalogue'

describe('Shortcut catalogue', () => {
  it('lists every Action and its explicit default policy without mounting a feature', () => {
    const { runtime } = createTestStudioActionRuntime()
    const rows = queryStudioShortcuts(runtime.actions, runtime.keyboard)
    expect(rows.map((row) => row.id)).toEqual(STUDIO_ACTIONS.map(({ id }) => id))
    expect(
      rows.every((row) => row.label && row.description && row.categoryLabel && row.contextLabel),
    ).toBe(true)
    expect(rows.every((row) => Object.isFrozen(row.keywords))).toBe(true)
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '', 'assigned')).toHaveLength(19)
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '', 'unassigned')).toHaveLength(
      0,
    )
  })

  it('searches Chinese terms and reports effective keys separately from defaults', () => {
    const { runtime } = createTestStudioActionRuntime({
      keymap: {
        'editor.selection.delete': [defineStudioKeyboardBinding('Mod+D')],
        'piano-roll.tool.pencil': [defineStudioKeyboardBinding('P')],
      },
    })
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '删除')[0]).toMatchObject({
      id: 'editor.selection.delete',
      currentBindings: ['display:Mod+D'],
      defaultBindings: ['display:Backspace', 'display:Delete'],
    })
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '画笔', 'assigned')[0]?.id).toBe(
      'piano-roll.tool.pencil',
    )
    expect(
      queryStudioShortcuts(runtime.actions, runtime.keyboard, '画笔', 'unassigned'),
    ).toHaveLength(0)
    expect(
      queryStudioShortcuts(runtime.actions, runtime.keyboard, 'no matching action'),
    ).toHaveLength(0)
  })
})
