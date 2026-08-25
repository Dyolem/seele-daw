<script setup lang="ts">
import type { TempoEventRecord } from '@seele-daw/project-core'
import ChevronLeftIcon from '~icons/fluent/chevron-left-20-regular'
import ChevronRightIcon from '~icons/fluent/chevron-right-20-regular'
import DeleteIcon from '~icons/fluent/delete-20-regular'
import LocationIcon from '~icons/fluent/location-20-regular'
import { computed, ref, watch } from 'vue'

import { formatProjectTempoBpm } from '@/features/project-workspace/tempo/tempo-control'
import type {
  ProjectTempoEventLocationPresentation,
  ProjectTempoEventNavigationDirection,
  ProjectTempoEventPositionDraft,
} from '@/features/project-workspace/tempo-track/tempo-track'
import UiIconButton from '@/ui/components/UiIconButton.vue'

const props = defineProps<{
  readonly canNavigateToNext: boolean
  readonly canNavigateToPrevious: boolean
  readonly editingDisabled: boolean
  readonly selectedTempoEvent: TempoEventRecord | null
  readonly selectedTempoEventIsInitial: boolean
  readonly selectedTempoEventLocation: ProjectTempoEventLocationPresentation | null
}>()
const emit = defineEmits<{
  bpmCommit: [tempoEventId: TempoEventRecord['id'], input: string]
  editStart: []
  navigate: [direction: ProjectTempoEventNavigationDirection]
  positionCommit: [tempoEventId: TempoEventRecord['id'], position: ProjectTempoEventPositionDraft]
  remove: [tempoEventId: TempoEventRecord['id']]
  reveal: []
}>()

const bpmDraft = ref('')
const barDraft = ref('')
const beatDraft = ref('')
const offsetDraft = ref('')
const isEditingBpm = ref(false)
const isEditingPosition = ref(false)
const displayBpm = computed(() =>
  props.selectedTempoEvent === null ? '' : formatProjectTempoBpm(props.selectedTempoEvent.bpm),
)
const isBpmReadOnly = computed(() => props.editingDisabled || props.selectedTempoEvent === null)
const isPositionReadOnly = computed(
  () =>
    props.editingDisabled || props.selectedTempoEvent === null || props.selectedTempoEventIsInitial,
)
const canRemove = computed(
  () =>
    !props.editingDisabled &&
    props.selectedTempoEvent !== null &&
    !props.selectedTempoEventIsInitial,
)

function resetBpmDraft(): void {
  bpmDraft.value = displayBpm.value
}

function resetPositionDraft(): void {
  barDraft.value = String(props.selectedTempoEventLocation?.barNumber ?? '')
  beatDraft.value = String(props.selectedTempoEventLocation?.beatNumber ?? '')
  offsetDraft.value = String(props.selectedTempoEventLocation?.offsetWithinBeat ?? '')
}

watch(
  [
    () => props.selectedTempoEvent?.id ?? null,
    displayBpm,
    () => props.selectedTempoEventLocation?.barNumber ?? null,
    () => props.selectedTempoEventLocation?.beatNumber ?? null,
    () => props.selectedTempoEventLocation?.offsetWithinBeat ?? null,
  ],
  () => {
    isEditingBpm.value = false
    isEditingPosition.value = false
    resetBpmDraft()
    resetPositionDraft()
  },
  { immediate: true },
)

watch(
  () => props.editingDisabled,
  (editingDisabled) => {
    if (!editingDisabled) return
    isEditingBpm.value = false
    isEditingPosition.value = false
    resetBpmDraft()
    resetPositionDraft()
  },
)

function selectInputContents(event: FocusEvent): void {
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.select()
}

function beginBpmEdit(event: FocusEvent): void {
  if (isBpmReadOnly.value) return
  isEditingBpm.value = true
  resetBpmDraft()
  emit('editStart')
  selectInputContents(event)
}

function beginPositionEdit(event: FocusEvent): void {
  if (isPositionReadOnly.value) return
  if (!isEditingPosition.value) {
    isEditingPosition.value = true
    resetPositionDraft()
    emit('editStart')
  }
  selectInputContents(event)
}

