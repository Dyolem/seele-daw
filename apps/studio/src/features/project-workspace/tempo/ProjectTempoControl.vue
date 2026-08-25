<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  PROJECT_TEMPO_CONTROL_MODE,
  type ProjectTempoControlMode,
} from '@/features/project-workspace/tempo/tempo-control'

interface ProjectTempoControlProps {
  readonly displayBpm: string
  readonly editable: boolean
  readonly mode: ProjectTempoControlMode
}

const props = defineProps<ProjectTempoControlProps>()
const emit = defineEmits<{
  commit: [input: string]
  editStart: []
}>()

const draft = ref(props.displayBpm)
const isEditing = ref(false)
const isTempoMap = computed(() => props.mode === PROJECT_TEMPO_CONTROL_MODE.TEMPO_MAP)
const isReadOnly = computed(() => !props.editable || isTempoMap.value)
const controlLabel = computed(() =>
  isTempoMap.value ? 'Current Tempo Map value (BPM)' : 'Project tempo (BPM)',
)
const controlTitle = computed(() => {
  if (isTempoMap.value) return 'Tempo Map — current value at the playhead is read-only'
  if (!props.editable) return 'Tempo editing is unavailable while playback is loading'
  return 'Project tempo'
})

watch(
  () => props.displayBpm,
  (displayBpm) => {
    if (!isEditing.value) draft.value = displayBpm
  },
)

watch(isReadOnly, (readOnly) => {
  if (!readOnly) return
  isEditing.value = false
  draft.value = props.displayBpm
})

function beginEdit(event: FocusEvent): void {
  if (isReadOnly.value) return
  isEditing.value = true
  draft.value = props.displayBpm
  emit('editStart')
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.select()
}

function commitEdit(): void {
  if (!isEditing.value) return
  const input = draft.value
  isEditing.value = false
  draft.value = props.displayBpm
  emit('commit', input)
}

function commitAndBlur(event: KeyboardEvent): void {
  commitEdit()
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}

function cancelEdit(event: KeyboardEvent): void {
  if (!isEditing.value) return
  isEditing.value = false
  draft.value = props.displayBpm
  if (event.currentTarget instanceof HTMLInputElement) event.currentTarget.blur()
}
</script>

<template>
  <label class="project-tempo-control" :title="controlTitle">
    <input
      v-model="draft"
      class="project-tempo-control__input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      :aria-label="controlLabel"
      :readonly="isReadOnly"
      spellcheck="false"
      @blur="commitEdit"
      @focus="beginEdit"
      @keydown.enter.stop.prevent="commitAndBlur"
      @keydown.escape.stop.prevent="cancelEdit"
    />
    <span class="project-tempo-control__unit">BPM</span>
    <span v-if="isTempoMap" class="project-tempo-control__mode" aria-hidden="true">MAP</span>
  </label>
</template>

<style scoped>
.project-tempo-control {
  display: flex;
  gap: var(--sd-space-1);
  align-items: center;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-2);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}

.project-tempo-control__input {
  inline-size: 3.75rem;
  min-inline-size: 0;
  padding: var(--sd-space-1);
  border: 1px solid transparent;
  border-radius: var(--sd-radius-sm);
  outline: none;
  color: var(--sd-color-text-primary);
  background: transparent;
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-sm);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.project-tempo-control__input:not([readonly]):hover {
  border-color: var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-tempo-control__input:not([readonly]):focus {
  border-color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-panel);
}

.project-tempo-control__input:focus-visible {
  outline: 1px solid var(--sd-color-border-focus);
}

.project-tempo-control__input[readonly] {
  cursor: default;
}

.project-tempo-control__mode {
  padding: 0 var(--sd-space-1);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-secondary);
  font-size: 0.625rem;
  line-height: 1rem;
  letter-spacing: 0.04em;
}
</style>
