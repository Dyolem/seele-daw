<script setup lang="ts">
import type { Component } from 'vue'

import UiIcon from '@/ui/components/UiIcon.vue'

type UiIconButtonSize = 'medium' | 'small'

interface UiIconButtonProps {
  readonly disabled?: boolean
  readonly icon: Component
  readonly label: string
  readonly pressed?: boolean
  readonly size?: UiIconButtonSize
}

const props = withDefaults(defineProps<UiIconButtonProps>(), {
  disabled: false,
  pressed: undefined,
  size: 'medium',
})
</script>

<template>
  <button
    class="ui-icon-button"
    :class="`ui-icon-button--${props.size}`"
    type="button"
    :aria-label="props.label"
    :aria-pressed="props.pressed"
    :disabled="props.disabled"
    :title="props.label"
  >
    <UiIcon :icon="props.icon" :size="props.size === 'small' ? 16 : 20" />
  </button>
</template>

<style scoped>
.ui-icon-button {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    border-color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.ui-icon-button--medium {
  inline-size: var(--sd-control-height-md);
  block-size: var(--sd-control-height-md);
}

.ui-icon-button--small {
  inline-size: var(--sd-control-height-sm);
  block-size: var(--sd-control-height-sm);
  border-radius: var(--sd-radius-sm);
}

.ui-icon-button:hover:not(:disabled) {
  border-color: var(--sd-color-border-subtle);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-ghost-hover);
}

.ui-icon-button:active:not(:disabled) {
  background: var(--sd-color-control-ghost-pressed);
}

.ui-icon-button[aria-pressed='true'] {
  border-color: var(--sd-color-border-default);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-secondary);
}

.ui-icon-button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.ui-icon-button:disabled {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
  opacity: 0.72;
}
</style>
