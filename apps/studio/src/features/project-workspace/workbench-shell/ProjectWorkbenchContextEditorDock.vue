<script setup lang="ts">
import type { ProjectSession, Tick } from '@seele-daw/project-core'
import DismissIcon from '~icons/fluent/dismiss-16-regular'
import FullScreenMaximizeIcon from '~icons/fluent/full-screen-maximize-16-regular'
import FullScreenMinimizeIcon from '~icons/fluent/full-screen-minimize-16-regular'
import MaximizeIcon from '~icons/fluent/maximize-16-regular'
import MidiIcon from '~icons/fluent/midi-24-regular'
import OptionsIcon from '~icons/fluent/options-20-regular'
import MinimizeIcon from '~icons/fluent/subtract-16-regular'
import { computed } from 'vue'

import ProjectPianoRollSurface from '@/features/piano-roll/ProjectPianoRollSurface.vue'
import ProjectPianoRollTrackSurface from '@/features/piano-roll/ProjectPianoRollTrackSurface.vue'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  type ProjectPianoRollPresentation,
  type ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import {
  PIANO_ROLL_EDITING_SCOPE,
  usePianoRollPreferencesStore,
} from '@/features/piano-roll/piano-roll-preferences-store'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import {
  PROJECT_TRACK_INSTRUMENT_STATUS,
  type ProjectTrackPresentation,
} from '@/features/project-workspace/project-track-presentation'
import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchDockMode,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'
import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { useProjectTracks } from '@/workbench/project/track/vue/project-track-context'

interface ProjectWorkbenchContextEditorDockProps {
  readonly barSpanTick: Tick
  readonly dockMode: ProjectWorkbenchDockMode
  readonly isMaximized: boolean
  readonly pianoRollPresentation: ProjectPianoRollPresentation | null
  readonly pianoRollTrackPresentation: ProjectPianoRollTrackPresentation | null
  readonly projectSession: Pick<ProjectSession, 'query' | 'subscribe'>
  readonly selectedClip: ProjectMidiClipPresentation | null
  readonly selectedTrack: ProjectTrackPresentation | null
  readonly timeSignatureNumerator: number
  readonly timelineEndTick: Tick
}

const props = defineProps<ProjectWorkbenchContextEditorDockProps>()
const { projectTracks } = useProjectTracks()
const pianoRollPreferences = usePianoRollPreferencesStore()
const toasts = useUiToastStore()
const emit = defineEmits<{
  close: []
  minimize: []
  toggleFullscreen: []
  toggleMaximized: []
}>()

const inspectorTitle = computed(() => {
  if (props.selectedClip !== null) return 'Clip inspector'
  if (props.selectedTrack !== null) return 'Track inspector'
  return 'Editor tools'
})
const selectedContextName = computed(
  () =>
    (pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.TRACK
      ? props.selectedTrack?.name
      : (props.selectedClip?.name ?? props.selectedTrack?.name)) ?? 'No selection',
)
const selectedInstrument = computed(() => props.selectedTrack?.instrument ?? null)
const contextEmptyTitle = computed(() => {
  if (props.selectedClip !== null) return props.selectedClip.name
  if (props.selectedTrack !== null) return 'No MIDI clip selected'
  return 'Select a track'
})

function useStudioGrand(): void {
  const track = props.selectedTrack
  if (track === null || track.instrument?.status !== PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY) {
    return
  }

  try {
    projectTracks.useStudioGrand(track.id)
  } catch (cause) {
    toasts.danger(
      'Instrument could not be selected',
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : 'The Project rejected the Instrument command. Please try again.',
    )
  }
}
</script>

