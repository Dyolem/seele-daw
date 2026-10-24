import { parseTempoBpm, parseTick } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import { ProjectEditError } from '@/workbench/edits/edit-session'
import { createTempoEdits } from '@/workbench/edits/tempo-edits'
import {
  IDLE_PROJECT,
  createEditTestSession,
  editContextFor,
} from '@/workbench/edits/__tests__/support/edit-test-support'

const stale = expect.objectContaining<Partial<ProjectEditError>>({ code: 'target-stale' })

describe('tempo edits', () => {
  it('adds, moves, re-tempos and removes a Tempo Event', () => {
    const session = createEditTestSession('tempo-lifecycle')
    const tempo = createTempoEdits(editContextFor(session, 'tempo-event-created'))

    const added = tempo.add({ bpm: parseTempoBpm(96.25), tick: parseTick(960) })
    expect(added.tempoEventId).toBe('tempo-event-created')
    expect(added.commit.changes).toMatchObject([{ op: 'insert', table: 'tempoEvents' }])

    expect(tempo.move({ tempoEventId: added.tempoEventId, tick: parseTick(1_920) })).not.toBeNull()
    expect(
      tempo.replaceBpm({ bpm: parseTempoBpm(101.5), tempoEventId: added.tempoEventId }),
    ).not.toBeNull()
    expect(session.getSnapshot().tempoEvents).toContainEqual({
      bpm: 101.5,
      id: 'tempo-event-created',
      tick: 1_920,
    })

    expect(tempo.remove(added.tempoEventId)).not.toBeNull()
    expect(session.getSnapshot().tempoEvents).toHaveLength(1)
  })

  it('returns null for a same-value edit', () => {
    const session = createEditTestSession('tempo-no-change')
    const initial = session.getSnapshot().tempoEvents[0]!

    expect(
      createTempoEdits(editContextFor(session)).replaceBpm({
        bpm: initial.bpm,
        tempoEventId: initial.id,
      }),
    ).toBeNull()
  })

  it.each(['move', 'bpm'] as const)(
    'rejects a %s drag whose captured Session was replaced, even with equal ids and revision',
    (axis) => {
      const original = createEditTestSession('tempo-replaced')
      const replacement = createEditTestSession('tempo-replaced')
      const event = createTempoEdits(editContextFor(original, 'tempo-event')).add({
        bpm: parseTempoBpm(100),
        tick: parseTick(960),
      })
      const tempo = createTempoEdits(editContextFor(replacement, 'tempo-event'))
      tempo.add({ bpm: parseTempoBpm(100), tick: parseTick(960) })
      const target = { expectedSession: original, baseRevision: original.modelRevision }
      const before = replacement.getSnapshot()

      expect(() =>
        axis === 'move'
          ? tempo.move({ target, tempoEventId: event.tempoEventId, tick: parseTick(1_920) })
          : tempo.replaceBpm({ target, tempoEventId: event.tempoEventId, bpm: parseTempoBpm(140) }),
      ).toThrowError(stale)
      expect(replacement.getSnapshot()).toEqual(before)
    },
  )

  it.each(['move', 'bpm'] as const)(
    'rejects a %s drag when another edit landed after the drag began',
    (axis) => {
      const session = createEditTestSession('tempo-revision')
      const tempo = createTempoEdits(editContextFor(session, 'tempo-event'))
      const added = tempo.add({ bpm: parseTempoBpm(100), tick: parseTick(960) })
      const target = { expectedSession: session, baseRevision: session.modelRevision }
      tempo.replaceBpm({
        tempoEventId: session.getSnapshot().tempoEvents[0]!.id,
        bpm: parseTempoBpm(130),
      })
      const before = session.getSnapshot()

      expect(() =>
        axis === 'move'
          ? tempo.move({ target, tempoEventId: added.tempoEventId, tick: parseTick(1_920) })
          : tempo.replaceBpm({ target, tempoEventId: added.tempoEventId, bpm: parseTempoBpm(90) }),
      ).toThrowError(stale)
      expect(session.getSnapshot()).toEqual(before)
    },
  )

  it('does not consume an identity while no project is ready', () => {
    const createId = vi.fn<() => string>(() => 'unused')
    const tempo = createTempoEdits({ activeProject: IDLE_PROJECT, createId })

    expect(() => tempo.add({ bpm: parseTempoBpm(120), tick: parseTick(960) })).toThrowError(
      expect.objectContaining<Partial<ProjectEditError>>({ code: 'project-not-ready' }),
    )
    expect(createId).not.toHaveBeenCalled()
  })
})
