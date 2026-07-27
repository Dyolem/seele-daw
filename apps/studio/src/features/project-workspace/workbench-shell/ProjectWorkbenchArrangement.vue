<script setup lang="ts">
import { parseTick, type Tick, type TrackId } from '@seele-daw/project-core'
import GridIcon from '~icons/fluent/grid-20-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import ZoomInIcon from '~icons/fluent/zoom-in-20-regular'
import ZoomOutIcon from '~icons/fluent/zoom-out-20-regular'
import { computed, shallowRef, type StyleValue } from 'vue'

import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import ProjectAddTrackMenu from '@/features/project-workspace/workbench-shell/ProjectAddTrackMenu.vue'
import ProjectWorkbenchMidiClip from '@/features/project-workspace/workbench-shell/ProjectWorkbenchMidiClip.vue'
import ProjectWorkbenchTrackRow from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTrackRow.vue'
import {
  PROJECT_ADD_TRACK_TYPE,
  type ProjectAddTrackType,
} from '@/features/project-workspace/workbench-shell/project-add-track-option'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { UI_TOAST_TONE, type UiToastMessage } from '@/ui/components/ui-toast'
import { useProjectClips } from '@/workbench/project/clip/vue/project-clip-context'
import { useProjectTracks } from '@/workbench/project/track/vue/project-track-context'

const ARRANGEMENT_BAR_COUNT = 8
const EMPTY_CLIPS: readonly ProjectMidiClipPresentation[] = Object.freeze([])

const props = defineProps<{
  readonly barSpanTick: Tick
  readonly clips: readonly ProjectMidiClipPresentation[]
  readonly tracks: readonly ProjectTrackPresentation[]
}>()
const emit = defineEmits<{
  openMidiClip: []
}>()

const { projectClips } = useProjectClips()
const { projectTracks } = useProjectTracks()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const notification = shallowRef<UiToastMessage | null>(null)
let notificationSequence = 0

const timelineSpanTick = computed(() => props.barSpanTick * ARRANGEMENT_BAR_COUNT)
const visibleClipsByTrack = computed(() => {
  const clipsByTrack = new Map<TrackId, ProjectMidiClipPresentation[]>()

  for (const clip of props.clips) {
    if (clip.startTick >= timelineSpanTick.value) continue

    const clips = clipsByTrack.get(clip.trackId)
    if (clips === undefined) {
      clipsByTrack.set(clip.trackId, [clip])
    } else {
      clips.push(clip)
    }
  }

  return clipsByTrack
})

const UNAVAILABLE_TRACK_LABELS: Readonly<
  Record<Exclude<ProjectAddTrackType, 'instrument'>, string>
> = Object.freeze({
  [PROJECT_ADD_TRACK_TYPE.AUDIO]: 'Voice / audio',
  [PROJECT_ADD_TRACK_TYPE.BASS]: 'Bass',
  [PROJECT_ADD_TRACK_TYPE.DRUM_MACHINE]: 'Drum machine',
  [PROJECT_ADD_TRACK_TYPE.GUITAR]: 'Guitar',
  [PROJECT_ADD_TRACK_TYPE.SAMPLER]: 'Sampler',
})

function showNotification(
  tone: UiToastMessage['tone'],
  title: string,
  description: string,
): void {
  notificationSequence += 1
  notification.value = Object.freeze({
    description,
    id: notificationSequence,
    title,
    tone,
  })
}

function handleTrackTypeSelection(trackType: ProjectAddTrackType): void {
  if (trackType !== PROJECT_ADD_TRACK_TYPE.INSTRUMENT) {
    showNotification(
      UI_TOAST_TONE.INFO,
      `${UNAVAILABLE_TRACK_LABELS[trackType]} is in development`,
      'This track type will become available in a later product slice.',
    )
    return
  }

  try {
    const result = projectTracks.addInstrumentTrack()
    workbenchSelection.selectTrack(result.trackId)
  } catch (cause) {
    showNotification(
      UI_TOAST_TONE.DANGER,
      'Instrument track could not be added',
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : 'The Project rejected the Track command. Please try again.',
    )
  }
}

function dismissNotification(messageId: number): void {
  if (notification.value?.id === messageId) notification.value = null
}

function createTrackStyle(track: ProjectTrackPresentation): StyleValue {
  return {
    '--project-track-color': track.color ?? 'var(--sd-color-border-focus)',
  }
}

function selectTrack(track: ProjectTrackPresentation): void {
  workbenchSelection.selectTrack(track.id)
}

function clipsForTrack(trackId: TrackId): readonly ProjectMidiClipPresentation[] {
  return visibleClipsByTrack.value.get(trackId) ?? EMPTY_CLIPS
}

function createBarStartTick(barIndex: number): Tick {
  return parseTick(barIndex * props.barSpanTick)
}

function createEmptyMidiClip(
  track: ProjectTrackPresentation,
  barIndex: number,
): void {
  try {
    const result = projectClips.addEmptyMidiClip({
      targetTick: createBarStartTick(barIndex),
      trackId: track.id,
    })
    workbenchSelection.selectClip(result.trackId, result.clipId)
    emit('openMidiClip')
  } catch (cause) {
    showNotification(
      UI_TOAST_TONE.DANGER,
      'MIDI clip could not be added',
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : 'The Project rejected the Clip command. Please try again.',
    )
  }
}

function selectClip(clip: ProjectMidiClipPresentation): void {
  workbenchSelection.selectClip(clip.trackId, clip.id)
}
</script>

