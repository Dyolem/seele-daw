import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { symbolFileViolation } from '../symbol-boundaries.mjs'

const root = path.resolve('symbol-boundary-fixture')
const violation = (file, source) => symbolFileViolation(root, path.join(root, file), source)

describe('Symbol catalogue boundaries', () => {
  it('requires every production producer to use its owner catalogue while allowing test identities and well-known Symbols', () => {
    for (const file of [
      'apps/studio/src/feature.ts',
      'packages/editor/src/browser/adapter.ts',
      'packages/project-core/src/history/controller.ts',
    ]) {
      assert.match(violation(file, "const key = Symbol('key')"), /集中注册/)
      assert.equal(violation(file, 'const iterator = object[Symbol.iterator]()'), null)
      assert.equal(violation(file, "// Symbol('example')\nconst key = REGISTERED_KEY"), null)
    }
    assert.equal(
      violation('apps/studio/src/__tests__/identity.spec.ts', "const key = Symbol('fixture')"),
      null,
    )
  })

  it('keeps catalogues free from consumer runtime imports and process-global identity reuse', () => {
    for (const file of [
      'apps/studio/src/symbols.ts',
      'packages/editor/src/common/interaction/interaction-symbols.ts',
      'packages/project-core/src/project-symbols.ts',
    ]) {
      assert.equal(
        violation(file, "import type { Key } from './contract'\nconst key: Key = Symbol('key')"),
        null,
      )
      assert.match(violation(file, "import { consumer } from './consumer'"), /type import/)
      assert.match(violation(file, "const key = Symbol.for('interaction')"), /全局注册表/)
    }
  })
})
