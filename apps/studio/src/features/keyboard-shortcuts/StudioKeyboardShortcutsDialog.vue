<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import DismissIcon from '~icons/fluent/dismiss-20-regular'
import UiButton from '@/ui/components/UiButton.vue'
import StudioShortcutEditor from '@/features/keyboard-shortcuts/StudioShortcutEditor.vue'
import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import {
  useStudioActions,
  useStudioKeyboardLayer,
} from '@/workbench/actions/vue/studio-action-context'
import {
  queryStudioShortcuts,
  STUDIO_KEYBOARD_CONTROL_HELP,
} from '@/workbench/keyboard/studio-shortcut-catalogue'

const open = defineModel<boolean>('open', { required: true })
const { actions, keyboard, userKeymap, keymapState } = useStudioActions()
const search = shallowRef('')
const assignment = shallowRef<'all' | 'assigned' | 'unassigned' | 'modified'>('all')
const searchField = useTemplateRef<HTMLInputElement>('searchField')
const rows = computed(() =>
  queryStudioShortcuts(
    actions,
    keyboard,
    search.value,
    assignment.value,
    keymapState.value.modifiedActionIds,
  ),
)
const editing = shallowRef<StudioActionDescriptor | null>(null)
const confirmReset = shallowRef(false)
const feedback = shallowRef('')
const resetError = shallowRef('')
let editReturnTarget: HTMLElement | null = null
let resetReturnTarget: HTMLElement | null = null
let returnFocusTarget: HTMLElement | null = null
function rejectedMessage(actionId: StudioActionId): string | undefined {
  return keymapState.value.rejectedOverrides.find((issue) => issue.actionId === actionId)?.message
}
function editAction(action: StudioActionDescriptor, event: MouseEvent): void {
  editReturnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  editing.value = action
  confirmReset.value = false
  feedback.value = ''
  resetError.value = ''
}
async function closeEditor(message = ''): Promise<void> {
  editing.value = null
  feedback.value = message
  await nextTick()
  if (editReturnTarget?.isConnected) editReturnTarget.focus({ preventScroll: true })
  else searchField.value?.focus({ preventScroll: true })
  editReturnTarget = null
}
function handleEscape(event: KeyboardEvent): void {
  if (editing.value) {
    event.preventDefault()
    void closeEditor()
  } else if (confirmReset.value) {
    event.preventDefault()
    cancelRestoreAll()
  }
}
function requestRestoreAll(event: MouseEvent): void {
  resetReturnTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  confirmReset.value = true
  editing.value = null
  resetError.value = ''
  feedback.value = ''
}
function cancelRestoreAll(): void {
  confirmReset.value = false
  resetError.value = ''
  if (resetReturnTarget?.isConnected) resetReturnTarget.focus({ preventScroll: true })
  else searchField.value?.focus({ preventScroll: true })
  resetReturnTarget = null
}
function restoreAll(): void {
  const result = userKeymap.restoreAll()
  if (result.status === 'rejected') resetError.value = result.message
  else {
    confirmReset.value = false
    editing.value = null
    resetError.value = ''
    feedback.value = 'All actions now follow the default shortcuts.'
    searchField.value?.focus({ preventScroll: true })
  }
}
useStudioKeyboardLayer(() => open.value)
watch(
  open,
  (value) => {
    editing.value = null
    confirmReset.value = false
    feedback.value = ''
    resetError.value = ''
    editReturnTarget = null
    resetReturnTarget = null
    if (value) {
      returnFocusTarget =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      search.value = ''
      assignment.value = 'all'
    }
  },
  { flush: 'sync' },
)
function focusSearch(event: Event): void {
  event.preventDefault()
  searchField.value?.focus({ preventScroll: true })
}
function restoreFocus(event: Event): void {
  event.preventDefault()
  if (returnFocusTarget?.isConnected) returnFocusTarget.focus({ preventScroll: true })
  returnFocusTarget = null
}
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="studio-shortcuts__overlay" />
      <DialogContent
        class="studio-shortcuts"
        @open-auto-focus="focusSearch"
        @close-auto-focus="restoreFocus"
        @escape-key-down="handleEscape"
      >
        <header class="studio-shortcuts__header">
          <div>
            <DialogTitle class="studio-shortcuts__title">Keyboard shortcuts</DialogTitle>
            <DialogDescription class="studio-shortcuts__description"
              >Customize actions, assigned keys, and where they work. Saved in this
              browser.</DialogDescription
            >
          </div>
          <DialogClose as-child
            ><UiIconButton :icon="DismissIcon" label="Close keyboard shortcuts"
          /></DialogClose>
        </header>
        <div class="studio-shortcuts__filters">
          <input
            ref="searchField"
            v-model="search"
            type="search"
            aria-label="Search keyboard shortcuts"
            placeholder="Search actions, keys, or editor…"
          />
          <select v-model="assignment" aria-label="Filter shortcut assignment">
            <option value="all">All actions</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="modified">Modified</option>
          </select>
          <span role="status">{{ rows.length }} / {{ actions.catalogue.length }} actions</span>
        </div>
        <div class="studio-shortcuts__body">
          <div class="studio-shortcuts__settings">
            <UiButton size="small" @click="requestRestoreAll">{{
              keymapState.canEdit ? 'Restore all defaults' : 'Reset saved record'
            }}</UiButton>
            <span v-if="feedback" role="status">{{ feedback }}</span>
          </div>
          <p v-if="keymapState.problem" role="alert">{{ keymapState.problem.message }}</p>
          <p v-if="keymapState.rejectedOverrides.length" role="alert">
            {{ keymapState.rejectedOverrides.length }} saved action overrides are not applied. Edit
            those actions or restore their defaults.
          </p>
          <p v-if="keymapState.unknownActionIds.length" class="studio-shortcuts__notice">
            {{ keymapState.unknownActionIds.length }} saved actions from another version are
            preserved but are not active.
          </p>
          <div v-if="confirmReset" class="studio-shortcuts__reset">
            <p>
              {{
                keymapState.canEdit
                  ? 'Restore every action to its default shortcuts? Saved actions from another version will be kept.'
                  : 'Replace the unreadable or unsupported saved record with default shortcuts? This cannot be undone.'
              }}
            </p>
            <UiButton size="small" @click="restoreAll">Confirm restore</UiButton>
            <UiButton size="small" variant="ghost" @click="cancelRestoreAll"
              >Cancel restore</UiButton
            >
            <p v-if="resetError" role="alert">{{ resetError }}</p>
          </div>
          <StudioShortcutEditor
            v-if="editing"
            :key="editing.actionId"
            :action="editing"
            @close="closeEditor"
          />
          <table v-if="rows.length" class="studio-shortcuts__table">
            <caption class="studio-shortcuts__caption">
              Current shortcuts · default bindings · local changes
            </caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Current</th>
                <th scope="col">Default</th>
                <th scope="col">Where it works</th>
                <th scope="col">Customize</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.actionId">
                <th scope="row">
                  <strong>{{ row.label }}</strong
                  ><span>{{ row.description }}</span
                  ><small
                    >{{ row.categoryLabel }} · {{ row.modified ? 'Modified' : 'Default' }}</small
                  >
                  <small v-if="rejectedMessage(row.actionId)"
                    >{{ rejectedMessage(row.actionId) }} Using defaults.</small
                  >
                </th>
                <td>
                  <kbd v-for="binding in row.currentBindings" :key="binding">{{ binding }}</kbd
                  ><span v-if="!row.currentBindings.length" class="studio-shortcuts__unassigned"
                    >Unassigned</span
                  >
                </td>
                <td>
                  <kbd v-for="binding in row.defaultBindings" :key="binding">{{ binding }}</kbd
                  ><span v-if="!row.defaultBindings.length" class="studio-shortcuts__unassigned"
                    >Unassigned</span
                  >
                </td>
                <td>
                  {{ row.contextLabel }}<small v-if="row.allowRepeat">Repeats while held</small>
                </td>
                <td>
                  <UiButton
                    size="small"
                    :aria-label="`Edit ${row.label} shortcuts`"
                    :disabled="!keymapState.canEdit"
                    @click="editAction(row, $event)"
                    >Edit</UiButton
                  >
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="studio-shortcuts__empty">
            No matching actions. Try a different search or filter.
          </p>
          <details class="studio-shortcuts__help">
            <summary>Controls and gesture modifiers</summary>
            <p>
              These keys follow the focused control or pointer gesture. They are separate from
              action shortcuts.
            </p>
            <dl>
              <template v-for="item in STUDIO_KEYBOARD_CONTROL_HELP" :key="item.label"
                ><dt>
                  {{ item.label }} <span>{{ item.keys }}</span>
                </dt>
                <dd>{{ item.description }}</dd></template
              >
            </dl>
          </details>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.studio-shortcuts__overlay {
  position: fixed;
  inset: 0;
  z-index: var(--sd-layer-modal);
  background: var(--sd-color-surface-scrim);
}
.studio-shortcuts {
  position: fixed;
  z-index: var(--sd-layer-modal);
  inset-block-start: 50%;
  inset-inline-start: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  inline-size: min(62rem, calc(100vw - var(--sd-space-8)));
  max-block-size: calc(100dvh - var(--sd-space-8));
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-lg);
  background: var(--sd-color-surface-overlay);
  color: var(--sd-color-text-primary);
  box-shadow: var(--sd-shadow-overlay);
  overflow: hidden;
}
.studio-shortcuts__header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--sd-space-4);
  padding: var(--sd-space-5) var(--sd-space-6) var(--sd-space-4);
}
.studio-shortcuts__title {
  margin: 0;
  font-size: var(--sd-font-size-xl);
  line-height: var(--sd-line-height-tight);
}
.studio-shortcuts__description {
  margin: var(--sd-space-2) 0 0;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}
