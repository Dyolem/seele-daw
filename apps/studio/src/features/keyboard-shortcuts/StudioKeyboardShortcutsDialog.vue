<script setup lang="ts">
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
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
const { actions, keyboard } = useStudioActions()
const search = shallowRef('')
const assignment = shallowRef<'all' | 'assigned' | 'unassigned'>('all')
const searchField = useTemplateRef<HTMLInputElement>('searchField')
const rows = computed(() => queryStudioShortcuts(actions, keyboard, search.value, assignment.value))
let returnFocusTarget: HTMLElement | null = null
useStudioKeyboardLayer(() => open.value)
watch(
  open,
  (value) => {
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
      >
        <header class="studio-shortcuts__header">
          <div>
            <DialogTitle class="studio-shortcuts__title">Keyboard shortcuts</DialogTitle>
            <DialogDescription class="studio-shortcuts__description"
              >Browse actions, assigned keys, and where they work.</DialogDescription
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
          </select>
          <span role="status">{{ rows.length }} / {{ actions.catalogue.length }} actions</span>
        </div>
        <div class="studio-shortcuts__body">
          <table v-if="rows.length" class="studio-shortcuts__table">
            <caption class="studio-shortcuts__caption">
              Current shortcuts · default keymap · read-only
            </caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Current</th>
                <th scope="col">Default</th>
                <th scope="col">Where it works</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.actionId">
                <th scope="row">
                  <strong>{{ row.label }}</strong
                  ><span>{{ row.description }}</span
                  ><small>{{ row.categoryLabel }}</small>
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
  .studio-shortcuts__body {
    padding-inline: var(--sd-space-4);
  }
}
</style>
