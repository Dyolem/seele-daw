import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { findCycles, runtimeImportsFrom } from '../import-cycles.mjs'

describe('runtime imports', () => {
  it('collects static, side-effect, re-exported and dynamic imports', () => {
    const source = `
      import a from './a'
      import { b, type B } from '#internal/b'
      import {
        c,
        d,
      } from '@/c'
      import './side-effect'
      export { e } from './e'
      export * from './f'
      const g = await import('./g')
    `
    assert.deepEqual(
      [...runtimeImportsFrom(source)].sort(),
      ['#internal/b', './a', './e', './f', './g', './side-effect', '@/c'].sort(),
    )
  })

  it('ignores statements the compiler erases', () => {
    const source = `
      import type { A } from './a'
      import type B from './b'
      export type { C } from './c'
      export const from = 'not-an-import'
    `
    assert.deepEqual([...runtimeImportsFrom(source)], [])
  })
})

describe('cycles', () => {
  const graph = (edges) =>
    new Map(Object.entries(edges).map(([node, next]) => [node, new Set(next)]))

  it('finds none in a tree or a diamond', () => {
    assert.deepEqual(findCycles(graph({ a: ['b', 'c'], b: ['d'], c: ['d'], d: [] })), [])
  })

  it('reports each group of nodes that reach each other', () => {
    assert.deepEqual(
      findCycles(graph({ a: ['b'], b: ['c'], c: ['a'], d: ['e'], e: ['d'], f: ['a'] })).sort(),
      [
        ['a', 'b', 'c'],
        ['d', 'e'],
      ],
    )
  })

  it('ignores self-imports and edges to nodes outside the graph', () => {
    assert.deepEqual(findCycles(graph({ a: ['a', 'missing'], b: ['a'] })), [])
  })
})