.studio-shortcuts__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sd-space-3);
  padding: 0 var(--sd-space-6) var(--sd-space-4);
}
.studio-shortcuts__filters input,
.studio-shortcuts__filters select {
  min-block-size: var(--sd-control-height-md);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
  color: var(--sd-color-text-primary);
  padding: var(--sd-space-2) var(--sd-space-3);
  font: inherit;
  font-size: var(--sd-font-size-sm);
}
.studio-shortcuts__filters input {
  flex: 1;
  min-inline-size: 12rem;
}
.studio-shortcuts__filters :focus-visible,
.studio-shortcuts__help summary:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}
.studio-shortcuts__filters [role='status'] {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
}
.studio-shortcuts__settings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sd-space-3);
  margin-block-end: var(--sd-space-3);
  font-size: var(--sd-font-size-sm);
}
.studio-shortcuts__notice,
.studio-shortcuts__body > [role='alert'] {
  font-size: var(--sd-font-size-sm);
  color: var(--sd-color-text-secondary);
}
.studio-shortcuts__reset {
  padding: var(--sd-space-3);
  margin-block-end: var(--sd-space-3);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-md);
  background: var(--sd-color-surface-sunken);
  font-size: var(--sd-font-size-sm);
}
.studio-shortcuts__reset p {
  margin-block-start: 0;
}
.studio-shortcuts__reset [role='alert'] {
  color: var(--sd-color-state-danger);
  margin-block: var(--sd-space-3) 0;
}
.studio-shortcuts__body {
  min-block-size: 0;
  overflow: auto;
  padding: 0 var(--sd-space-6) var(--sd-space-5);
}
.studio-shortcuts__table {
  inline-size: 100%;
  border-collapse: collapse;
  text-align: start;
  font-size: var(--sd-font-size-sm);
}
.studio-shortcuts__caption {
  text-align: start;
  color: var(--sd-color-text-secondary);
  padding-block-end: var(--sd-space-3);
  font-size: var(--sd-font-size-xs);
}
.studio-shortcuts__table th,
.studio-shortcuts__table td {
  border-block-end: 1px solid var(--sd-color-border-subtle);
  padding: var(--sd-space-3) var(--sd-space-2);
  vertical-align: top;
  text-align: start;
}
.studio-shortcuts__table th[scope='row'] {
  inline-size: 42%;
  font-weight: normal;
}
.studio-shortcuts__table th[scope='row'] > span,
.studio-shortcuts__table small {
  display: block;
  color: var(--sd-color-text-secondary);
  margin-block-start: var(--sd-space-1);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}
