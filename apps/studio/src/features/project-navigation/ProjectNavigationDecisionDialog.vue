<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'

import UiAlertDialog from '@/ui/components/UiAlertDialog.vue'
import UiButton from '@/ui/components/UiButton.vue'
import {
  PROJECT_NAVIGATION_DECISION,
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationDecision,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import {
  useProjectNavigationDecision,
  type PendingProjectNavigationDecision,
} from '@/workbench/project/navigation/vue/project-navigation-decision-context'

const decisionContext = useProjectNavigationDecision()
const renderedPending = shallowRef<PendingProjectNavigationDecision | null>(
  decisionContext.pendingDecision.value,
)

// Keep the capability used by event handlers aligned with the request represented by the DOM.
watch(decisionContext.pendingDecision, (pending) => {
  renderedPending.value = pending
})

const destination = computed(() => {
  const pending = renderedPending.value
  if (pending === null) return 'leaving this project'

  switch (pending.request.intent.kind) {
    case PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT:
      return 'creating a new project'
    case PROJECT_NAVIGATION_INTENT_KIND.OPEN_PROJECT:
      return 'opening another project'
    case PROJECT_NAVIGATION_INTENT_KIND.LEAVE_PROJECT:
      return 'leaving this project'
    default:
      return 'leaving this project'
  }
})

const previousSaveFailureMessage = computed(() => {
  const failure = renderedPending.value?.request.previousSaveFailure
  if (failure === null || failure === undefined) return null

  if (failure instanceof Error && failure.message.trim().length > 0) {
    return `The previous save attempt failed: ${failure.message}`
  }

  return 'The previous save attempt failed. You can try saving again.'
})

function resolveRenderedDecision(decision: ProjectNavigationDecision): void {
  const pending = renderedPending.value
  if (pending !== null) decisionContext.resolve(pending, decision)
}
</script>

<template>
  <UiAlertDialog
    :open="renderedPending !== null"
    @request-close="resolveRenderedDecision(PROJECT_NAVIGATION_DECISION.CANCEL)"
  >
    <template #title>Save changes before {{ destination }}?</template>
    <template #description>
      The current project has unsaved changes. Save them, discard them for this navigation, or
      cancel and keep editing.
    </template>

    <div v-if="renderedPending" class="project-navigation-dialog__project">
      <span>Current project</span>
      <code>{{ renderedPending.request.activeProjectId }}</code>
    </div>
    <p v-if="previousSaveFailureMessage" class="project-navigation-dialog__failure" role="alert">
      {{ previousSaveFailureMessage }}
    </p>

    <template #cancel>
      <UiButton variant="secondary">Cancel</UiButton>
    </template>
    <template #actions>
      <UiButton
        variant="danger"
        @click="resolveRenderedDecision(PROJECT_NAVIGATION_DECISION.DISCARD)"
      >
        Discard
      </UiButton>
      <UiButton
        variant="primary"
        @click="resolveRenderedDecision(PROJECT_NAVIGATION_DECISION.SAVE)"
      >
        Save
      </UiButton>
    </template>
  </UiAlertDialog>
</template>

<style scoped>
.project-navigation-dialog__project {
  display: grid;
  gap: var(--sd-space-2);
  padding: var(--sd-space-3) var(--sd-space-4);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
}

.project-navigation-dialog__project span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.project-navigation-dialog__project code {
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-navigation-dialog__failure {
  margin: var(--sd-space-3) 0 0;
  padding: var(--sd-space-3) var(--sd-space-4);
  border-inline-start: 2px solid var(--sd-color-state-danger);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-control-danger-text);
  background: var(--sd-color-control-danger);
  font-size: var(--sd-font-size-sm);
  line-height: var(--sd-line-height-default);
}
</style>
