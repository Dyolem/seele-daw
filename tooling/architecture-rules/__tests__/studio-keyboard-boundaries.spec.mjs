import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { studioKeyboardImportViolation } from '../studio-keyboard-boundaries.mjs'

const root = path.resolve('keyboard-boundary-fixture')
const keyboard = 'apps/studio/src/workbench/keyboard'
const feature = 'apps/studio/src/features/keyboard-shortcuts/StudioShortcutEditor.vue'
const bootstrap = 'apps/studio/src/bootstrap/studio-action-runtime.ts'
const violation = (source, target) =>
  studioKeyboardImportViolation(root, path.join(root, source), path.join(root, target))

describe('Studio Keyboard module boundaries', () => {
  it('permits the feature API and limits the construction entry to bootstrap', () => {
    for (const target of [keyboard, `${keyboard}/index`, `${keyboard}/index.ts`])
      assert.equal(violation(feature, target), null)
    assert.equal(violation(bootstrap, `${keyboard}/setup.ts`), null)
    assert.match(violation(feature, `${keyboard}/setup`), /仅 Studio bootstrap/)
    assert.match(
      violation('apps/studio/src/bootstrap-lookalike/fake.ts', `${keyboard}/setup`),
      /仅 Studio bootstrap/,
    )
  })

  it('rejects deep imports from outside, including type-only contracts', () => {
    for (const source of [feature, bootstrap]) {
      for (const target of [
        'contracts/studio-keyboard-input',
        'runtime/studio-user-keymap',
        'browser/browser-tanstack-hotkey-registry',
      ]) {
        assert.match(violation(source, `${keyboard}/${target}`), /模块外只能导入/)
      }
    }
  })

  it('keeps internal files from depending on either external entry', () => {
    for (const target of [keyboard, `${keyboard}/index.ts`, `${keyboard}/setup.ts`])
      assert.match(violation(`${keyboard}/runtime/studio-user-keymap.ts`, target), /不能反向导入/)
  })

  it('lets the runtime and browser layers meet only through contracts', () => {
    for (const [source, target] of [
      ['contracts/studio-user-keymap.ts', 'runtime/studio-user-keymap'],
      ['contracts/studio-user-keymap.ts', 'browser/browser-user-keymap-storage'],
      ['runtime/studio-user-keymap.ts', 'browser/browser-user-keymap-storage'],
      ['browser/browser-tanstack-hotkey-recorder.ts', 'runtime/studio-keyboard-input-router'],
      ['index.ts', 'browser/browser-tanstack-hotkey-recorder'],
      ['extra.ts', 'runtime/studio-user-keymap'],
    ])
      assert.match(violation(`${keyboard}/${source}`, `${keyboard}/${target}`), /不允许依赖/)
    for (const [source, target] of [
      ['runtime/studio-user-keymap.ts', 'contracts/studio-user-keymap-storage'],
      ['runtime/studio-keyboard-input-router.ts', 'runtime/studio-keyboard-routes'],
      ['browser/browser-tanstack-hotkey-recorder.ts', 'contracts/studio-shortcut-recorder'],
      ['index.ts', 'runtime/studio-shortcut-catalogue'],
      ['setup.ts', 'browser/browser-tanstack-hotkey-recorder'],
    ])
      assert.equal(violation(`${keyboard}/${source}`, `${keyboard}/${target}`), null)
  })

  it('lets tests reach internal files and ignores unrelated modules', () => {
    const test = 'apps/studio/src/features/project-workspace/__tests__/ProjectWorkspacePage.spec.ts'
    assert.equal(violation(test, `${keyboard}/runtime/studio-user-keymap`), null)
    assert.equal(violation(feature, 'apps/studio/src/workbench/keyboard-extra/internal.ts'), null)
    assert.equal(studioKeyboardImportViolation(root, path.join(root, feature), undefined), null)
  })
})