.studio-shortcuts__table kbd {
  display: inline-block;
  margin: 0 var(--sd-space-1) var(--sd-space-1) 0;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-xs);
  padding: var(--sd-space-0-5) var(--sd-space-1);
  white-space: nowrap;
  font: inherit;
}
.studio-shortcuts__unassigned {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
}
.studio-shortcuts__empty {
  padding-block: var(--sd-space-6);
  color: var(--sd-color-text-secondary);
}
.studio-shortcuts__help {
  margin-block-start: var(--sd-space-4);
  font-size: var(--sd-font-size-sm);
  line-height: var(--sd-line-height-default);
}
.studio-shortcuts__help summary {
  cursor: pointer;
  font-weight: 600;
}
.studio-shortcuts__help p,
.studio-shortcuts__help dd,
.studio-shortcuts__help dt span {
  color: var(--sd-color-text-secondary);
}
.studio-shortcuts__help dt {
  margin-block-start: var(--sd-space-3);
}
.studio-shortcuts__help dt span {
  display: block;
  font-size: var(--sd-font-size-xs);
}
.studio-shortcuts__help dd {
  margin: var(--sd-space-1) 0 0;
}
@media (max-width: 40rem) {
  .studio-shortcuts {
    inline-size: calc(100vw - var(--sd-space-4));
  }
  .studio-shortcuts__table {
    min-inline-size: 36rem;
  }
  .studio-shortcuts__header,
  .studio-shortcuts__filters,
  .studio-shortcuts__settings {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sd-space-3);
    margin-block-end: var(--sd-space-3);
    font-size: var(--sd-font-size-sm);
  }
  .studio-shortcuts__notice,
  .studio-shortcuts__body > [role='alert'] {
    font-size: var(--sd-font-size-sm);
    color: var(--sd-color-text-secondary);
  }
  .studio-shortcuts__reset {
    padding: var(--sd-space-3);
    margin-block-end: var(--sd-space-3);
    border: 1px solid var(--sd-color-border-strong);
    border-radius: var(--sd-radius-md);
    background: var(--sd-color-surface-sunken);
    font-size: var(--sd-font-size-sm);
  }
  .studio-shortcuts__reset p {
    margin-block-start: 0;
  }
  .studio-shortcuts__reset [role='alert'] {
    color: var(--sd-color-state-danger);
    margin-block: var(--sd-space-3) 0;
  }
  .studio-shortcuts__body {
    padding-inline: var(--sd-space-4);
  }
}
</style>
