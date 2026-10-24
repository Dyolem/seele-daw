<script setup lang="ts">
import OptionsIcon from '~icons/fluent/options-20-regular'
import { computed, shallowRef, toRef } from 'vue'

import type { ProjectWorkbenchActionControls } from '@/features/project-workspace/actions/project-workbench-action-controls'
import { provideProjectWorkspace } from '@/features/project-workspace/project-workspace'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import ProjectWorkbenchTransport from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTransport.vue'
import ProjectWorkbenchWorkspace from '@/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue'
import type { ProjectWorkbenchWorkspaceHandle } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import type { ReadyActiveProjectState } from '@/workbench/project/active-project-state'

const props = defineProps<{
  readonly actionControls: ProjectWorkbenchActionControls
  readonly readyProject: ReadyActiveProjectState
}>()
const { actions } = useStudioActions()
const { project } = provideProjectWorkspace(
  toRef(props, 'readyProject'),
  toRef(props, 'actionControls'),
)
const saveFailureMessage = computed(() => {
  const failure = props.readyProject.saveFailure
  if (failure instanceof Error && failure.message.trim().length > 0) return failure.message
  return failure === null ? null : 'The project could not be saved.'
})

const workspace = shallowRef<ProjectWorkbenchWorkspaceHandle | null>(null)
defineExpose<ProjectWorkbenchWorkspaceHandle>({
  getMidiEditor: () => workspace.value?.getMidiEditor() ?? null,
})
</script>

<template>
  <div class="project-workbench">
    <ProjectWorkbenchGlobalBar
      :action-controls="props.actionControls"
      :is-dirty="props.readyProject.isDirty"
      :project-id="props.readyProject.projectId"
      :project-name="project.projectName"
      :save-failure-message="saveFailureMessage"
      :save-status="props.readyProject.saveStatus"
    />

    <ProjectWorkbenchTransport
      :action-controls="props.actionControls"
      :time-signature-denominator="project.timeSignatureDenominator"
      :time-signature-numerator="project.timeSignatureNumerator"
    />

    <main class="project-workbench__main">
      <section class="project-workbench__compact-warning">
        <UiIcon :icon="OptionsIcon" :size="24" />
        <p>Seele Studio’s editing workspace requires a viewport at least 900 px wide.</p>
        <UiButton
          variant="secondary"
          :busy="props.actionControls.projects.busy"
          :disabled="!props.actionControls.projects.enabled"
          :title="props.actionControls.projects.title"
          @click="actions.invoke(props.actionControls.projects.actionId, 'toolbar')"
          >Back to projects</UiButton
        >
      </section>

      <ProjectWorkbenchWorkspace ref="workspace" />
    </main>
  </div>
</template>

<style scoped>
.project-workbench {
  display: grid;
  min-block-size: 100vh;
  block-size: 100vh;
  grid-template-rows: 3.25rem 3rem minmax(0, 1fr);
  overflow: hidden;
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-workspace);
}

.project-workbench__main {
  min-block-size: 0;
}

.project-workbench__compact-warning {
  display: none;
}

@media (max-width: 56.1875rem) {
  .project-workbench {
    grid-template-rows: 3.25rem minmax(0, 1fr);
  }

  .project-workbench__compact-warning {
    display: grid;
    block-size: 100%;
    place-items: center;
    align-content: center;
    gap: var(--sd-space-4);
    padding: var(--sd-space-8);
    color: var(--sd-color-text-secondary);
    text-align: center;
    background: var(--sd-color-surface-workspace);
  }

  .project-workbench__compact-warning p {
    max-inline-size: 28rem;
    margin: 0;
    line-height: var(--sd-line-height-relaxed);
  }
}
</style>
