import { describe, expect, it, vi } from 'vitest'

import {
  InteractionSession,
  type InteractionOperation,
} from '#internal/common/interaction/interaction-session'

function createOperation(): InteractionOperation<number, number, { position: number }> {
  return {
    update: (position) => position,
    complete: (position) => ({ preview: position, result: { position } }),
  }
}

describe('Interaction Session', () => {
  it('completes a view operation without a Project, DOM or revision handoff', () => {
    const session = new InteractionSession<number, number, { position: number }>()
    const interactionId = session.begin(createOperation())!
    session.update(interactionId, 42)
    expect(session.state.preview).toBe(42)
    expect(session.complete(interactionId, 64)).toEqual({ position: 64 })
    expect(session.claimCompletion(interactionId)).toBe(true)
    expect(session.claimCompletion(interactionId)).toBe(false)
    expect(session.complete(interactionId, 80)).toBeNull()
    expect(session.finish(interactionId)).toBe(true)
    expect(session.state).toMatchObject({ phase: 'finished', preview: null })
  })

  it('ignores stale input and completion after cancellation and a new Begin', () => {
    const session = new InteractionSession<number, number, { position: number }>()
    const previous = session.begin(createOperation())!
    expect(session.cancel(previous)).toBe(true)
    expect(session.cancel(previous)).toBe(false)
    const current = session.begin(createOperation())!
    expect(current).not.toBe(previous)
    session.update(current, 20)
    session.update(previous, 99)
    expect(session.complete(previous, 99)).toBeNull()
    expect(session.claimCompletion(previous)).toBe(false)
    expect(session.finish(previous)).toBe(false)
    expect(session.cancel(previous)).toBe(false)
    expect(session.state).toMatchObject({ interactionId: current, preview: 20, phase: 'active' })
    session.dispose()
    session.dispose()
    expect(session.complete(current, 30)).toBeNull()
    expect(session.begin(createOperation())).toBeNull()
  })

  it('does not replace an active operation or an unconsumed completion', () => {
    const session = new InteractionSession<number, number, { position: number }>()
    const interactionId = session.begin(createOperation())!
    expect(session.begin(createOperation())).toBeNull()
    session.complete(interactionId, 10)
    expect(session.begin(createOperation())).toBeNull()
    session.finish(interactionId)
    expect(session.begin(createOperation())).not.toBeNull()
  })

  it('finishes a no-op without exposing an execution capability', () => {
    const session = new InteractionSession<number, number, { position: number }>()
    const interactionId = session.begin({
      update: () => null,
      complete: () => ({ preview: null, result: null }),
    })!
    expect(session.complete(interactionId, 0)).toBeNull()
    expect(session.claimCompletion(interactionId)).toBe(false)
    expect(session.state.phase).toBe('finished')
  })

  it.each(['update', 'complete'] as const)(
    'closes a failed %s and permits a later operation',
    (method) => {
      const session = new InteractionSession<number, number, { position: number }>()
      const failure = new Error('Operation failed')
      const operation = createOperation()
      const failing = vi.spyOn(operation, method).mockImplementation(() => {
        throw failure
      })
      const interactionId = session.begin(operation)!
      expect(() => session[method](interactionId, 10)).toThrow(failure)
      expect(session.state).toMatchObject({ phase: 'cancelled', preview: null })
      expect(session.complete(interactionId, 20)).toBeNull()
      expect(failing).toHaveBeenCalledOnce()
      expect(session.begin(createOperation())).not.toBeNull()
    },
  )

  it('does not publish an old result after an operation reentrantly cancels itself', () => {
    const session = new InteractionSession<number, number, { position: number }>()
    const operation = createOperation()
    const interactionId = session.begin(operation)!
    const complete = vi.spyOn(operation, 'complete').mockImplementation(() => {
      session.cancel(interactionId)
      const next = session.begin(createOperation())!
      session.update(next, 77)
      return { preview: 99, result: { position: 99 } }
    })
    expect(session.complete(interactionId, 99)).toBeNull()
    expect(complete).toHaveBeenCalledOnce()
    expect(session.state).toMatchObject({ phase: 'active', preview: 77 })
  })
})
