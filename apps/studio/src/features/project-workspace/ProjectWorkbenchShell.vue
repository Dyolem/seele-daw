<script setup lang="ts">
import type { ProjectSession, Tick } from '@seele-daw/project-core'
import OptionsIcon from '~icons/fluent/options-20-regular'
import { shallowRef } from 'vue'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/types/piano-roll-presentation'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import type { ProjectWorkbenchActionControls } from '@/features/project-workspace/actions/project-workbench-action-controls'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import ProjectWorkbenchTransport from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTransport.vue'
import ProjectWorkbenchWorkspace from '@/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue'
import type { ProjectWorkbenchWorkspaceHandle } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import type { ActiveProjectSaveStatus } from '@/workbench/project/active-project-state'

interface ProjectWorkbenchShellProps {
  readonly actionControls: ProjectWorkbenchActionControls
  readonly barSpanTick: Tick
  readonly clips: readonly ProjectMidiClipPresentation[]
  readonly isDirty: boolean
  readonly pianoRollPresentation: ProjectPianoRollPresentation | null
  readonly pianoRollTrackPresentation: ProjectPianoRollTrackPresentation | null
  readonly playbackFeedback: string | null
  readonly playbackTime: string
  readonly projectId: string
  readonly projectName: string
  readonly projectSession: Pick<ProjectSession, 'query' | 'subscribe' | 'modelRevision'>
  readonly saveFailureMessage?: string | null
  readonly saveStatus: ActiveProjectSaveStatus
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
  readonly tracks: readonly ProjectTrackPresentation[]
}

const props = withDefaults(defineProps<ProjectWorkbenchShellProps>(), {
  saveFailureMessage: null,
})
const { actions } = useStudioActions()

const workspace = shallowRef<ProjectWorkbenchWorkspaceHandle | null>(null)
defineExpose<ProjectWorkbenchWorkspaceHandle>({
  getMidiEditor: () => workspace.value?.getMidiEditor() ?? null,
})
</script>

<template>
  <div class="project-workbench">
    <ProjectWorkbenchGlobalBar
      :action-controls="props.actionControls"
      :is-dirty="props.isDirty"
      :project-id="props.projectId"
      :project-name="props.projectName"
      :save-failure-message="props.saveFailureMessage"
      :save-status="props.saveStatus"
    />

    <ProjectWorkbenchTransport
      :action-controls="props.actionControls"
      :playback-feedback="props.playbackFeedback"
      :playback-time="props.playbackTime"
      :time-signature-denominator="props.timeSignatureDenominator"
      :time-signature-numerator="props.timeSignatureNumerator"
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

      <ProjectWorkbenchWorkspace
        ref="workspace"
        :bar-span-tick="props.barSpanTick"
        :clips="props.clips"
        :midi-import-action="props.actionControls.importMidiTracks"
        :piano-roll-presentation="props.pianoRollPresentation"
        :piano-roll-track-presentation="props.pianoRollTrackPresentation"
        :project-id="props.projectId"
        :project-session="props.projectSession"
        :time-signature-numerator="props.timeSignatureNumerator"
        :timeline-end-tick="props.timelineEndTick"
        :tracks="props.tracks"
      />
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