<template>
  <section
    class="project-workbench__dock"
    :data-dock-mode="props.dockMode"
    aria-label="Context editor dock"
  >
    <aside class="project-workbench__inspector">
      <header>
        <UiIcon :icon="OptionsIcon" :size="20" />
        <strong>{{ inspectorTitle }}</strong>
      </header>
      <div
        v-if="props.dockMode !== PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED"
        class="project-workbench__inspector-content"
      >
        <section class="project-workbench__inspector-context">
          <span><UiIcon :icon="MidiIcon" :size="24" /></span>
          <strong>
            {{ props.selectedClip?.name ?? props.selectedTrack?.name ?? 'No track selected' }}
          </strong>
          <p v-if="props.selectedClip">
            MIDI clip on {{ props.selectedTrack?.name ?? 'the selected track' }}. Clip properties
            will appear here as editing capabilities arrive.
          </p>
          <p v-else-if="props.selectedTrack">
            {{ props.selectedTrack.kind === 'instrument' ? 'Instrument' : 'Audio' }} track selected.
            Track properties will appear here as editing capabilities arrive.
          </p>
          <p v-else>Select a track to inspect its editing context.</p>
        </section>

        <section
          v-if="selectedInstrument !== null"
          class="project-workbench__instrument-card"
          aria-label="Track instrument"
        >
          <span>Instrument</span>
          <strong>{{ selectedInstrument.displayName }}</strong>
          <p v-if="selectedInstrument.status === PROJECT_TRACK_INSTRUMENT_STATUS.READY">
            Selected in this Project. Use the Transport to play this Track's MIDI notes.
          </p>
          <p v-else-if="selectedInstrument.status === PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY">
            This legacy Track has no sound selected.
          </p>
          <template v-else>
            <p>The saved Instrument definition is not available. Its Project fact is preserved.</p>
            <code v-if="selectedInstrument.deviceTypeId !== null">
              {{ selectedInstrument.deviceTypeId }}
            </code>
          </template>
          <UiButton
            v-if="selectedInstrument.status === PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY"
            size="small"
            variant="primary"
            @click="useStudioGrand"
          >
            Use Studio Grand
          </UiButton>
        </section>
      </div>
    </aside>

    <section class="project-workbench__context-editor" aria-label="MIDI editor host">
      <header class="project-workbench__dock-heading">
        <div>
          <UiIcon :icon="MidiIcon" :size="20" />
          <strong>MIDI editor</strong>
          <span>{{ selectedContextName }}</span>
        </div>
        <div class="project-workbench__dock-controls">
          <div
            class="project-workbench__scope-switch"
            role="group"
            aria-label="Piano Roll editing scope"
          >
            <button
              type="button"
              :aria-pressed="pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.TRACK"
              title="Edit every MIDI clip on the selected track"
              @click="pianoRollPreferences.selectEditingScope(PIANO_ROLL_EDITING_SCOPE.TRACK)"
            >
              Track
            </button>
            <button
              type="button"
              :aria-pressed="pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.CLIP"
              title="Edit only the selected MIDI clip"
              @click="pianoRollPreferences.selectEditingScope(PIANO_ROLL_EDITING_SCOPE.CLIP)"
            >
              Clip Focus
            </button>
          </div>
          <UiIconButton
            :icon="MinimizeIcon"
            :label="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED
                ? 'Restore MIDI editor'
                : 'Minimize MIDI editor'
            "
            size="small"
            @click="emit('minimize')"
          />
          <UiIconButton
            v-if="props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.DOCKED"
            :icon="MaximizeIcon"
            :label="props.isMaximized ? 'Restore MIDI editor height' : 'Maximize MIDI editor'"
            size="small"
            @click="emit('toggleMaximized')"
          />
          <UiIconButton
            :icon="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
                ? FullScreenMinimizeIcon
                : FullScreenMaximizeIcon
            "
            :label="
              props.dockMode === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN
                ? 'Exit workspace fullscreen'
                : 'Open MIDI editor in workspace fullscreen'
            "
            size="small"
            @click="emit('toggleFullscreen')"
          />
          <UiIconButton
            :icon="DismissIcon"
            label="Close MIDI editor"
            size="small"
            @click="emit('close')"
          />
        </div>
      </header>

      <div
        v-if="props.dockMode !== PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED"
        class="project-workbench__context-host"
      >
        <ProjectPianoRollTrackSurface
          v-if="
            pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.TRACK &&
            props.pianoRollTrackPresentation?.status ===
              PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY
          "
          :bar-span-tick="props.barSpanTick"
          :presentation="props.pianoRollTrackPresentation"
          :timeline-end-tick="props.timelineEndTick"
          :time-signature-numerator="props.timeSignatureNumerator"
        />
        <ProjectPianoRollSurface
          v-else-if="
            pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.CLIP &&
            props.pianoRollPresentation?.status === PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY
          "
          :bar-span-tick="props.barSpanTick"
          :presentation="props.pianoRollPresentation"
          :session="props.projectSession"
          :time-signature-numerator="props.timeSignatureNumerator"
        />
        <div v-else class="project-workbench__surface-empty">
          <span><UiIcon :icon="MidiIcon" :size="24" /></span>
          <strong>{{ contextEmptyTitle }}</strong>
          <p
            v-if="
              (pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.TRACK
                ? props.pianoRollTrackPresentation?.status
                : props.pianoRollPresentation?.status) ===
              PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED
            "
          >
            {{
              pianoRollPreferences.editingScope === PIANO_ROLL_EDITING_SCOPE.TRACK
                ? 'Track Piano Roll is available for Instrument Tracks.'
                : 'Looped MIDI clips are not supported by Clip Focus.'
            }}
          </p>
          <p v-else-if="props.selectedClip">
            This MIDI clip is selected, but its Piano Roll context is unavailable.
          </p>
          <p v-else-if="props.selectedTrack">
            Add or select a MIDI clip on {{ props.selectedTrack.name }} to open the Piano Roll.
          </p>
          <p v-else>Select an instrument track before creating a MIDI clip.</p>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.project-workbench__dock {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 3;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
  overflow: hidden;
  border-top: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-workspace);
}

