<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import UiButton from '@/ui/components/UiButton.vue'
import type { StudioActionDescriptor } from '@/workbench/actions/studio-action'
import type { StudioUserKeymapResult } from '@/workbench/keyboard/studio-user-keymap'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'

const props = defineProps<{ action: StudioActionDescriptor }>()
const emit = defineEmits<{ close: [message?: string] }>()
const { keyboard, userKeymap } = useStudioActions()
const draft = ref([...userKeymap.bindingsForEditing(props.action.actionId)])
const error = shallowRef('')
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
  >
    <h3>{{ action.label }}</h3>
    <p>
      Type a key combination, such as <kbd>Mod+K</kbd>, <kbd>Shift+F9</kbd>, or <kbd>Delete</kbd>.
      Mod means Command on Mac and Control on Windows / Linux.
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
        :aria-label="`Remove key combination ${index + 1}`"
        @click="removeBinding(index)"
        >Remove</UiButton
      >
    </div>
    <p v-if="!draft.length">Unassigned. Saving this will remove all shortcuts for this action.</p>
    <UiButton size="small" data-add-binding @click="addBinding">Add key combination</UiButton>
    <p v-for="warning in warnings" :key="warning" class="shortcut-editor__warning">{{ warning }}</p>
    <p v-if="error" role="alert" class="shortcut-editor__error">{{ error }}</p>
    <div class="shortcut-editor__actions">
      <UiButton size="small" variant="primary" type="submit">Save shortcuts</UiButton>
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
.shortcut-editor__binding input:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}
.shortcut-editor .shortcut-editor__error {
  color: var(--sd-color-state-danger);
}
.shortcut-editor .shortcut-editor__warning {
  color: var(--sd-color-state-warning);
}
</style>
