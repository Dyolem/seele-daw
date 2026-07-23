import { parseProjectId, type ProjectContentStateId, type ProjectId } from '@seele-daw/project-core'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import { ACTIVE_PROJECT_SAVE_STATUS } from '@/workbench/project/active-project-state'
import {
  PROJECT_NAVIGATION_DECISION,
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationDecisionRequest,
  type ProjectNavigationIntent,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { PROJECT_NAVIGATION_DECISION_CONTEXT_KEY } from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import {
  createProjectNavigationDecisionVueBinding,
  type ProjectNavigationDecisionVueBinding,
} from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'

interface DialogFixture {
  readonly binding: ProjectNavigationDecisionVueBinding
  readonly wrapper: VueWrapper
}

const fixtures: DialogFixture[] = []

function createRequest(
  suffix: string,
  intent: ProjectNavigationIntent,
  previousSaveFailure: unknown = null,
): ProjectNavigationDecisionRequest {
  return Object.freeze({
    intent,
    activeProjectId: parseProjectId(`navigation-dialog-active-${suffix}`),
    contentStateId: Symbol(`NavigationDialog-${suffix}`) as ProjectContentStateId,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    previousSaveFailure,
  })
}

function createIntent(
  kind: ProjectNavigationIntent['kind'],
  projectId?: ProjectId,
): ProjectNavigationIntent {
  switch (kind) {
    case PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT:
      return Object.freeze({ kind })
    case PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT:
      return Object.freeze({ kind })
    case PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT:
      if (projectId === undefined) throw new Error('Open Project intent requires a Project ID')
      return Object.freeze({ kind, projectId })
  }
}

function mountDialog(): DialogFixture {
  const binding = createProjectNavigationDecisionVueBinding()
  const wrapper = mount(ProjectNavigationDecisionDialog, {
    attachTo: document.body,
    global: {
      provide: {
        [PROJECT_NAVIGATION_DECISION_CONTEXT_KEY as symbol]: binding.context,
      },
    },
  })
  const fixture = { binding, wrapper }
  fixtures.push(fixture)
  return fixture
}

function findButton(label: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (button === undefined) throw new Error(`Expected a ${label} button`)
  return button
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.wrapper.unmount()
    fixture.binding.dispose()
  }
  document.body.innerHTML = ''
})

describe('ProjectNavigationDecisionDialog', () => {
  it('does not render a modal without a pending decision', () => {
    mountDialog()

    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it.each([
    {
      kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
      title: 'Save changes before creating a new project?',
    },
    {
      kind: PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT,
      title: 'Save changes before opening another project?',
    },
    {
      kind: PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT,
      title: 'Save changes before leaving this project?',
    },
  ] as const)('describes the $kind destination', async ({ kind, title }) => {
    const fixture = mountDialog()
    const targetProjectId = parseProjectId(`navigation-dialog-target-${kind}`)
    const decision = fixture.binding.requestDecision(
      createRequest(
        kind,
        createIntent(
          kind,
          kind === PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT ? targetProjectId : undefined,
        ),
      ),
    )
    await nextTick()

    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain(title)
    findButton('Cancel').click()
    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
  })

  it.each([
    { label: 'Save', decision: PROJECT_NAVIGATION_DECISION.SAVE },
    { label: 'Discard', decision: PROJECT_NAVIGATION_DECISION.DISCARD },
    { label: 'Cancel', decision: PROJECT_NAVIGATION_DECISION.CANCEL },
  ] as const)(
    'resolves $label through the rendered pending capability',
    async ({ label, decision: expectedDecision }) => {
      const fixture = mountDialog()
      const decision = fixture.binding.requestDecision(
        createRequest('actions', createIntent(PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT)),
      )
      await nextTick()

      findButton(label).click()

      await expect(decision).resolves.toBe(expectedDecision)
      expect(fixture.binding.context.pendingDecision.value).toBeNull()
    },
  )

  it('maps Escape to Cancel', async () => {
    const fixture = mountDialog()
    const decision = fixture.binding.requestDecision(
      createRequest('escape', createIntent(PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT)),
    )
    await nextTick()
    const dialog = document.body.querySelector('[role="alertdialog"]')
    if (dialog === null) throw new Error('Expected the Project Navigation Decision Dialog')

    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))

    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
  })

  it('explains a previous save failure without taking over save behavior', async () => {
    const fixture = mountDialog()
    const decision = fixture.binding.requestDecision(
      createRequest(
        'failure',
        createIntent(PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT),
        new Error('Checkpoint storage is unavailable'),
      ),
    )
    await nextTick()

    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'Checkpoint storage is unavailable',
    )
    findButton('Cancel').click()
    await expect(decision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
  })

  it('rejects an event from stale DOM after a newer request takes the dialog slot', async () => {
    const fixture = mountDialog()
    const firstDecision = fixture.binding.requestDecision(
      createRequest('first', createIntent(PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT)),
    )
    await nextTick()
    const staleSaveButton = findButton('Save')

    const secondDecision = fixture.binding.requestDecision(
      createRequest('second', createIntent(PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT)),
    )
    staleSaveButton.click()

    await expect(firstDecision).resolves.toBe(PROJECT_NAVIGATION_DECISION.CANCEL)
    expect(fixture.binding.context.pendingDecision.value?.request.activeProjectId).toBe(
      parseProjectId('navigation-dialog-active-second'),
    )

    await nextTick()
    findButton('Discard').click()
    await expect(secondDecision).resolves.toBe(PROJECT_NAVIGATION_DECISION.DISCARD)
  })
})
