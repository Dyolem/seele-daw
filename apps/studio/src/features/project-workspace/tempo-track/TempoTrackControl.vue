<script setup lang="ts">
import type { TempoEventRecord } from '@seele-daw/project-core'
import DeleteIcon from '~icons/fluent/delete-20-regular'
import { computed, ref, watch } from 'vue'

import { formatProjectTempoBpm } from '@/features/project-workspace/tempo/tempo-control'
import UiIconButton from '@/ui/components/UiIconButton.vue'

const props = defineProps<{
  readonly editingDisabled: boolean
  readonly selectedTempoEvent: TempoEventRecord | null
}>()
const emit = defineEmits<{
  bpmCommit: [tempoEventId: TempoEventRecord['id'], input: string]
  editStart: []
  remove: [tempoEventId: TempoEventRecord['id']]
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
      <span class="tempo-track-control__tick">Tick {{ props.selectedTempoEvent.tick }}</span>
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

.tempo-track-control__tick {
  grid-column: 1;
  grid-row: 3;
  overflow: hidden;
  color: var(--sd-color-text-disabled);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tempo-track-control__remove {
  grid-column: 2;
  grid-row: 2 / 4;
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
