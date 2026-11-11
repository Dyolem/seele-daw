import { createDeferredActionResult } from '@/workbench/actions/__tests__/support/deferred-action-test-support'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createActionInvocationFixture } from '@/workbench/actions/__tests__/support/studio-action-definition-test-support'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import {
  STUDIO_ACTION_COMPLETED,
  type StudioActionFailure,
  type StudioActionCompletion,
  type StudioActionId,
} from '@/workbench/actions/studio-action'
import { STUDIO_ACTIONS } from '@/bootstrap/studio-actions'
import { createStudioActionCoordinator } from '@/workbench/actions/studio-action-coordinator'

describe('Studio Action invocation', () => {
  it('lists every module that declares action IDs in the catalogue', () => {
    expectTypeOf<StudioActionId>().toEqualTypeOf<(typeof STUDIO_ACTIONS)[number]['id']>()
  })

  it('exposes the immutable catalogue without mounting any target or supplying a key binding', () => {
    const { runtime, bindingRegistry } = createTestStudioActionRuntime({
      keymap: { 'project.save': [] },
    })
    const ids = runtime.actions.catalogue.map(({ id }) => id)
    expect(ids).toEqual(STUDIO_ACTIONS.map(({ id }) => id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(
      runtime.actions.catalogue.every(
        (descriptor) => Object.isFrozen(descriptor) && !('resolve' in descriptor),
      ),
    ).toBe(true)
    expect(Object.isFrozen(runtime.actions.catalogue)).toBe(true)
    expect(bindingRegistry.listeners.has('Mod+S')).toBe(false)
    expect(runtime.actions.presentationFor('project.save').enabled).toBe(false)
    expect(runtime.actions.invoke('project.save', 'menu').status).toBe('unavailable')
  })

  it.each(['menu', 'toolbar', 'keyboard', 'context-menu'] as const)(
    'uses the same handler and checks current capability for %s',
    async (source) => {
      const { actions, targets } = createActionInvocationFixture()
      const execute = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
      let enabled = true
      targets.bind({
        execute,
        state: () => ({ disabledReason: enabled ? null : 'Saving', busy: !enabled }),
      })
      expect(actions.presentationFor('project.save').enabled).toBe(true)
      enabled = false
      expect(actions.invoke('project.save', source).status).toBe('unavailable')
      expect(execute).not.toHaveBeenCalled()
      enabled = true
      const invocation = actions.invoke('project.save', source)
      expect(execute).toHaveBeenCalledOnce()
      if (invocation.status !== 'accepted') throw new Error('Expected accepted action')
      await expect(invocation.completion).resolves.toEqual({ status: 'completed' })
    },
  )

  it.each(['synchronous', 'asynchronous'] as const)(
    'contains a %s handler failure and keeps later invocations usable',
    async (mode) => {
      const { actions, targets, failures } = createActionInvocationFixture()
      const cause = new Error('Command rejected')
      targets.bind({
        execute() {
          if (mode === 'asynchronous') return Promise.reject(cause)
          throw cause
        },
      })
      const invocation = actions.invoke('project.save', 'toolbar')
      if (invocation.status !== 'accepted') throw new Error('Expected accepted action')
      await expect(invocation.completion).resolves.toEqual({
        status: 'failed',
        cause,
        reported: true,
      })
      expect(failures).toEqual([
        { actionId: 'project.save', source: 'toolbar', operation: 'execute', cause },
      ])
      targets.bind({ execute: () => STUDIO_ACTION_COMPLETED })
      const next = actions.invoke('project.save', 'menu')
      if (next.status !== 'accepted') throw new Error('Expected accepted retry')
      await expect(next.completion).resolves.toEqual({ status: 'completed' })
    },
  )

  it('preserves reported business failure without delivering a duplicate notification', async () => {
    const { actions, targets, failures } = createActionInvocationFixture()
    const cause = new Error('Already visible in the save status')
    targets.bind({ execute: () => ({ status: 'failed', cause, reported: true }) })
    const invocation = actions.invoke('project.save', 'menu')
    if (invocation.status !== 'accepted') throw new Error('Expected accepted action')
    await expect(invocation.completion).resolves.toEqual({
      status: 'failed',
      cause,
      reported: true,
    })
    expect(failures).toEqual([])
  })

  it.each([
    ['replace target', 'success'],
    ['replace target', 'rejection'],
    ['release target', 'success'],
    ['release target', 'rejection'],
    ['dispose application', 'success'],
    ['dispose application', 'rejection'],
  ] as const)(
    'settles a pending invocation on %s and ignores its later %s',
    async (mode, outcome) => {
      const { actions, targets, failures } = createActionInvocationFixture()
      const deferred = createDeferredActionResult<StudioActionCompletion>()
      const release = targets.bind({ execute: () => deferred.promise })
      const invocation = actions.invoke('project.save', 'menu')
      if (invocation.status !== 'accepted') throw new Error('Expected accepted action')
      if (mode === 'replace target') targets.bind({ execute: () => STUDIO_ACTION_COMPLETED })
      else if (mode === 'release target') release()
      else actions.dispose()
      await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
      if (outcome === 'success') deferred.resolve(STUDIO_ACTION_COMPLETED)
      else deferred.reject(new Error('Retired project failed later'))
      await Promise.resolve()
      await expect(invocation.completion).resolves.toEqual({ status: 'cancelled' })
      expect(failures).toEqual([])
    },
  )

  it('keeps the replacement target alive after delayed cleanup from its predecessor', async () => {
    const { actions, targets } = createActionInvocationFixture()
    const oldExecute = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const nextExecute = vi.fn<() => StudioActionCompletion>(() => STUDIO_ACTION_COMPLETED)
    const releaseOld = targets.bind({ execute: oldExecute })
    const oldBinding = targets.current
    const releaseNext = targets.bind({ execute: nextExecute })
    releaseOld()
    releaseOld()
    expect(oldBinding?.isCurrent()).toBe(false)
    const invocation = actions.invoke('project.save', 'menu')
    if (invocation.status !== 'accepted') throw new Error('Expected current target')
    await invocation.completion
    expect(oldExecute).not.toHaveBeenCalled()
    expect(nextExecute).toHaveBeenCalledOnce()
    releaseNext()
    expect(actions.invoke('project.save', 'menu').status).toBe('unavailable')
  })

  it('contains presentation and resolution failures and allows a recovered target', () => {
    const { actions, targets, failures } = createActionInvocationFixture()
    const cause = new Error('Presentation failed')
    targets.bind({
      execute: () => STUDIO_ACTION_COMPLETED,
      state: () => {
        throw cause
      },
    })
    expect(actions.presentationFor('project.save').enabled).toBe(false)
    expect(actions.presentationFor('project.save').enabled).toBe(false)
    expect(failures).toHaveLength(1)
    expect(actions.invoke('project.save', 'menu')).toMatchObject({
      status: 'failed',
      failure: { cause, operation: 'resolve' },
    })
    targets.bind({ execute: () => STUDIO_ACTION_COMPLETED })
    expect(actions.presentationFor('project.save').enabled).toBe(true)
  })

  it('rejects a duplicate definition before any handler can run', () => {
    const { action, contexts } = createActionInvocationFixture()
    expect(() =>
      createStudioActionCoordinator({
        actions: [action, action],
        contexts,
        reportFailure: vi.fn<(failure: StudioActionFailure) => void>(),
      }),
    ).toThrow('Invalid or duplicate Studio Action')
  })
})
