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
import UiIcon from '@/ui/components/UiIcon.vue'
import UiMenuSurface from '@/ui/components/UiMenuSurface.vue'

defineOptions({ inheritAttrs: false })
const value = defineModel<Value>({ required: true })
defineProps<{
  readonly options: readonly { readonly value: Value; readonly label: string }[]
  readonly disabled?: boolean
  readonly size?: 'small' | 'medium'
  readonly placeholder?: string
}>()
</script>

<template>
  <SelectRoot v-model="value" :disabled="disabled">
    <SelectTrigger v-bind="$attrs" class="ui-select__trigger" :data-size="size ?? 'medium'">
      <SelectValue class="ui-select__value" :placeholder="placeholder" />
      <SelectIcon class="ui-select__chevron"
        ><UiIcon :icon="ChevronDownIcon" :size="16"
      /></SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        as-child
        position="popper"
        align="start"
        :side-offset="6"
        :collision-padding="8"
      >
        <UiMenuSurface class="ui-select__content">
          <SelectViewport>
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
  z-index: var(--sd-layer-modal);
  min-inline-size: 12rem;
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
