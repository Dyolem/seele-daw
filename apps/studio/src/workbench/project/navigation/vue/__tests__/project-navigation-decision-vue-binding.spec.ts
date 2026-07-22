import { parseProjectId, type ProjectContentStateId } from '@seele-daw/project-core'
import { createApp, isProxy, isReadonly, isShallow } from 'vue'
import { describe, expect, it } from 'vitest'

import { ACTIVE_PROJECT_SAVE_STATUS } from '@/workbench/project/active-project-state'
import {
  PROJECT_NAVIGATION_DECISION,
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationDecisionRequest,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import {
  PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
  useProjectNavigationDecision,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import { createProjectNavigationDecisionVueBinding } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'
import { ProjectNavigationDecisionVueError } from '@/workbench/project/navigation/vue/project-navigation-decision-vue-error'

function createDecisionRequest(suffix: string): ProjectNavigationDecisionRequest {
  return Object.freeze({
    intent: Object.freeze({ kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT }),
    activeProjectId: parseProjectId(`project-navigation-decision-${suffix}`),
    contentStateId: Symbol(`ProjectNavigationDecision-${suffix}`) as ProjectContentStateId,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    previousSaveFailure: null,
  })
}

describe('ProjectNavigationDecisionVueBinding', () => {
  it('publishes one shallow readonly pending request and resolves its Promise once', async () => {
    const binding = createProjectNavigationDecisionVueBinding()
    const request = createDecisionRequest('resolve')
    const decision = binding.requestDecision(request)
    const pending = binding.context.pendingDecision.value

    expect(pending).not.toBeNull()
    if (pending === null) throw new Error('Expected a pending navigation decision')
    expect(pending.request).toBe(request)
    expect(Object.isFrozen(pending)).toBe(true)
    expect(Object.isFrozen(binding.context)).toBe(true)
    expect(isShallow(binding.context.pendingDecision)).toBe(true)
    expect(isReadonly(binding.context.pendingDecision)).toBe(true)
    expect(isProxy(pending)).toBe(false)
    expect(isProxy(pending.request)).toBe(false)

    expect(binding.context.resolve(pending, PROJECT_NAVIGATION_DECISION.SAVE)).toBe(true)
    expect(binding.context.pendingDecision.value).toBeNull()
    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.SAVE)
    expect(binding.context.resolve(pending, PROJECT_NAVIGATION_DECISION.DISCARD)).toBe(false)

    binding.dispose()
  })

  it('replaces an older request, cancels its caller, and rejects stale UI events', async () => {
    const binding = createProjectNavigationDecisionVueBinding()
    const firstDecision = binding.requestDecision(createDecisionRequest('first'))
    const firstPending = binding.context.pendingDecision.value
    if (firstPending === null) throw new Error('Expected the first pending decision')

    const secondDecision = binding.requestDecision(createDecisionRequest('second'))
    const secondPending = binding.context.pendingDecision.value
    if (secondPending === null) throw new Error('Expected the second pending decision')

    expect(secondPending).not.toBe(firstPending)
    expect(binding.context.pendingDecision.value).toBe(secondPending)
    await expect(firstDecision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
    expect(binding.context.resolve(firstPending, PROJECT_NAVIGATION_DECISION.DISCARD)).toBe(false)
    expect(binding.context.pendingDecision.value).toBe(secondPending)

    expect(binding.context.resolve(secondPending, PROJECT_NAVIGATION_DECISION.DISCARD)).toBe(true)
    await expect(secondDecision).resolves.toBe(PROJECT_NAVIGATION_DECISION.DISCARD)
    binding.dispose()
  })

  it('keeps the current request pending when UI supplies an invalid runtime decision', async () => {
    const binding = createProjectNavigationDecisionVueBinding()
    const decision = binding.requestDecision(createDecisionRequest('invalid'))
    const pending = binding.context.pendingDecision.value
    if (pending === null) throw new Error('Expected a pending navigation decision')

    expect(() => binding.context.resolve(pending, 'unsupported' as never)).toThrowError(
      expect.objectContaining({
        name: 'ProjectNavigationDecisionVueError',
        code: 'invalid-decision',
      }),
    )
    expect(binding.context.pendingDecision.value).toBe(pending)

    binding.context.resolve(pending, PROJECT_NAVIGATION_DECISION.CANCEL)
    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
    binding.dispose()
  })

  it('cancels a pending request on dispose and rejects requests after disposal', async () => {
    const binding = createProjectNavigationDecisionVueBinding()
    const request = createDecisionRequest('dispose')
    const decision = binding.requestDecision(request)
    const pending = binding.context.pendingDecision.value
    if (pending === null) throw new Error('Expected a pending navigation decision')

    binding.dispose()
    binding.dispose()

    expect(binding.context.pendingDecision.value).toBeNull()
    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
    expect(binding.context.resolve(pending, PROJECT_NAVIGATION_DECISION.SAVE)).toBe(false)
    await expect(binding.requestDecision(request)).rejects.toMatchObject({
      name: 'ProjectNavigationDecisionVueError',
      code: 'binding-disposed',
    })
  })

  it('provides a scoped Context and reports a missing Provider explicitly', () => {
    const binding = createProjectNavigationDecisionVueBinding()
    const providedApp = createApp({ render: () => null })
    providedApp.provide(PROJECT_NAVIGATION_DECISION_CONTEXT_KEY, binding.context)
    const missingApp = createApp({ render: () => null })

    expect(providedApp.runWithContext(() => useProjectNavigationDecision())).toBe(binding.context)
    expect(() => missingApp.runWithContext(() => useProjectNavigationDecision())).toThrowError(
      expect.objectContaining({
        name: 'ProjectNavigationDecisionVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectNavigationDecision())).toThrow(
      ProjectNavigationDecisionVueError,
    )
    binding.dispose()
  })
})
