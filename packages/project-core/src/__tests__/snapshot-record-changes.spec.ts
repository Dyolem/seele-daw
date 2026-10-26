import { describe, expect, it } from 'vitest'

import { diffSnapshotRecords } from '#internal/index'

const record = (id: string, value = 0) => Object.freeze({ id, value })

describe('diffSnapshotRecords', () => {
  it('reports added, removed and rewritten records and passes over the same objects', () => {
    const kept = record('b')
    const rewrittenBefore = record('c', 1)
    const rewrittenAfter = record('c', 2)
    const added = record('d')
    const previous = [record('a'), kept, rewrittenBefore]
    const next = [kept, rewrittenAfter, added]

    const changes = diffSnapshotRecords(previous, next)

    expect([...changes.droppedIds]).toEqual(['a', 'c'])
    expect(changes.written).toEqual([rewrittenAfter, added])
  })

  it('finds nothing between the same records', () => {
    const records = [record('a'), record('b')]
    const changes = diffSnapshotRecords(records, [...records])

    expect(changes.droppedIds.size).toBe(0)
    expect(changes.written).toEqual([])
  })
})
