<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import UiButton from '@/ui/components/UiButton.vue'
import UiSelect from '@/ui/components/UiSelect.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import KeyboardIcon from '~icons/fluent/keyboard-20-regular'
import ArrowResetIcon from '~icons/fluent/arrow-reset-20-regular'
import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import type {
  StudioUserKeymapResult,
  StudioUserKeymapState,
} from '@/workbench/keyboard/studio-user-keymap'
import type { StudioKeyboardRelation } from '@/workbench/keyboard/studio-keyboard-routes'
import { STUDIO_SHORTCUT_POLICIES } from '@/workbench/keyboard/studio-default-keymap'
import { STUDIO_KEYBOARD_CONTEXTS } from '@/workbench/keyboard/studio-keyboard-context'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

const props = defineProps<{ action: StudioActionDescriptor }>()
const emit = defineEmits<{ close: [message?: string] }>()
const { actions, keyboard, userKeymap, keymapState, shortcutRecorder } = useStudioActions()
const draft = ref([...userKeymap.bindingsForEditing(props.action.actionId)])
const initialBindings = [...draft.value]
const restoreRequested = shallowRef(false)
const specialKeys = [
  { value: 'Escape', label: 'Escape' },
  { value: 'Delete', label: 'Delete' },
  { value: 'Backspace', label: 'Backspace' },
] as const
const defaultBindings = STUDIO_SHORTCUT_POLICIES[props.action.actionId].defaultBindings
const isModified = computed(() =>
  keymapState.value.modifiedActionIds.includes(props.action.actionId),
)
const hasChanges = computed(() =>
  restoreRequested.value
    ? isModified.value
    : draft.value.length !== initialBindings.length ||
      draft.value.some((binding, index) => binding.trim() !== initialBindings[index]?.trim()),
)
const canRestore = computed(
  () =>
    isModified.value ||
    draft.value.length !== defaultBindings.length ||
    draft.value.some((binding, index) => binding.trim() !== defaultBindings[index]),
)
const error = shallowRef('')
const recordingIndex = shallowRef<number | null>(null)
const recordingFeedback = shallowRef('')
const confirmation = shallowRef<{
  state: StudioUserKeymapState
  inputs: readonly string[]
  conflicts: readonly StudioKeyboardRelation[]
} | null>(null)
let cancelRecording: (() => void) | null = null
const inspection = computed(() => ({
  ...userKeymap.inspectBindings(props.action.actionId, draft.value),
  state: keymapState.value,
}))
watch(
  draft,
  () => {
    confirmation.value = null
    restoreRequested.value = false
    recordingFeedback.value = ''
  },
  { deep: true, flush: 'sync' },
)
onBeforeUnmount(() => {
  cancelRecording?.()
  cancelRecording = null
})

function actionLabel(actionId: StudioActionId): string {
  return actions.catalogue.find((action) => action.actionId === actionId)?.label ?? actionId
}
function contextLabel(actionId: StudioActionId): string {
  return STUDIO_KEYBOARD_CONTEXTS[STUDIO_SHORTCUT_POLICIES[actionId].context].label
}
function peerId(relation: StudioKeyboardRelation): StudioActionId {
  const [first, second] = relation.actionIds
  return first === props.action.actionId ? second : first
}
function lowerPriorityId(relation: StudioKeyboardRelation): StudioActionId {
  const [first, second] = relation.actionIds
  return first === relation.priorityActionId ? second : first
}
async function requestReassignment(): Promise<void> {
  confirmation.value = {
    state: inspection.value.state,
    inputs: [...draft.value],
    conflicts: inspection.value.conflicts,
  }
  error.value = ''
  await nextTick()
  form.value?.querySelector<HTMLButtonElement>('[data-confirm-reassignment]')?.focus()
}
async function cancelReassignment(): Promise<void> {
  confirmation.value = null
  await nextTick()
  form.value?.querySelector<HTMLButtonElement>('[data-request-reassignment]')?.focus()
}
function handleEscape(event: KeyboardEvent): void {
  if (!confirmation.value) return
  event.preventDefault()
  event.stopPropagation()
  void cancelReassignment()
}
function reassign(): void {
  const review = confirmation.value
  if (!review) return
  finish(
    userKeymap.reassignBindings(props.action.actionId, review.inputs, review.state),
    `${props.action.label} shortcuts reassigned and saved.`,
  )
}
function recordBinding(index: number, event: MouseEvent): void {
  if (recordingIndex.value === index) {
    cancelRecording?.()
    return
  }
  if (recordingIndex.value !== null) return
  const owner = event.currentTarget
  if (!(owner instanceof HTMLElement)) return
  cancelRecording?.()
  confirmation.value = null
  recordingIndex.value = index
  recordingFeedback.value = ''
  error.value = ''
  cancelRecording = shortcutRecorder.start(owner, (result) => {
    recordingIndex.value = null
    cancelRecording = null
    if (result.status === 'recorded') {
      draft.value[index] = result.binding
      recordingFeedback.value = `Recorded ${keyboard.formatBinding(result.binding)}. Save to apply.`
      void nextTick(() => {
        if (document.activeElement === owner) focusBinding(index)
      })
    } else if (result.status === 'cleared') {
      void removeBinding(index)
      recordingFeedback.value = 'Draft key removed. Save to apply.'
    } else if (result.status === 'failed') error.value = result.message
    else recordingFeedback.value = 'Recording cancelled. Your draft is unchanged.'
  })
}
function chooseSpecialKey(index: number, key: string): void {
  if (recordingIndex.value !== null) return
  draft.value[index] = key
  error.value = ''
  recordingFeedback.value = 'Special key added to the draft. Save to apply.'
}
const form = useTemplateRef<HTMLFormElement>('form')
const warnings = computed(() =>
  draft.value.map((input) => keyboard.validateBindingInput(input).warnings),
)

