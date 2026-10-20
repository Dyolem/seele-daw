<script setup lang="ts" generic="Value extends string">
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectIcon,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
} from 'reka-ui'
import ChevronDownIcon from '~icons/fluent/chevron-down-16-regular'
import CheckmarkIcon from '~icons/fluent/checkmark-16-regular'
import { computed, shallowRef, useTemplateRef } from 'vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiMenuSurface from '@/ui/components/UiMenuSurface.vue'
import {
  SELECT_CONTENT_COLLISION_PADDING,
  SELECT_CONTENT_SIDE_OFFSET,
  useSelectContentSize,
} from './use-select-content-size'

defineOptions({ inheritAttrs: false })
const value = defineModel<Value>({ required: true })
const props = defineProps<{
  readonly options: readonly { readonly value: Value; readonly label: string }[]
  readonly disabled?: boolean
  readonly size?: 'small' | 'medium'
  readonly placeholder?: string
}>()
// Trigger text must remain independent of the popup items' mount lifecycle.
const displayLabel = computed(
  () =>
    props.options.find((option) => option.value === value.value)?.label ?? props.placeholder ?? '',
)
const open = shallowRef(false)
const triggerElement = useTemplateRef<HTMLButtonElement>('triggerElement')
const contentStyle = useSelectContentSize(triggerElement, open)
</script>

<template>
  <SelectRoot v-model="value" v-model:open="open" :disabled="disabled">
    <SelectTrigger as-child>
      <button
        ref="triggerElement"
        v-bind="$attrs"
        class="ui-select__trigger"
        :data-size="size ?? 'medium'"
        type="button"
      >
        <SelectValue class="ui-select__value" :placeholder="placeholder">{{
          displayLabel
        }}</SelectValue>
        <SelectIcon class="ui-select__chevron"
          ><UiIcon :icon="ChevronDownIcon" :size="16"
        /></SelectIcon>
      </button>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        as-child
        position="popper"
        align="start"
        avoid-collisions
        side-flip
        :side-offset="SELECT_CONTENT_SIDE_OFFSET"
        :collision-padding="SELECT_CONTENT_COLLISION_PADDING"
      >
        <UiMenuSurface class="ui-select__content" :style="contentStyle">
          <SelectViewport as-child>
            <div class="ui-select__viewport">
              <SelectItem
                v-for="option in options"
                :key="option.value"
                :value="option.value"
                class="ui-select__option"
              >
                <SelectItemText>{{ option.label }}</SelectItemText>
                <SelectItemIndicator class="ui-select__check"
                  ><UiIcon :icon="CheckmarkIcon" :size="16"
                /></SelectItemIndicator>
              </SelectItem>
            </div>
          </SelectViewport>
        </UiMenuSurface>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<style scoped>
.ui-select__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sd-space-4);
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3) var(--sd-space-4);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  font: inherit;
  font-size: var(--sd-font-size-sm);
  cursor: pointer;
}
.ui-select__trigger[data-size='small'] {
  min-block-size: var(--sd-control-height-sm);
  padding-inline-start: var(--sd-space-2);
  border-radius: var(--sd-radius-sm);
  font-size: var(--sd-font-size-xs);
}
.ui-select__trigger:hover:not(:disabled) {
  border-color: var(--sd-color-border-strong);
  background: var(--sd-color-control-secondary-hover);
}
.ui-select__trigger:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}
.ui-select__trigger:disabled {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
}
.ui-select__chevron {
  display: inline-flex;
  flex: 0 0 auto;
}
.ui-select__value {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select__content {
  --ui-select-visible-option-count: 8;
  z-index: var(--sd-layer-modal);
  min-inline-size: min(12rem, calc(100dvw - var(--sd-space-4)));
  max-block-size: min(
    calc(
      var(--ui-select-visible-option-count) * var(--sd-control-height-md) + var(--sd-space-2) * 2 +
        2px
    ),
    var(--ui-select-available-height, calc(100dvh - var(--sd-space-4)))
  );
  overflow: hidden;
}
.ui-select__viewport {
  min-block-size: 0;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--sd-color-border-strong) transparent;
}
/* SelectViewport hides native scrollbars by default; the Studio list keeps them discoverable. */
.ui-select__viewport::-webkit-scrollbar {
  display: block;
  width: var(--sd-space-2);
}
.ui-select__viewport::-webkit-scrollbar-thumb {
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-border-strong);
}
.ui-select__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sd-space-4);
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-sm);
  outline: none;
  cursor: pointer;
}
.ui-select__option[data-highlighted] {
  background: var(--sd-color-control-secondary-hover);
}
.ui-select__check {
  display: inline-flex;
  margin-inline-start: auto;
  color: var(--sd-color-border-focus);
}
</style>