.project-workbench__dock[data-dock-mode='fullscreen'] {
  grid-row: 1;
  border-top: 0;
}

.project-workbench__inspector {
  display: grid;
  min-block-size: 0;
  grid-template-rows: 2.75rem minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__inspector > header,
.project-workbench__dock-heading {
  display: flex;
  align-items: center;
  min-inline-size: 0;
  block-size: 2.75rem;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__inspector > header {
  gap: var(--sd-space-2);
  padding-inline: var(--sd-space-3);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__inspector-content {
  display: grid;
  gap: var(--sd-space-4);
  min-block-size: 0;
  align-content: start;
  padding: var(--sd-space-4);
  overflow-y: auto;
  color: var(--sd-color-text-muted);
}

.project-workbench__inspector-context {
  display: grid;
  justify-items: center;
  padding-block: var(--sd-space-2);
  text-align: center;
}

.project-workbench__inspector-context > span,
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

.project-workbench__inspector-context strong,
.project-workbench__surface-empty strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__inspector-context p,
.project-workbench__surface-empty p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__instrument-card {
  display: grid;
  gap: var(--sd-space-2);
  padding: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__instrument-card > span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.project-workbench__instrument-card > strong {
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__instrument-card > p {
  margin: 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__instrument-card > code {
  overflow-wrap: anywhere;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__instrument-card > .ui-button {
  justify-self: start;
  margin-block-start: var(--sd-space-1);
}

.project-workbench__context-editor {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-rows: 2.75rem minmax(0, 1fr);
}

.project-workbench__dock-heading {
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-2);
}

.project-workbench__dock-heading > div,
.project-workbench__dock-controls {
  display: flex;
  align-items: center;
}

.project-workbench__dock-heading > div:first-child {
  gap: var(--sd-space-2);
  min-inline-size: 0;
}

.project-workbench__dock-heading strong {
  font-size: var(--sd-font-size-sm);
}

.project-workbench__dock-heading span {
  padding-inline-start: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__dock-controls {
  gap: var(--sd-space-0-5);
}

.project-workbench__scope-switch {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 1px;
  padding: 2px;
  margin-inline-end: var(--sd-space-1);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__scope-switch > button {
  min-block-size: calc(var(--sd-control-height-sm) - var(--sd-space-1));
  padding-inline: var(--sd-space-2);
  border: 0;
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--sd-font-size-xs);
  font-weight: 650;
  cursor: pointer;
  transition:
    color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.project-workbench__scope-switch > button:hover {
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-control-ghost-hover);
}

.project-workbench__scope-switch > button[aria-pressed='true'] {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-secondary);
}

.project-workbench__scope-switch > button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 1px;
}

.project-workbench__context-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: calc(100% / 8) 100%;
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

.project-workbench__dock[data-dock-mode='minimized'] .project-workbench__inspector,
.project-workbench__dock[data-dock-mode='minimized'] .project-workbench__context-editor {
  grid-template-rows: 2.75rem;
}
</style>
