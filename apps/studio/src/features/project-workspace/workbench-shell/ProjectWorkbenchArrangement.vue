<script setup lang="ts">
import { parseTick, type TrackId } from '@seele-daw/project-core'
import ChevronDownIcon from '~icons/fluent/chevron-down-16-regular'
import ChevronRightIcon from '~icons/fluent/chevron-right-16-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import MidiIcon from '~icons/fluent/midi-20-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import TargetArrowIcon from '~icons/fluent/target-arrow-20-regular'
import ZoomInIcon from '~icons/fluent/zoom-in-20-regular'
import ZoomOutIcon from '~icons/fluent/zoom-out-20-regular'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  reactive,
  shallowRef,
  type StyleValue,
} from 'vue'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { useProjectWorkspace } from '@/features/project-workspace/project-workspace'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import TempoTrackControl from '@/features/project-workspace/tempo-track/TempoTrackControl.vue'
import TempoTrackLane from '@/features/project-workspace/tempo-track/TempoTrackLane.vue'
import { useTempoSelection } from '@/features/project-workspace/tempo-track/hooks/use-tempo-selection'
import { useTempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import { describeProjectTempoAt } from '@/features/project-workspace/tempo-track/tempo-track'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import ProjectAddTrackMenu from '@/features/project-workspace/workbench-shell/ProjectAddTrackMenu.vue'
import ProjectWorkbenchMidiClip from '@/features/project-workspace/workbench-shell/ProjectWorkbenchMidiClip.vue'
import ProjectWorkbenchTrackRow from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTrackRow.vue'
import ArrangementPlayhead from '@/features/project-workspace/workbench-shell/arrangement/ArrangementPlayhead.vue'
import LocatePreview from '@/features/project-workspace/workbench-shell/arrangement/LocatePreview.vue'
import { useArrangementEdits } from '@/features/project-workspace/workbench-shell/arrangement/hooks/use-arrangement-edits'
import { useArrangementViewport } from '@/features/project-workspace/workbench-shell/arrangement/hooks/use-arrangement-viewport'
import { useTempoLaneLayout } from '@/features/project-workspace/workbench-shell/arrangement/hooks/use-tempo-lane-layout'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

const EMPTY_CLIPS: readonly ProjectMidiClipPresentation[] = Object.freeze([])

const workspace = useProjectWorkspace()
const props = reactive({
  barSpanTick: computed(() => workspace.project.value.barSpanTick),
  clips: workspace.clips,
  midiImportAction: computed(() => workspace.actionControls.value.importMidiTracks),
  projectId: workspace.projectId,
  timeSignatureNumerator: computed(() => workspace.project.value.timeSignatureNumerator),
  timelineEndTick: workspace.timelineEndTick,
  tracks: workspace.tracks,
})
const emit = defineEmits<{
  openMidiClip: []
}>()

const { actions } = useStudioActions()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const arrangementElement = shallowRef<HTMLElement | null>(null)
const trackPanelElement = shallowRef<HTMLElement | null>(null)
const tempoLayout = useTempoLaneLayout(arrangementElement, trackPanelElement)
onMounted(tempoLayout.mount)
onBeforeUnmount(tempoLayout.dispose)

const {
  viewportElement,
  trackViewportElement,
  trackFollowerElement,
  locateSurface,
  isCurrentProjectPlaying,
  isFollowActive,
  followLabel,
  locatePreviewTick,
  rulerPositionTick,
  suspendFollow,
  toggleFollow,
  revealTick,
  handleViewportScroll,
  handleViewportWheel,
  handleTimelinePointerDown,
  handleRulerKeydown,
  handleTrackWheel,
  handleTrackFocusIn,
} = useArrangementViewport(props)
const { addTrack, bindBarTarget, createClipFromBar, createClipHint, selectClip, selectTrack } =
  useArrangementEdits(props, { suspendFollow, openClip: () => emit('openMidiClip') })

const tempo = useTempoEditing()
const tempoEditingDisabled = tempo.editingDisabled
const tempoSelection = useTempoSelection(props, revealTick)
const tempoSummary = computed(() =>
  describeProjectTempoAt(tempo.presentedEvents.value, rulerPositionTick.value),
)
onUnmounted(() => {
  tempo.preview.cancelPreview()
})

const timelineBars = computed(() => {
  const barCount = Math.ceil(props.timelineEndTick / props.barSpanTick)
  return Object.freeze(
    Array.from({ length: barCount }, (_, barIndex) => {
      const startTick = parseTick(barIndex * props.barSpanTick)
      const spanTick = Math.min(props.barSpanTick, props.timelineEndTick - startTick)
      return Object.freeze({
        number: barIndex + 1,
        startTick,
        style: {
          '--project-workbench-bar-inline-size': `${
            (spanTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
          }rem`,
        } as StyleValue,
      })
    }),
  )
})
const timelineStyle = computed(
  (): StyleValue =>
    ({
      '--project-workbench-timeline-inline-size': `${
        (props.timelineEndTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
      }rem`,
    }) as StyleValue,
)
const visibleClipsByTrack = computed(() => {
  const clipsByTrack = new Map<TrackId, ProjectMidiClipPresentation[]>()
  for (const clip of props.clips) {
    if (clip.startTick >= props.timelineEndTick) continue
    const clips = clipsByTrack.get(clip.trackId)
    if (clips === undefined) clipsByTrack.set(clip.trackId, [clip])
    else clips.push(clip)
  }
  return clipsByTrack
})

function clipsForTrack(trackId: TrackId): readonly ProjectMidiClipPresentation[] {
  return visibleClipsByTrack.value.get(trackId) ?? EMPTY_CLIPS
}

function createTrackStyle(track: ProjectTrackPresentation): StyleValue {
  return { '--project-track-color': track.color ?? 'var(--sd-color-border-focus)' }
}
</script>

<template>
  <div
    ref="arrangementElement"
    class="project-workbench__arrangement-layout"
    role="region"
    aria-label="Arrangement tracks and lanes"
    :style="[timelineStyle, tempoLayout.style.value]"
  >
    <aside class="project-workbench__track-column" aria-label="Tracks">
      <div ref="trackPanelElement" class="project-workbench__track-panel">
        <header class="project-workbench__track-heading">
          <strong>Tracks</strong>
          <UiIconButton
            disabled
            :icon="MoreIcon"
            label="Track options — track editing is not available"
            size="small"
          />
        </header>
        <div class="project-workbench__track-actions">
          <ProjectAddTrackMenu @select="addTrack" />
        </div>
      </div>
      <section class="project-workbench__tempo-section" aria-label="Tempo controls">
        <div class="project-workbench__tempo-header">
          <UiButton
            size="small"
            variant="ghost"
            :aria-expanded="tempoLayout.expanded.value"
            :aria-label="
              tempoLayout.expanded.value ? 'Collapse Tempo editor' : 'Expand Tempo editor'
            "
            :disabled="!tempoLayout.canExpand.value"
            :title="
              tempoLayout.canExpand.value
                ? 'Edit tempo events'
                : 'Increase Arrangement height to edit tempo events'
            "
            @click="tempoLayout.toggle"
          >
            <template #leading
              ><UiIcon
                :icon="tempoLayout.expanded.value ? ChevronDownIcon : ChevronRightIcon"
                :size="16"
            /></template>
            Tempo
          </UiButton>
          <span v-if="!tempoLayout.canExpand.value" class="project-workbench__tempo-hint"
            >More height needed</span
          >
        </div>
        <TempoTrackControl
          v-if="tempoLayout.expanded.value"
          :can-navigate-to-next="tempoSelection.canNavigateNext.value"
          :can-navigate-to-previous="tempoSelection.canNavigatePrevious.value"
          :editing-disabled="tempoEditingDisabled"
          :selected-tempo-event="tempoSelection.event.value"
          :selected-tempo-event-is-initial="tempoSelection.isInitial.value"
          :selected-tempo-event-location="tempoSelection.location.value"
          @bpm-commit="tempo.commitBpmInput"
          @edit-start="tempo.beginEdit"
          @navigate="tempoSelection.navigate"
          @position-commit="tempoSelection.commitPosition"
          @remove="tempo.remove"
          @reveal="tempoSelection.reveal"
        />
      </section>
      <div
        ref="trackViewportElement"
        class="project-workbench__track-viewport"
        @focusin="handleTrackFocusIn"
        @wheel="handleTrackWheel"
      >
        <div v-if="props.tracks.length === 0" class="project-workbench__track-empty">
          <span>
            <UiIcon :icon="MusicNoteIcon" :size="20" />
          </span>
          <strong>No tracks yet</strong>
          <p>Add a virtual instrument to start arranging your Project.</p>
        </div>
        <div
          v-else
          ref="trackFollowerElement"
          class="project-workbench__track-list"
          role="list"
          aria-label="Track controls"
        >
          <div
            v-for="track in props.tracks"
            :key="track.id"
            class="project-workbench__track-row-slot"
            role="listitem"
            :data-track-id="track.id"
          >
            <ProjectWorkbenchTrackRow
              :selected="workbenchSelection.selectedTrackId === track.id"
              :track="track"
              @select="selectTrack(track)"
            />
          </div>
        </div>
      </div>
    </aside>

    <section
      ref="viewportElement"
      class="project-workbench__arrangement-scroll-viewport"
      aria-label="Timeline"
      tabindex="0"
      @pointerdown.capture="handleTimelinePointerDown"
      @scroll.passive="handleViewportScroll"
      @wheel.passive="handleViewportWheel"
    >
      <div class="project-workbench__arrangement-content">
        <div class="project-workbench__arrangement">
          <header class="project-workbench__ruler">
            <ol
              ref="locateSurface"
              class="project-workbench__ruler-locate-surface"
              role="slider"
              aria-label="Timeline play position"
              aria-orientation="horizontal"
              :aria-valuemax="props.timelineEndTick"
              aria-valuemin="0"
              :aria-valuenow="rulerPositionTick"
              :aria-valuetext="`Project Tick ${rulerPositionTick}`"
              tabindex="0"
              title="Click or drag to locate. Arrow keys move by beat; Page keys move by bar."
              @keydown="handleRulerKeydown"
            >
              <li
                v-for="bar in timelineBars"
                :key="bar.number"
                :style="bar.style"
                role="presentation"
              >
                {{ bar.number }}
              </li>
            </ol>
            <div class="project-workbench__arrangement-tools">
              <UiIconButton
                class="project-workbench__follow-control"
                :disabled="!isCurrentProjectPlaying"
                :icon="TargetArrowIcon"
                :label="followLabel"
                :pressed="isFollowActive"
                size="small"
                @click="toggleFollow"
              />
              <UiIconButton
                disabled
                :icon="GridIcon"
                label="Grid settings — fixed bar grid is active"
                size="small"
              />
              <UiIconButton
                disabled
                :icon="ZoomOutIcon"
                label="Zoom out — timeline zoom is in development"
                size="small"
              />
              <UiIconButton
                disabled
                :icon="ZoomInIcon"
                label="Zoom in — timeline zoom is in development"
                size="small"
              />
            </div>
          </header>
          <div class="project-workbench__lane-heading" aria-hidden="true">
            <span>Track lanes</span>
          </div>
          <div class="project-workbench__tempo-section">
            <div class="project-workbench__tempo-header project-workbench__tempo-summary">
              {{ tempoSummary }}
            </div>
            <TempoTrackLane
              v-if="tempoLayout.expanded.value"
              :bar-span-tick="props.barSpanTick"
              :project-id="props.projectId"
              :timeline-end-tick="props.timelineEndTick"
            />
          </div>
        </div>

        <div v-if="props.tracks.length === 0" class="project-workbench__surface-empty">
          <div class="project-workbench__surface-empty-message">
            <span><UiIcon :icon="GridIcon" :size="24" /></span>
            <strong>Arrangement</strong>
            <p>Add a Track to prepare the Arrangement surface.</p>
            <UiButton
              class="project-workbench__empty-midi-import"
              size="small"
              variant="secondary"
              :busy="props.midiImportAction.busy"
              :disabled="!props.midiImportAction.enabled"
              :title="props.midiImportAction.title"
              @click="actions.invoke(props.midiImportAction.actionId, 'toolbar')"
            >
              <template #leading><UiIcon :icon="MidiIcon" :size="16" /></template>
              {{ props.midiImportAction.label }}
            </UiButton>
          </div>
        </div>
        <div
          v-else
          class="project-workbench__arrangement-lane-list"
          role="list"
          aria-label="Arrangement lanes"
        >
          <div
            v-for="track in props.tracks"
            :key="track.id"
            class="project-workbench__arrangement-lane"
            :class="{
              'project-workbench__arrangement-lane--selected':
                workbenchSelection.selectedTrackId === track.id,
            }"
            :style="createTrackStyle(track)"
            role="listitem"
            :data-track-id="track.id"
          >
            <div class="project-workbench__lane-grid">
              <button
                v-for="bar in timelineBars"
                :key="bar.number"
                :style="bar.style"
                type="button"
                :aria-label="`Bar ${bar.number} on ${track.name}. ${createClipHint}.`"
                :aria-pressed="workbenchSelection.selectedTrackId === track.id"
                @click="selectTrack(track)"
                @dblclick="createClipFromBar(track, bar.startTick, $event)"
                @focus="bindBarTarget(track, bar.startTick, $event)"
              ></button>
            </div>
            <span class="project-workbench__lane-accent" aria-hidden="true"></span>
            <p v-if="clipsForTrack(track.id).length === 0">Double-click a bar to add a MIDI clip</p>
            <ProjectWorkbenchMidiClip
              v-for="clip in clipsForTrack(track.id)"
              :key="clip.id"
              :clip="clip"
              :selected="workbenchSelection.selectedClipId === clip.id"
              :timeline-span-tick="props.timelineEndTick"
              @open="emit('openMidiClip')"
              @select="selectClip(clip)"
            />
          </div>
          <div class="project-workbench__midi-import-lane" role="listitem">
            <div class="project-workbench__midi-import-lane-content">
              <UiButton
                size="small"
                variant="secondary"
                :busy="props.midiImportAction.busy"
                :disabled="!props.midiImportAction.enabled"
                :title="props.midiImportAction.title"
                @click="actions.invoke(props.midiImportAction.actionId, 'toolbar')"
              >
                <template #leading><UiIcon :icon="MidiIcon" :size="16" /></template>
                {{ props.midiImportAction.label }}
              </UiButton>
            </div>
          </div>
        </div>
        <ArrangementPlayhead
          :bar-span-tick="props.barSpanTick"
          :project-id="props.projectId"
          :timeline-end-tick="props.timelineEndTick"
        />
        <LocatePreview
          v-if="locatePreviewTick !== null"
          :bar-span-tick="props.barSpanTick"
          :position-tick="locatePreviewTick"
          :timeline-end-tick="props.timelineEndTick"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.project-workbench__tempo-section {
  display: grid;
  min-block-size: 0;
  grid-template-rows: var(--project-workbench-tempo-header-height) minmax(0, 1fr);
  overflow: hidden;
  border-block-end: 1px solid var(--sd-color-border-strong);
}
.project-workbench__tempo-header {
  display: flex;
  align-items: center;
  gap: var(--sd-space-2);
  min-inline-size: 0;
  border-block-start: 1px solid var(--sd-color-border-strong);
  background: var(--sd-color-surface-panel);
}
.project-workbench__tempo-summary {
  position: sticky;
  inset-inline-start: 0;
  inline-size: fit-content;
  padding-inline: var(--sd-space-3);
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}
.project-workbench__tempo-hint {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-layout {
  --project-workbench-arrangement-tools-width: calc(
    var(--sd-control-height-sm) + var(--sd-control-height-sm) + var(--sd-control-height-sm) +
      var(--sd-control-height-sm) + var(--sd-space-0-5) + var(--sd-space-0-5) +
      var(--sd-space-0-5) + 2px
  );
  --project-workbench-timeline-marker-inline-size: 1px;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-row: 1;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
}

.project-workbench__track-column {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-column: 1;
  grid-template-rows:
    calc(var(--project-workbench-ruler-height) + var(--project-workbench-track-actions-height))
    var(--project-workbench-tempo-track-height)
    minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-panel {
  display: grid;
  min-block-size: 0;
  grid-row: 1;
  grid-template-rows:
    var(--project-workbench-ruler-height)
    var(--project-workbench-track-actions-height);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading,
.project-workbench__ruler {
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-1);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-actions {
  box-sizing: border-box;
  block-size: var(--project-workbench-track-actions-height);
  padding: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__track-actions :deep(.ui-button) {
  inline-size: 100%;
}

.project-workbench__track-viewport {
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 3;
  overflow: hidden;
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-empty {
  display: grid;
  block-size: 100%;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  background: var(--sd-color-surface-panel);
  text-align: center;
}

.project-workbench__track-list {
  min-block-size: 100%;
  transform: translate3d(0, var(--project-workbench-track-scroll-offset, 0), 0);
  will-change: transform;
}

.project-workbench__track-row-slot {
  block-size: var(--project-workbench-track-row-height);
}

.project-workbench__track-row-slot :deep(.project-track-row) {
  block-size: 100%;
}

.project-workbench__track-empty > span,
.project-workbench__surface-empty-message > span {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  margin-bottom: var(--sd-space-3);
  place-items: center;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__track-empty strong,
.project-workbench__surface-empty-message strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-empty p,
.project-workbench__surface-empty-message p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__arrangement-scroll-viewport {
  container-type: size;
  min-inline-size: 0;
  min-block-size: 0;
  grid-column: 2;
  overflow: auto;
  overscroll-behavior: none;
  scrollbar-gutter: stable;
}

.project-workbench__arrangement-scroll-viewport:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-workbench__arrangement-content {
  position: relative;
  display: grid;
  inline-size: var(--project-workbench-timeline-inline-size);
  min-block-size: 100%;
  grid-template-rows:
    calc(
      var(--project-workbench-ruler-height) + var(--project-workbench-track-actions-height) +
        var(--project-workbench-tempo-track-height)
    )
    minmax(
      calc(
        100% - var(--project-workbench-ruler-height) -
          var(--project-workbench-track-actions-height) -
          var(--project-workbench-tempo-track-height)
      ),
      auto
    );
  background: var(--sd-color-surface-canvas);
}

.project-workbench__arrangement {
  position: sticky;
  z-index: var(--sd-layer-sticky);
  inset-block-start: 0;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 1;
  grid-template-rows:
    var(--project-workbench-ruler-height)
    var(--project-workbench-track-actions-height)
    var(--project-workbench-tempo-track-height);
  background: var(--sd-color-surface-canvas);
}

.project-workbench__ruler {
  display: grid;
  min-inline-size: 0;
}

.project-workbench__ruler ol {
  z-index: 0;
  display: flex;
  block-size: 100%;
  min-inline-size: 0;
  grid-area: 1 / 1;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-workbench__ruler-locate-surface {
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
}

.project-workbench__ruler li {
  box-sizing: border-box;
  flex: 0 0 var(--project-workbench-bar-inline-size);
  padding: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-tools {
  position: sticky;
  z-index: 1;
  inset-inline-start: calc(
    100vw - var(--project-workbench-track-width) -
      var(--project-workbench-arrangement-tools-width) - var(--sd-space-2)
  );
  display: flex;
  align-self: start;
  justify-self: start;
  inline-size: var(--project-workbench-arrangement-tools-width);
  margin-block-start: var(--sd-space-0-5);
  grid-area: 1 / 1;
  gap: var(--sd-space-0-5);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  background: var(--sd-color-surface-panel);
}

.project-workbench__lane-heading {
  display: flex;
  align-items: center;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  color: var(--sd-color-text-disabled);
  background: var(--sd-color-surface-panel);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__lane-heading span {
  position: sticky;
  inset-inline-start: var(--sd-space-3);
}

.project-workbench__arrangement-lane-list {
  min-inline-size: 0;
  min-block-size: 100%;
  grid-row: 2;
}

.project-workbench__midi-import-lane {
  display: flex;
  block-size: var(--project-workbench-track-row-height);
  align-items: center;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  background: color-mix(in srgb, var(--sd-color-surface-panel) 54%, transparent);
}

.project-workbench__midi-import-lane-content {
  position: sticky;
  inset-inline-start: var(--sd-space-3);
  display: flex;
  inline-size: max-content;
  align-items: center;
  gap: var(--sd-space-3);
}

.project-workbench__arrangement-lane {
  position: relative;
  block-size: var(--project-workbench-track-row-height);
  inline-size: 100%;
  border-block-end: 1px solid var(--sd-color-border-subtle);
  background: color-mix(in srgb, var(--project-track-color) 3%, transparent);
  transition:
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    box-shadow var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-workbench__arrangement-lane:hover {
  background: color-mix(in srgb, var(--project-track-color) 7%, transparent);
}

.project-workbench__arrangement-lane--selected {
  background: color-mix(in srgb, var(--project-track-color) 11%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--project-track-color) 48%, transparent);
}

.project-workbench__lane-accent {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  inline-size: var(--sd-space-0-5);
  background: color-mix(in srgb, var(--project-track-color) 72%, transparent);
}

.project-workbench__lane-grid {
  position: absolute;
  inset: 0;
  display: flex;
}

.project-workbench__lane-grid button {
  box-sizing: border-box;
  flex: 0 0 var(--project-workbench-bar-inline-size);
  padding: 0;
  border: 0;
  border-inline-start: 1px solid var(--sd-color-border-subtle);
  color: inherit;
  background: transparent;
  cursor: crosshair;
}

.project-workbench__lane-grid button:hover {
  background: color-mix(in srgb, var(--project-track-color) 8%, transparent);
}

.project-workbench__lane-grid button:first-child {
  border-inline-start-color: var(--sd-color-border-default);
}

.project-workbench__lane-grid button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-workbench__arrangement-lane p {
  position: absolute;
  inset: 50% auto auto var(--sd-space-4);
  margin: 0;
  color: var(--sd-color-text-disabled);
  font-size: var(--sd-font-size-xs);
  pointer-events: none;
  transform: translateY(-50%);
  white-space: nowrap;
}

.project-workbench__surface-empty {
  position: relative;
  min-inline-size: 0;
  min-block-size: 100%;
  grid-row: 2;
  color: var(--sd-color-text-muted);
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: 5rem 100%;
  text-align: center;
}

.project-workbench__surface-empty-message {
  position: sticky;
  inset-inline-start: var(--sd-space-6);
  display: grid;
  inline-size: calc(
    100vw - var(--project-workbench-track-width) - var(--sd-space-6) - var(--sd-space-6)
  );
  block-size: 100%;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-6);
}

.project-workbench__empty-midi-import {
  margin-block-start: var(--sd-space-4);
}
</style>
