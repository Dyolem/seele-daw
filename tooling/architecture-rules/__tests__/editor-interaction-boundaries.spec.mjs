import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  editorInteractionFileViolation,
  editorInteractionImportViolation,
} from '../editor-interaction-boundaries.mjs'

const root = path.resolve('interaction-boundary-fixture')
const common = 'packages/editor/src/common/interaction'
const browser = 'packages/editor/src/browser/interaction'
const violation = (source, target, specifier = '') =>
  editorInteractionImportViolation(
    root,
    path.join(root, source),
    target ? path.join(root, target) : null,
    specifier,
  )

describe('Editor Interaction boundaries', () => {
  it('allows composition toward the protocol and rejects domain, barrel and Browser dependencies in Common', () => {
    assert.equal(
      violation(`${common}/interaction-session.ts`, `${common}/editor-pointer-input.ts`),
      null,
    )
    assert.equal(
      violation(`${browser}/editor-pointer-input-adapter.ts`, `${common}/editor-pointer-input.ts`),
      null,
    )
    assert.equal(
      violation(
        'packages/editor/src/common/piano-roll/interaction/session.ts',
        `${common}/interaction-session.ts`,
      ),
      null,
    )
    for (const source of [
      `${common}/interaction-session.ts`,
      `${browser}/editor-pointer-input-adapter.ts`,
    ]) {
      for (const target of [
        'packages/editor/src/common/piano-roll/piano-roll-input.ts',
        'packages/editor/src/index.ts',
      ])
        assert.match(violation(source, target), /中立层/)
      assert.match(violation(source, null, '@seele-daw/project-core'), /中立层/)
    }
    assert.match(
      violation(`${common}/interaction-session.ts`, `${browser}/editor-pointer-input-adapter.ts`),
      /中立层/,
    )
  })

  it('rejects DOM types and globals in Common while permitting the Browser adapter', () => {
    for (const code of [
      'const target: HTMLElement = surface',
      'window.addEventListener("blur", cancel)',
      'function update(input: PointerEvent) {}',
    ])
      assert.match(
        editorInteractionFileViolation(root, path.join(root, common, 'session.ts'), code),
        /DOM/,
      )
    assert.equal(
      editorInteractionFileViolation(
        root,
        path.join(root, common, 'session.ts'),
        '/** No PointerEvent or window here. */\nexport type Input = number',
      ),
      null,
    )
    assert.equal(
      editorInteractionFileViolation(
        root,
        path.join(root, browser, 'adapter.ts'),
        'const target: HTMLElement = surface',
      ),
      null,
    )
  })
})
