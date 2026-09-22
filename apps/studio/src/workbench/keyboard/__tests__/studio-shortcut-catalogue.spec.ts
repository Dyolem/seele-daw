import { describe, expect, it } from 'vitest'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { STUDIO_ACTION } from '@/workbench/actions/studio-action'
import {
  STUDIO_SHORTCUT_POLICIES,
  createStudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-default-keymap'
import { defineStudioKeyboardBinding } from '@/workbench/keyboard/studio-keyboard-binding'
import { queryStudioShortcuts } from '@/workbench/keyboard/studio-shortcut-catalogue'

describe('Shortcut catalogue', () => {
  it('lists every Action and its explicit default policy without mounting a feature', () => {
    const { runtime } = createTestStudioActionRuntime()
    const rows = queryStudioShortcuts(runtime.actions, runtime.keyboard)
    expect(rows.map((row) => row.actionId).sort()).toEqual(Object.values(STUDIO_ACTION).sort())
    expect(Object.keys(STUDIO_SHORTCUT_POLICIES).sort()).toEqual(
      Object.values(STUDIO_ACTION).sort(),
    )
    expect(
      rows.every((row) => row.label && row.description && row.categoryLabel && row.contextLabel),
    ).toBe(true)
    expect(rows.every((row) => Object.isFrozen(row.keywords))).toBe(true)
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '', 'assigned')).toHaveLength(10)
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '', 'unassigned')).toHaveLength(
      9,
    )
  })

  it('searches Chinese terms and reports effective keys separately from defaults', () => {
    const { runtime } = createTestStudioActionRuntime({
      keymap: createStudioKeyboardKeymap({
        [STUDIO_ACTION.EDITOR_SELECTION_DELETE]: [defineStudioKeyboardBinding('Mod+D')],
        [STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL]: [defineStudioKeyboardBinding('P')],
      }),
    })
    expect(queryStudioShortcuts(runtime.actions, runtime.keyboard, '删除')[0]).toMatchObject({
      actionId: STUDIO_ACTION.EDITOR_SELECTION_DELETE,
      currentBindings: ['display:Mod+D'],
      defaultBindings: ['display:Backspace', 'display:Delete'],
    })
    expect(
      queryStudioShortcuts(runtime.actions, runtime.keyboard, '画笔', 'assigned')[0]?.actionId,
    ).toBe(STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL)
    expect(
      queryStudioShortcuts(runtime.actions, runtime.keyboard, '画笔', 'unassigned'),
    ).toHaveLength(0)
    expect(
      queryStudioShortcuts(runtime.actions, runtime.keyboard, 'no matching action'),
    ).toHaveLength(0)
  })
})
