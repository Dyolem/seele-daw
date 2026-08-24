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
} from '@/features/project-workspace/tempo-track/tempo-track'
import UiIconButton from '@/ui/components/UiIconButton.vue'

const props = defineProps<{
  readonly canNavigateToNext: boolean
  readonly canNavigateToPrevious: boolean
  readonly editingDisabled: boolean
  readonly selectedTempoEvent: TempoEventRecord | null
  readonly selectedTempoEventLocation: ProjectTempoEventLocationPresentation | null
}>()
const emit = defineEmits<{
  bpmCommit: [tempoEventId: TempoEventRecord['id'], input: string]
  editStart: []
  navigate: [direction: ProjectTempoEventNavigationDirection]
  remove: [tempoEventId: TempoEventRecord['id']]
  reveal: []
}>()

const draft = ref('')
const isEditing = ref(false)
const displayBpm = computed(() =>
  props.selectedTempoEvent === null ? '' : formatProjectTempoBpm(props.selectedTempoEvent.bpm),
)
const isReadOnly = computed(() => props.editingDisabled || props.selectedTempoEvent === null)
const canRemove = computed(
  () => !props.editingDisabled && (props.selectedTempoEvent?.tick ?? 0) > 0,
)

watch(
  [() => props.selectedTempoEvent?.id ?? null, displayBpm],
  () => {
    if (isEditing.value) isEditing.value = false
    draft.value = displayBpm.value
  },
  { immediate: true },
)

watch(isReadOnly, (readOnly) => {
  if (!readOnly) return
  isEditing.value = false
  draft.value = displayBpm.value
})

function beginEdit(event: FocusEvent): void {
  if (isReadOnly.value) return
  isEditing.value = true
  draft.value = displayBpm.value
  emit('editStart')
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.select()
}

function commitEdit(): void {
  const tempoEvent = props.selectedTempoEvent
  if (!isEditing.value || tempoEvent === null) return
  const input = draft.value
  isEditing.value = false
  draft.value = displayBpm.value
  emit('bpmCommit', tempoEvent.id, input)
}

function commitAndBlur(event: KeyboardEvent): void {
  commitEdit()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function cancelEdit(event: KeyboardEvent): void {
  if (!isEditing.value) return
  isEditing.value = false
  draft.value = displayBpm.value
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
      <label title="Selected Tempo Event BPM">
        <input
          v-model="draft"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          aria-label="Selected Tempo Event BPM"
          :readonly="isReadOnly"
          spellcheck="false"
          @blur="commitEdit"
          @focus="beginEdit"
          @keydown.enter.stop.prevent="commitAndBlur"
          @keydown.escape.stop.prevent="cancelEdit"
        />
        <span>BPM</span>
      </label>
      <UiIconButton
        class="tempo-track-control__remove"
        :disabled="!canRemove"
        :icon="DeleteIcon"
        :label="
          props.selectedTempoEvent.tick === 0
            ? 'The initial Tempo Event cannot be removed'
            : 'Remove selected Tempo Event'
        "
        size="small"
        @click="removeSelectedTempoEvent"
      />
      <div
        v-if="props.selectedTempoEventLocation"
        class="tempo-track-control__location"
        :title="props.selectedTempoEventLocation.title"
      >
        <span>{{ props.selectedTempoEventLocation.musicalPosition }}</span>
        <time>{{ props.selectedTempoEventLocation.projectTime }}</time>
      </div>
      <div class="tempo-track-control__navigation" aria-label="Selected Tempo Event navigation">
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
      </div>
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
  grid-template-rows: auto auto 1fr;
  align-items: center;
  gap: var(--sd-space-2);
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

.tempo-track-control label {
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
  inline-size: 4.5rem;
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
  text-align: end;
}

.tempo-track-control input:not([readonly]):focus {
  border-color: var(--sd-color-border-focus);
}

.tempo-track-control input[readonly] {
  color: var(--sd-color-text-muted);
  cursor: default;
}

.tempo-track-control__location {
  display: grid;
  min-inline-size: 0;
  grid-column: 1;
  grid-row: 3;
  overflow: hidden;
  gap: 1px;
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  font-variant-numeric: tabular-nums;
}

.tempo-track-control__location span,
.tempo-track-control__location time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tempo-track-control__location time {
  color: var(--sd-color-text-disabled);
  font-size: 0.625rem;
}

.tempo-track-control__remove {
  grid-column: 2;
  grid-row: 2;
}

.tempo-track-control__navigation {
  display: flex;
  grid-column: 2;
  grid-row: 3;
  gap: var(--sd-space-0-5);
}

.tempo-track-control p {
  grid-column: 1 / -1;
  grid-row: 2 / 4;
  margin: 0;
  color: var(--sd-color-text-disabled);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}
</style>
