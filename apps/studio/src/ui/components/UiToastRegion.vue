<script setup lang="ts">
import DismissIcon from '~icons/fluent/dismiss-20-regular'
import {
  ToastClose,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from 'reka-ui'

import UiIconButton from '@/ui/components/UiIconButton.vue'
import type { UiToastMessage } from '@/ui/components/ui-toast'

const props = defineProps<{
  readonly message: UiToastMessage | null
}>()
const emit = defineEmits<{
  dismiss: [messageId: number]
}>()

function handleOpenChange(isOpen: boolean): void {
  const message = props.message
  if (!isOpen && message !== null) emit('dismiss', message.id)
}
</script>

<template>
  <ToastProvider label="Seele Studio notification" :duration="3600" swipe-direction="right">
    <ToastPortal>
      <ToastRoot
        v-if="props.message"
        :key="props.message.id"
        class="ui-toast"
        :class="`ui-toast--${props.message.tone}`"
        :open="true"
        type="foreground"
        @update:open="handleOpenChange"
      >
        <span class="ui-toast__indicator" aria-hidden="true"></span>
        <div class="ui-toast__copy">
          <ToastTitle class="ui-toast__title">{{ props.message.title }}</ToastTitle>
          <ToastDescription v-if="props.message.description" class="ui-toast__description">
            {{ props.message.description }}
          </ToastDescription>
        </div>
        <ToastClose as-child>
          <UiIconButton :icon="DismissIcon" label="Dismiss notification" size="small" />
        </ToastClose>
      </ToastRoot>
      <ToastViewport
        class="ui-toast-viewport"
        :hotkey="['F8']"
        label="Notifications ({hotkey})"
      />
    </ToastPortal>
  </ToastProvider>
</template>

<style scoped>
:global(.ui-toast-viewport) {
  position: fixed;
  z-index: var(--sd-layer-popover);
  inset-block-end: 0;
  inset-inline-end: 0;
  display: flex;
  inline-size: min(24rem, 100vw);
  max-block-size: 100vh;
  flex-direction: column;
  gap: var(--sd-space-3);
  margin: 0;
  padding: var(--sd-space-5);
  list-style: none;
  outline: none;
}

:global(.ui-toast) {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--sd-space-3);
  align-items: start;
  padding: var(--sd-space-4);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  box-shadow: var(--sd-shadow-overlay);
  animation: ui-toast-in var(--sd-motion-duration-normal) var(--sd-motion-easing-standard);
}

:global(.ui-toast[data-state='closed']) {
  animation: ui-toast-out var(--sd-motion-duration-fast) var(--sd-motion-easing-exit);
}

:global(.ui-toast[data-swipe='move']) {
  transform: translateX(var(--reka-toast-swipe-move-x));
}

:global(.ui-toast[data-swipe='cancel']) {
  transform: translateX(0);
  transition: transform var(--sd-motion-duration-normal) var(--sd-motion-easing-standard);
}

:global(.ui-toast[data-swipe='end']) {
  animation: ui-toast-swipe-out var(--sd-motion-duration-normal) var(--sd-motion-easing-exit);
}

:global(.ui-toast__indicator) {
  inline-size: var(--sd-space-2);
  block-size: var(--sd-control-height-sm);
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-state-info);
}

:global(.ui-toast--success .ui-toast__indicator) {
  background: var(--sd-color-state-success);
}

:global(.ui-toast--warning .ui-toast__indicator) {
  background: var(--sd-color-state-warning);
}

:global(.ui-toast--danger .ui-toast__indicator) {
  background: var(--sd-color-state-danger);
}

:global(.ui-toast__copy) {
  display: grid;
  gap: var(--sd-space-1);
  min-inline-size: 0;
}

:global(.ui-toast__title) {
  font-size: var(--sd-font-size-sm);
  font-weight: 700;
  line-height: var(--sd-line-height-tight);
}

:global(.ui-toast__description) {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

@keyframes ui-toast-in {
  from {
    opacity: 0;
    transform: translateY(var(--sd-space-3));
  }
}

@keyframes ui-toast-out {
  to {
    opacity: 0;
    transform: translateY(var(--sd-space-2));
  }
}

@keyframes ui-toast-swipe-out {
  to {
    transform: translateX(calc(100% + var(--sd-space-5)));
  }
}

@media (prefers-reduced-motion: reduce) {
  :global(.ui-toast),
  :global(.ui-toast[data-state='closed']),
  :global(.ui-toast[data-swipe='end']) {
    animation: none;
  }
}
</style>