function commitBpmEdit(): void {
  const tempoEvent = props.selectedTempoEvent
  if (!isEditingBpm.value || tempoEvent === null) return
  const input = bpmDraft.value
  isEditingBpm.value = false
  resetBpmDraft()
  emit('bpmCommit', tempoEvent.id, input)
}

function commitPositionEdit(): void {
  const tempoEvent = props.selectedTempoEvent
  if (!isEditingPosition.value || tempoEvent === null) return
  const position = Object.freeze({
    bar: barDraft.value,
    beat: beatDraft.value,
    offset: offsetDraft.value,
  })
  isEditingPosition.value = false
  resetPositionDraft()
  emit('positionCommit', tempoEvent.id, position)
}

function commitBpmAndBlur(event: KeyboardEvent): void {
  commitBpmEdit()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function commitPositionAndBlur(event: KeyboardEvent): void {
  commitPositionEdit()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function commitPositionAfterGroupBlur(event: FocusEvent): void {
  const group = event.currentTarget
  const nextTarget = event.relatedTarget
  if (group instanceof HTMLElement && nextTarget instanceof Node && group.contains(nextTarget)) {
    return
  }
  commitPositionEdit()
}

function cancelBpmEdit(event: KeyboardEvent): void {
  if (!isEditingBpm.value) return
  isEditingBpm.value = false
  resetBpmDraft()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function cancelPositionEdit(event: KeyboardEvent): void {
  if (!isEditingPosition.value) return
  isEditingPosition.value = false
  resetPositionDraft()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function removeSelectedTempoEvent(): void {
  const tempoEvent = props.selectedTempoEvent
  if (!canRemove.value || tempoEvent === null) return
  emit('remove', tempoEvent.id)
}
</script>

<template>
  <section class="tempo-track-control" aria-label="Tempo Track controls">
    <header>
      <strong>Tempo</strong>
      <span>STEP</span>
    </header>

    <template v-if="props.selectedTempoEvent">
      <label class="tempo-track-control__bpm" title="Selected Tempo Event BPM">
        <input
          v-model="bpmDraft"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          aria-label="Selected Tempo Event BPM"
          :readonly="isBpmReadOnly"
          spellcheck="false"
          @blur="commitBpmEdit"
          @focus="beginBpmEdit"
          @keydown.enter.stop.prevent="commitBpmAndBlur"
          @keydown.escape.stop.prevent="cancelBpmEdit"
        />
        <span>BPM</span>
      </label>
      <UiIconButton
        class="tempo-track-control__remove"
        :disabled="!canRemove"
        :icon="DeleteIcon"
        :label="
          props.selectedTempoEventIsInitial
            ? 'The initial Tempo Event cannot be removed'
            : 'Remove selected Tempo Event'
        "
        size="small"
        @click="removeSelectedTempoEvent"
      />
      <div
        v-if="props.selectedTempoEventLocation"
        class="tempo-track-control__position"
        role="group"
        aria-label="Selected Tempo Event musical position"
        :title="props.selectedTempoEventLocation.title"
        @focusout="commitPositionAfterGroupBlur"
      >
        <label>
          <span>BAR</span>
          <input
            v-model="barDraft"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-label="Selected Tempo Event bar"
            :readonly="isPositionReadOnly"
            spellcheck="false"
            @focus="beginPositionEdit"
            @keydown.enter.stop.prevent="commitPositionAndBlur"
            @keydown.escape.stop.prevent="cancelPositionEdit"
          />
        </label>
        <label>
          <span>BEAT</span>
          <input
            v-model="beatDraft"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-label="Selected Tempo Event beat"
            :readonly="isPositionReadOnly"
            spellcheck="false"
            @focus="beginPositionEdit"
            @keydown.enter.stop.prevent="commitPositionAndBlur"
            @keydown.escape.stop.prevent="cancelPositionEdit"
          />
        </label>
        <label
          :title="`Exact position within the beat, from 0 through ${props.selectedTempoEventLocation.maximumOffsetWithinBeat}. 0 is the beat start.`"
        >
          <span>OFFSET</span>
          <input
            v-model="offsetDraft"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            aria-label="Selected Tempo Event offset within beat"
            :aria-description="`From 0 through ${props.selectedTempoEventLocation.maximumOffsetWithinBeat}; 0 is the beat start`"
            :readonly="isPositionReadOnly"
            spellcheck="false"
            @focus="beginPositionEdit"
            @keydown.enter.stop.prevent="commitPositionAndBlur"
            @keydown.escape.stop.prevent="cancelPositionEdit"
          />
        </label>
      </div>
      <footer>
        <span class="tempo-track-control__time">
          <span>TIME</span>
          <time>{{ props.selectedTempoEventLocation?.projectTime }}</time>
        </span>
        <span class="tempo-track-control__navigation" aria-label="Selected Tempo Event navigation">
          <UiIconButton
            :disabled="!props.canNavigateToPrevious"
            :icon="ChevronLeftIcon"
            label="Select previous Tempo Event"
            size="small"
            @click="emit('navigate', 'previous')"
          />
          <UiIconButton
            :icon="LocationIcon"
            label="Reveal selected Tempo Event on Timeline"
            size="small"
            @click="emit('reveal')"
          />
          <UiIconButton
            :disabled="!props.canNavigateToNext"
            :icon="ChevronRightIcon"
            label="Select next Tempo Event"
            size="small"
            @click="emit('navigate', 'next')"
          />
        </span>
      </footer>
    </template>
    <p v-else>Select a Tempo point to edit its value.</p>
  </section>
</template>

<style scoped>
.tempo-track-control {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto auto auto 1fr;
  align-items: center;
  gap: var(--sd-space-1);
  padding: var(--sd-space-3);
  border-block-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.tempo-track-control header {
  display: flex;
  min-inline-size: 0;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
}

.tempo-track-control header span {
  padding-inline: var(--sd-space-1);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-muted);
  font-size: 0.625rem;
  letter-spacing: 0.04em;
}

.tempo-track-control__bpm {
  display: flex;
  min-inline-size: 0;
  grid-column: 1;
  grid-row: 2;
  align-items: center;
  gap: var(--sd-space-1);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.tempo-track-control input {
  min-inline-size: 0;
  padding: var(--sd-space-1) var(--sd-space-2);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-sm);
  outline: none;
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-sunken);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.tempo-track-control__bpm input {
  inline-size: 4.5rem;
}

.tempo-track-control input:not([readonly]):focus {
  border-color: var(--sd-color-border-focus);
}

.tempo-track-control input[readonly] {
  color: var(--sd-color-text-muted);
  cursor: default;
}

.tempo-track-control__position {
  display: grid;
  min-inline-size: 0;
  grid-column: 1 / -1;
  grid-row: 3;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.3fr);
  gap: var(--sd-space-1);
}

.tempo-track-control__position label {
  display: grid;
  min-inline-size: 0;
  gap: 1px;
}

.tempo-track-control__position label > span {
  overflow: hidden;
  color: var(--sd-color-text-disabled);
  font-size: 0.5625rem;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tempo-track-control__position input {
  inline-size: 100%;
  padding-inline: var(--sd-space-1);
}

.tempo-track-control footer {
  display: flex;
  min-inline-size: 0;
  grid-column: 1 / -1;
  grid-row: 4;
  align-items: center;
  align-self: end;
  justify-content: space-between;
  gap: var(--sd-space-1);
}

.tempo-track-control__time {
  display: flex;
  min-inline-size: 0;
  align-items: baseline;
  gap: var(--sd-space-1);
  color: var(--sd-color-text-disabled);
  font-family: var(--sd-font-family-numeric);
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
}

.tempo-track-control__time > span {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-sans);
  font-size: 0.5625rem;
  letter-spacing: 0.04em;
}

.tempo-track-control__time time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tempo-track-control__remove {
  grid-column: 2;
  grid-row: 2;
}

.tempo-track-control__navigation {
  display: flex;
  flex: none;
  gap: var(--sd-space-0-5);
}

.tempo-track-control p {
  grid-column: 1 / -1;
  grid-row: 2 / 5;
  margin: 0;
  color: var(--sd-color-text-disabled);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}
</style>