function focusBinding(index: number): void {
  form.value?.querySelectorAll<HTMLInputElement>('input')[index]?.focus()
}
onMounted(() => {
  if (draft.value.length) focusBinding(0)
  else form.value?.querySelector<HTMLButtonElement>('[data-add-binding]')?.focus()
})
async function addBinding(): Promise<void> {
  if (recordingIndex.value !== null) return
  draft.value.push('')
  error.value = ''
  await nextTick()
  focusBinding(draft.value.length - 1)
}
async function removeBinding(index: number): Promise<void> {
  draft.value.splice(index, 1)
  error.value = ''
  await nextTick()
  if (draft.value.length) focusBinding(Math.min(index, draft.value.length - 1))
  else form.value?.querySelector<HTMLButtonElement>('[data-add-binding]')?.focus()
}
function finish(result: StudioUserKeymapResult, message: string): void {
  if (result.status === 'rejected') error.value = result.message
  else emit('close', message)
}
function save(): void {
  if (recordingIndex.value !== null || !hasChanges.value) return
  finish(
    restoreRequested.value
      ? userKeymap.restoreAction(props.action.actionId)
      : userKeymap.setBindings(props.action.actionId, draft.value),
    `${props.action.label} shortcuts saved.`,
  )
}
function restore(): void {
  if (recordingIndex.value !== null) return
  draft.value = [...defaultBindings]
  restoreRequested.value = true
  error.value = ''
  recordingFeedback.value = 'Defaults loaded into the draft. Save to apply.'
}
</script>