<template>
  <div class="project-workbench__arrangement-layout">
    <aside class="project-workbench__track-panel" aria-label="Tracks">
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
        <ProjectAddTrackMenu @select="handleTrackTypeSelection" />
      </div>
      <div v-if="props.tracks.length === 0" class="project-workbench__track-empty">
        <span>
          <UiIcon :icon="MusicNoteIcon" :size="20" />
        </span>
        <strong>No tracks yet</strong>
        <p>Add a virtual instrument to start arranging your Project.</p>
      </div>
      <div v-else class="project-workbench__track-list">
        <ProjectWorkbenchTrackRow
          v-for="track in props.tracks"
          :key="track.id"
          :selected="workbenchSelection.selectedTrackId === track.id"
          :track="track"
          @select="selectTrack(track)"
        />
      </div>
    </aside>

    <section class="project-workbench__arrangement" aria-label="Arrangement host">
      <header class="project-workbench__ruler">
        <ol aria-label="Timeline bars">
          <li v-for="bar in ARRANGEMENT_BAR_COUNT" :key="bar">{{ bar }}</li>
        </ol>
        <div class="project-workbench__arrangement-tools">
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
      <div class="project-workbench__arrangement-host">
        <div v-if="props.tracks.length === 0" class="project-workbench__surface-empty">
          <span><UiIcon :icon="GridIcon" :size="24" /></span>
          <strong>Arrangement</strong>
          <p>Add a Track to prepare the Arrangement surface.</p>
        </div>
        <div v-else class="project-workbench__arrangement-lanes">
          <div
            v-for="track in props.tracks"
            :key="track.id"
            class="project-workbench__arrangement-lane"
            :class="{
              'project-workbench__arrangement-lane--selected':
                workbenchSelection.selectedTrackId === track.id,
            }"
            :style="createTrackStyle(track)"
          >
            <div class="project-workbench__lane-grid">
              <button
                v-for="bar in ARRANGEMENT_BAR_COUNT"
                :key="bar"
                type="button"
                :aria-label="
                  `Bar ${bar} on ${track.name}. Double-click or press Enter to add a MIDI clip.`
                "
                :aria-pressed="workbenchSelection.selectedTrackId === track.id"
                @click="selectTrack(track)"
                @dblclick="createEmptyMidiClip(track, bar - 1)"
                @keydown.enter.prevent="createEmptyMidiClip(track, bar - 1)"
              ></button>
            </div>
            <span class="project-workbench__lane-accent" aria-hidden="true"></span>
            <p v-if="clipsForTrack(track.id).length === 0">
              Double-click a bar to add a MIDI clip
            </p>
            <ProjectWorkbenchMidiClip
              v-for="clip in clipsForTrack(track.id)"
              :key="clip.id"
              :clip="clip"
              :selected="workbenchSelection.selectedClipId === clip.id"
              :timeline-span-tick="timelineSpanTick"
              @open="emit('openMidiClip')"
              @select="selectClip(clip)"
            />
          </div>
        </div>
      </div>
    </section>

    <UiToastRegion :message="notification" @dismiss="dismissNotification" />
  </div>
</template>

<style scoped>
.project-workbench__arrangement-layout {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 1;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
}

.project-workbench__track-panel {
  display: grid;
  min-block-size: 0;
  grid-template-rows: var(--project-workbench-ruler-height) auto minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
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

.project-workbench__track-list {
  min-block-size: 0;
  overflow: auto;
}

.project-workbench__track-empty {
  display: grid;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-workbench__track-empty > span,
.project-workbench__surface-empty > span {
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
.project-workbench__surface-empty strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-empty p,
.project-workbench__surface-empty p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__arrangement {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-rows:
    var(--project-workbench-ruler-height) var(--project-workbench-track-actions-height)
    minmax(0, 1fr);
  background: var(--sd-color-surface-canvas);
}

.project-workbench__ruler {
  position: relative;
  min-inline-size: 0;
}

.project-workbench__ruler ol {
  display: grid;
  block-size: 100%;
  grid-template-columns: repeat(8, minmax(5rem, 1fr));
  min-inline-size: 40rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-workbench__ruler li {
  padding: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-tools {
  position: absolute;
  inset-block-start: var(--sd-space-0-5);
  inset-inline-end: var(--sd-space-2);
  display: flex;
  gap: var(--sd-space-0-5);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  background: var(--sd-color-surface-panel);
}

.project-workbench__lane-heading {
  display: flex;
  align-items: center;
  padding-inline: var(--sd-space-3);
  border-block-end: 1px solid var(--sd-color-border-subtle);
  color: var(--sd-color-text-disabled);
  background: var(--sd-color-surface-panel);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: calc(100% / 8) 100%;
}

.project-workbench__arrangement-lanes {
  min-inline-size: 40rem;
  min-block-size: 100%;
}

.project-workbench__arrangement-lane {
  position: relative;
  min-block-size: var(--project-workbench-track-row-height);
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
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--project-track-color) 48%, transparent);
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
  display: grid;
  grid-template-columns: repeat(8, minmax(5rem, 1fr));
}

.project-workbench__lane-grid button {
  padding: 0;
  border: 0;
  border-inline-start: 1px solid transparent;
  color: inherit;
  background: transparent;
  cursor: crosshair;
}

.project-workbench__lane-grid button:hover {
  background: color-mix(in srgb, var(--project-track-color) 8%, transparent);
}

.project-workbench__lane-grid button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-workbench__arrangement-lane p {
  position: absolute;
  inset: 50% auto auto 50%;
  margin: 0;
  color: var(--sd-color-text-disabled);
  font-size: var(--sd-font-size-xs);
  pointer-events: none;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}

.project-workbench__surface-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-6);
  color: var(--sd-color-text-muted);
  text-align: center;
}
</style>
