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
function chooseSpecialKey(index: number, event: Event): void {
  const field = event.target
  if (!(field instanceof HTMLSelectElement) || !field.value) return
  draft.value[index] = field.value
  field.value = ''
  error.value = ''
  recordingFeedback.value = 'Special key added to the draft. Save to apply.'
}
const form = useTemplateRef<HTMLFormElement>('form')
const warnings = computed(() => [
  ...new Set(draft.value.flatMap((input) => keyboard.validateBindingInput(input).warnings)),
])

function focusBinding(index: number): void {
  form.value?.querySelectorAll<HTMLInputElement>('input')[index]?.focus()
}
onMounted(() => {
  if (draft.value.length) focusBinding(0)
  else form.value?.querySelector<HTMLButtonElement>('[data-add-binding]')?.focus()
})
async function addBinding(): Promise<void> {
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
  if (recordingIndex.value !== null) return
  finish(
    userKeymap.setBindings(props.action.actionId, draft.value),
    `${props.action.label} shortcuts saved.`,
  )
}
function restore(): void {
  finish(
    userKeymap.restoreAction(props.action.actionId),
    `${props.action.label} now follows the default shortcuts.`,
  )
}
</script>

<template>
  <form
    ref="form"
    class="shortcut-editor"
    :aria-label="`Edit ${action.label} shortcuts`"
    @submit.prevent="save"
    @keydown.esc="handleEscape"
  >
    <h3>{{ action.label }}</h3>
    <p>
      Record a key combination or type one, such as <kbd>Mod+K</kbd>, <kbd>Shift+F9</kbd>, or
      <kbd>Delete</kbd>. Mod means Command on Mac and Control on Windows / Linux. Special keys can
      be chosen directly.
    </p>
    <div v-for="(_, index) in draft" :key="index" class="shortcut-editor__binding">
      <label :for="`shortcut-binding-${index}`">Key {{ index + 1 }}</label>
      <input
        :id="`shortcut-binding-${index}`"
        v-model="draft[index]"
        :aria-label="`Key combination ${index + 1}`"
        autocomplete="off"
        :spellcheck="false"
        placeholder="e.g. Mod+K"
        @input="error = ''"
      />
      <UiButton
        size="small"
        :aria-label="`${recordingIndex === index ? 'Stop recording' : 'Record'} key combination ${index + 1}`"
        :aria-pressed="recordingIndex === index"
        @click="recordBinding(index, $event)"
        >{{ recordingIndex === index ? 'Stop recording' : 'Record' }}</UiButton
      >
      <select
        :aria-label="`Choose special key for combination ${index + 1}`"
        @change="chooseSpecialKey(index, $event)"
      >
        <option value="">Special key…</option>
        <option value="Escape">Escape</option>
        <option value="Delete">Delete</option>
        <option value="Backspace">Backspace</option>
      </select>
      <UiButton
        size="small"
        :aria-label="`Remove key combination ${index + 1}`"
        @click="removeBinding(index)"
        >Remove</UiButton
      >
    </div>
    <p v-if="recordingIndex !== null" role="status" class="shortcut-editor__recording">
      Press a key combination. Escape cancels recording; Delete / Backspace removes this draft key.
      Moving focus away cancels recording.
    </p>
    <p v-else-if="recordingFeedback" role="status">{{ recordingFeedback }}</p>
    <p class="shortcut-editor__hint">
      Tab navigation is reserved for controls. Browser or system shortcuts may not reach Studio;
      type the combination if it cannot be recorded.
    </p>
    <p v-if="!draft.length">Unassigned. Saving this will remove all shortcuts for this action.</p>
    <UiButton size="small" data-add-binding @click="addBinding">Add key combination</UiButton>
    <p v-for="warning in warnings" :key="warning" class="shortcut-editor__warning">{{ warning }}</p>
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
    <div class="shortcut-editor__actions">
      <UiButton
        size="small"
        variant="primary"
        type="submit"
        :disabled="recordingIndex !== null || !!inspection.error || !!inspection.conflicts.length"
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
        data-request-reassignment
        @click="requestReassignment"
        >Reassign conflicting keys…</UiButton
      >
      <UiButton size="small" @click="emit('close')">Cancel</UiButton>
      <UiButton size="small" variant="ghost" @click="restore">Restore default</UiButton>
    </div>
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
.shortcut-editor h3 {
  margin: 0;
  font-size: var(--sd-font-size-md);
}
.shortcut-editor p {
  color: var(--sd-color-text-secondary);
  line-height: var(--sd-line-height-default);
}
.shortcut-editor__binding,
.shortcut-editor__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sd-space-2);
  align-items: center;
  margin-block: var(--sd-space-3);
}
.shortcut-editor__binding input,
.shortcut-editor__binding select {
  min-inline-size: 8rem;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-overlay);
  color: var(--sd-color-text-primary);
  font: inherit;
}
.shortcut-editor__binding input {
  flex: 1;
}
.shortcut-editor__binding input:focus-visible,
.shortcut-editor__binding select:focus-visible {
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
.shortcut-editor .shortcut-editor__recording {
  color: var(--sd-color-text-primary);
}
.shortcut-editor__hint {
  font-size: var(--sd-font-size-xs);
}
.shortcut-editor .shortcut-editor__error {
  color: var(--sd-color-state-danger);
}
.shortcut-editor .shortcut-editor__warning {
  color: var(--sd-color-state-warning);
}
</style>