<template>
  <form
    ref="form"
    class="shortcut-editor"
    :class="{ 'shortcut-editor--recording': recordingIndex !== null }"
    :aria-label="`Edit ${action.label} shortcuts`"
    @submit.prevent="save"
    @keydown.esc="handleEscape"
  >
    <header class="shortcut-editor__header">
      <span class="shortcut-editor__eyebrow">Edit shortcuts</span>
      <h3>{{ action.label }}</h3>
      <p>{{ action.description }}</p>
    </header>
    <div v-if="recordingIndex !== null" role="status" class="shortcut-editor__recording">
      <UiIcon :icon="KeyboardIcon" :size="20" />
      <div>
        <strong>Listening for a key combination…</strong>
        <p>
          Press the keys for Key {{ recordingIndex + 1 }} now. Escape cancels recording; Delete /
          Backspace removes this draft key.
        </p>
      </div>
    </div>
    <p v-else class="shortcut-editor__hint">
      Record or type a combination. Mod means Command on Mac and Control on Windows / Linux. Changes
      stay in this draft until you save.
    </p>
    <div
      v-for="(_, index) in draft"
      :key="index"
      class="shortcut-editor__binding"
      :class="{ 'shortcut-editor__binding--recording': recordingIndex === index }"
    >
      <label :for="`shortcut-binding-${index}`">Key {{ index + 1 }}</label>
      <div class="shortcut-editor__key-controls">
        <input
          :id="`shortcut-binding-${index}`"
          v-model="draft[index]"
          :aria-label="`Key combination ${index + 1}`"
          autocomplete="off"
          :spellcheck="false"
          placeholder="e.g. Mod+K"
          :disabled="recordingIndex !== null"
          @input="error = ''"
        />
        <UiButton
          size="small"
          :aria-label="`${recordingIndex === index ? 'Stop recording' : 'Record'} key combination ${index + 1}`"
          :aria-pressed="recordingIndex === index"
          :disabled="recordingIndex !== null && recordingIndex !== index"
          @click="recordBinding(index, $event)"
          >{{ recordingIndex === index ? 'Stop recording' : 'Record' }}</UiButton
        >
        <UiSelect
          :model-value="''"
          :options="specialKeys"
          placeholder="Special key…"
          :aria-label="`Choose special key for combination ${index + 1}`"
          :disabled="recordingIndex !== null"
          @update:model-value="chooseSpecialKey(index, $event)"
        />
        <UiButton
          size="small"
          :aria-label="`Remove key combination ${index + 1}`"
          :disabled="recordingIndex !== null"
          @click="removeBinding(index)"
          >Remove</UiButton
        >
      </div>
      <ul v-if="warnings[index]?.length" class="shortcut-editor__warnings" role="status">
        <li v-for="warning in warnings[index]" :key="warning">{{ warning }}</li>
      </ul>
    </div>
    <p v-if="!draft.length">Unassigned. Saving this will remove all shortcuts for this action.</p>
    <UiButton size="small" data-add-binding :disabled="recordingIndex !== null" @click="addBinding"
      >Add key combination</UiButton
    >
    <p v-if="recordingIndex === null && recordingFeedback" role="status">{{ recordingFeedback }}</p>
    <p v-if="inspection.error && !error" role="alert" class="shortcut-editor__error">
      {{ inspection.error }}
    </p>
    <ul
      v-if="!inspection.error && inspection.relations.length"
      class="shortcut-editor__relations"
      aria-label="Shortcut relationships"
    >
      <li v-for="relation in inspection.relations" :key="`${relation.binding}:${peerId(relation)}`">
        <strong>{{ keyboard.formatBinding(relation.binding) }}</strong>
        <template v-if="relation.kind === 'conflict'">
          conflicts with {{ actionLabel(peerId(relation)) }} ({{ contextLabel(peerId(relation)) }}).
          These actions can be active together without a priority rule.</template
        >
        <template v-else-if="relation.kind === 'exclusive'">
          can be shared with {{ actionLabel(peerId(relation)) }}. They belong to separate focused
          regions: {{ contextLabel(action.actionId) }} /
          {{ contextLabel(peerId(relation)) }}.</template
        >
        <template v-else-if="relation.priorityActionId">
          gives priority to {{ actionLabel(relation.priorityActionId) }} ({{
            contextLabel(relation.priorityActionId)
          }}), ahead of {{ actionLabel(lowerPriorityId(relation)) }} ({{
            contextLabel(lowerPriorityId(relation))
          }}). The other action can run only when the higher-priority action is unavailable; a
          failed action never triggers it.</template
        >
      </li>
    </ul>
    <p v-if="inspection.reassignBlockedReason" class="shortcut-editor__error">
      {{ inspection.reassignBlockedReason }}
    </p>
    <div
      v-if="confirmation"
      class="shortcut-editor__confirmation"
      role="group"
      aria-label="Confirm shortcut reassignment"
    >
      <p>
        Saving will remove only these conflicting keys from the listed actions and assign them to
        {{ action.label }}:
      </p>
      <ul>
        <li
          v-for="conflict in confirmation.conflicts"
          :key="`${conflict.binding}:${peerId(conflict)}`"
        >
          {{ keyboard.formatBinding(conflict.binding) }} — {{ actionLabel(peerId(conflict)) }}
        </li>
      </ul>
      <UiButton size="small" variant="primary" data-confirm-reassignment @click="reassign"
        >Reassign and save</UiButton
      >
      <UiButton size="small" @click="cancelReassignment">Keep existing shortcuts</UiButton>
    </div>
    <p v-if="error" role="alert" class="shortcut-editor__error">{{ error }}</p>
    <footer class="shortcut-editor__footer">
      <div class="shortcut-editor__defaults">
        <UiButton
          size="small"
          :disabled="recordingIndex !== null || !canRestore || restoreRequested"
          @click="restore"
        >
          <template #leading><UiIcon :icon="ArrowResetIcon" :size="16" /></template>
          Restore defaults
        </UiButton>
        <span>{{
          restoreRequested ? 'Defaults are in the draft.' : 'Load defaults into this draft.'
        }}</span>
      </div>
      <div class="shortcut-editor__actions">
        <UiButton size="small" :disabled="recordingIndex !== null" @click="emit('close')"
          >Cancel editing</UiButton
        >
        <UiButton
          size="small"
          variant="primary"
          type="submit"
          :disabled="
            recordingIndex !== null ||
            !hasChanges ||
            !!inspection.error ||
            !!inspection.conflicts.length
          "
          >Save shortcuts</UiButton
        >
        <UiButton
          v-if="
            !confirmation &&
            !inspection.error &&
            inspection.conflicts.length &&
            !inspection.reassignBlockedReason
          "
          size="small"
          :disabled="recordingIndex !== null"
          data-request-reassignment
          @click="requestReassignment"
          >Reassign conflicting keys…</UiButton
        >
      </div>
    </footer>
  </form>
