<script setup lang="ts">
import type { ProjectSession, Tick } from '@seele-daw/project-core'
import OptionsIcon from '~icons/fluent/options-20-regular'
import { shallowRef } from 'vue'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import ProjectWorkbenchTransport from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTransport.vue'
import ProjectWorkbenchWorkspace from '@/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue'
import type { ProjectWorkbenchWorkspaceHandle } from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import type { ActiveProjectSaveStatus } from '@/workbench/project/active-project-state'

interface ProjectWorkbenchShellProps {
  readonly barSpanTick: Tick
  readonly canRedo: boolean
  readonly canUndo: boolean
  readonly clips: readonly ProjectMidiClipPresentation[]
  readonly isDirty: boolean
  readonly pianoRollPresentation: ProjectPianoRollPresentation | null
  readonly pianoRollTrackPresentation: ProjectPianoRollTrackPresentation | null
  readonly playbackCanToggle: boolean
  readonly playbackCanReturnToLastStartPosition: boolean
  readonly playbackFeedback: string | null
  readonly playbackPhase: 'failed' | 'loading' | 'paused' | 'playing' | 'stopped' | 'unavailable'
  readonly playbackTime: string
  readonly projectId: string
  readonly projectName: string
  readonly projectSession: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly saveFailureMessage?: string | null
  readonly saveStatus: ActiveProjectSaveStatus
  readonly tempo: number
  readonly timeSignatureDenominator: number
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
  readonly tracks: readonly ProjectTrackPresentation[]
}

const props = withDefaults(defineProps<ProjectWorkbenchShellProps>(), {
  saveFailureMessage: null,
})
const emit = defineEmits<{
  leaveProject: []
  playbackReturnToLastStartPosition: []
  playbackToggle: []
  redo: []
  save: []
  undo: []
}>()

const workspace = shallowRef<ProjectWorkbenchWorkspaceHandle | null>(null)
const isContextEditorOpen = shallowRef(true)

function openContextEditor(): void {
  workspace.value?.openContextEditor()
}
</script>

<template>
  <div class="project-workbench">
    <ProjectWorkbenchGlobalBar
      :is-dirty="props.isDirty"
      :project-id="props.projectId"
      :project-name="props.projectName"
      :save-failure-message="props.saveFailureMessage"
      :save-status="props.saveStatus"
      @leave-project="emit('leaveProject')"
      @open-context-editor="openContextEditor"
      @save="emit('save')"
    />

    <ProjectWorkbenchTransport
      :can-redo="props.canRedo"
      :can-undo="props.canUndo"
      :is-context-editor-open="isContextEditorOpen"
      :playback-can-toggle="props.playbackCanToggle"
      :playback-can-return-to-last-start-position="props.playbackCanReturnToLastStartPosition"
      :playback-feedback="props.playbackFeedback"
      :playback-phase="props.playbackPhase"
      :playback-time="props.playbackTime"
      :tempo="props.tempo"
      :time-signature-denominator="props.timeSignatureDenominator"
      :time-signature-numerator="props.timeSignatureNumerator"
      @open-context-editor="openContextEditor"
      @playback-return-to-last-start-position="emit('playbackReturnToLastStartPosition')"
      @playback-toggle="emit('playbackToggle')"
      @redo="emit('redo')"
      @undo="emit('undo')"
    />

    <main class="project-workbench__main">
      <section class="project-workbench__compact-warning">
        <UiIcon :icon="OptionsIcon" :size="24" />
        <p>Seele Studio’s editing workspace requires a viewport at least 900 px wide.</p>
        <UiButton variant="secondary" @click="emit('leaveProject')">Back to projects</UiButton>
      </section>

      <ProjectWorkbenchWorkspace
        ref="workspace"
        :bar-span-tick="props.barSpanTick"
        :clips="props.clips"
        :piano-roll-presentation="props.pianoRollPresentation"
        :piano-roll-track-presentation="props.pianoRollTrackPresentation"
        :project-id="props.projectId"
        :project-session="props.projectSession"
        :time-signature-numerator="props.timeSignatureNumerator"
        :timeline-end-tick="props.timelineEndTick"
        :tracks="props.tracks"
        @context-editor-open-change="isContextEditorOpen = $event"
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
