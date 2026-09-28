import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  studioKeyboardFileViolation,
  studioKeyboardImportViolation,
} from '../studio-keyboard-boundaries.mjs'

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

  it('rejects deep imports even from bootstrap, including type-only contracts', () => {
    for (const source of [feature, bootstrap]) {
      for (const target of [
        'contracts/studio-keyboard-input',
        'runtime/studio-user-keymap',
        'browser/browser-tanstack-hotkey-registry',
        'vue/studio-keyboard-vue-binding',
      ]) {
        assert.match(violation(source, `${keyboard}/${target}`), /模块外只能导入/)
      }
    }
  })

  it('keeps internal files from depending on either external entry', () => {
    for (const target of [keyboard, `${keyboard}/index.ts`, `${keyboard}/setup.ts`])
      assert.match(violation(`${keyboard}/runtime/studio-user-keymap.ts`, target), /不能反向导入/)
  })

  it('enforces the shared-contract dependency direction and protects the feature entry', () => {
    for (const [source, target] of [
      ['contracts/studio-user-keymap.ts', 'browser/browser-user-keymap-storage'],
      ['keymap/studio-shortcut-catalogue.ts', 'runtime/studio-keyboard-input-router'],
      ['runtime/studio-user-keymap.ts', 'browser/browser-user-keymap-storage'],
      ['browser/browser-tanstack-hotkey-recorder.ts', 'runtime/studio-keyboard-input-router'],
      ['index.ts', 'runtime/studio-user-keymap'],
      ['index.ts', 'browser/browser-tanstack-hotkey-recorder'],
      ['index.ts', 'vue/studio-keyboard-vue-binding'],
    ])
      assert.match(violation(`${keyboard}/${source}`, `${keyboard}/${target}`), /不允许依赖/)
    for (const [source, target] of [
      ['runtime/studio-user-keymap.ts', 'contracts/studio-user-keymap-storage'],
      ['browser/browser-tanstack-hotkey-recorder.ts', 'contracts/studio-shortcut-recorder'],
      ['vue/studio-keyboard-vue-binding.ts', 'runtime/studio-user-keymap'],
      ['setup.ts', 'browser/browser-tanstack-hotkey-recorder'],
    ])
      assert.equal(violation(`${keyboard}/${source}`, `${keyboard}/${target}`), null)
  })

  it('allows test access without making test helpers available to production', () => {
    const test = 'apps/studio/src/features/project-workspace/__tests__/ProjectWorkspacePage.spec.ts'
    assert.equal(violation(test, `${keyboard}/runtime/studio-user-keymap`), null)
    assert.match(
      violation(feature, `${keyboard}/__tests__/support/studio-keyboard-test-support`),
      /禁止导入测试/,
    )
  })

  it('keeps the root limited to explicit entries and ignores unrelated modules', () => {
    const check = (file, source = '') =>
      studioKeyboardFileViolation(root, path.join(root, file), source)
    assert.match(check(`${keyboard}/extra.ts`), /根层只保留/)
    assert.match(
      check(`${keyboard}/index.ts`, "export * from './runtime/studio-user-keymap'"),
      /明确列出导出项/,
    )
    assert.match(
      check(`${keyboard}/setup.ts`, "export type * from './contracts/studio-keyboard-input'"),
      /明确列出导出项/,
    )
    assert.equal(
      check(
        `${keyboard}/index.ts`,
        "export type { StudioKeyboardInput } from './contracts/studio-keyboard-input'",
      ),
      null,
    )
    assert.equal(violation(feature, 'apps/studio/src/workbench/keyboard-extra/internal.ts'), null)
    assert.equal(studioKeyboardImportViolation(root, path.join(root, feature), undefined), null)
  })
})