</template>

<style scoped>
.shortcut-editor {
  margin-block-end: var(--sd-space-4);
  padding: var(--sd-space-4);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
  font-size: var(--sd-font-size-sm);
}
.shortcut-editor--recording {
  border-color: var(--sd-color-state-info);
}
.shortcut-editor__header {
  margin-block-end: var(--sd-space-4);
}
.shortcut-editor__eyebrow {
  display: block;
  margin-block-end: var(--sd-space-2);
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}
.shortcut-editor h3 {
  margin: 0;
  font-size: var(--sd-font-size-md);
}
.shortcut-editor p {
  color: var(--sd-color-text-secondary);
  line-height: var(--sd-line-height-default);
}
.shortcut-editor__key-controls,
.shortcut-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sd-space-2);
  align-items: center;
  margin-block: var(--sd-space-3);
}
.shortcut-editor__binding {
  margin-block: var(--sd-space-3);
  padding: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-panel);
}
.shortcut-editor__binding > label {
  font-weight: 650;
}
.shortcut-editor__binding--recording {
  border-color: var(--sd-color-state-info);
}
.shortcut-editor__binding input {
  flex: 1;
  min-inline-size: 8rem;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-overlay);
  color: var(--sd-color-text-primary);
  font: inherit;
}
.shortcut-editor__binding input:disabled {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
}
.shortcut-editor__binding input:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}
.shortcut-editor__relations {
  padding-inline-start: var(--sd-space-5);
  line-height: var(--sd-line-height-default);
}
.shortcut-editor__relations li {
  margin-block: var(--sd-space-2);
}
.shortcut-editor__confirmation {
  padding: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-overlay);
}
.shortcut-editor__recording {
  display: flex;
  gap: var(--sd-space-3);
  align-items: center;
  padding: var(--sd-space-4);
  border: 1px solid var(--sd-color-state-info);
  border-radius: var(--sd-radius-md);
  background: color-mix(in srgb, var(--sd-color-state-info) 12%, var(--sd-color-surface-panel));
  color: var(--sd-color-text-primary);
}
.shortcut-editor__recording p {
  margin-block: var(--sd-space-2) 0;
}
.shortcut-editor__footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: var(--sd-space-5);
  border-block-start: 1px solid var(--sd-color-border-strong);
  margin-block-start: var(--sd-space-5);
  padding-block-start: var(--sd-space-4);
}
.shortcut-editor__defaults {
  display: grid;
  justify-items: start;
  gap: var(--sd-space-2);
}
.shortcut-editor__defaults span {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
}
.shortcut-editor__actions {
  margin-block: 0;
  margin-inline-start: auto;
}
.shortcut-editor__hint {
  font-size: var(--sd-font-size-xs);
}
.shortcut-editor .shortcut-editor__error {
  color: var(--sd-color-state-danger);
}
.shortcut-editor__warnings {
  padding: var(--sd-space-3) var(--sd-space-5);
  border: 1px solid var(--sd-color-state-warning);
  border-radius: var(--sd-radius-sm);
  background: color-mix(in srgb, var(--sd-color-state-warning) 8%, var(--sd-color-surface-panel));
  color: var(--sd-color-state-warning);
  line-height: var(--sd-line-height-default);
}
</style>
