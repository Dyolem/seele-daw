<script setup lang="ts">
import { nextTick, watch } from 'vue'
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogRoot,
  AlertDialogTitle,
} from 'reka-ui'

interface UiAlertDialogProps {
  readonly open: boolean
}

const props = defineProps<UiAlertDialogProps>()
const emit = defineEmits<{
  requestClose: []
}>()

let returnFocusTarget: HTMLElement | null = null

watch(
  () => props.open,
  (isOpen, wasOpen) => {
    if (isOpen && !wasOpen) {
      returnFocusTarget =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }

    if (!isOpen && wasOpen) {
      const target = returnFocusTarget
      returnFocusTarget = null
      void nextTick(() => {
        if (target?.isConnected) target.focus({ preventScroll: true })
      })
    }
  },
  { flush: 'sync' },
)

function handleOpenChange(isOpen: boolean): void {
  if (!isOpen && props.open) emit('requestClose')
}
</script>

<template>
  <AlertDialogRoot :open="props.open" @update:open="handleOpenChange">
    <AlertDialogPortal>
      <AlertDialogOverlay class="ui-alert-dialog__overlay" />
      <AlertDialogContent class="ui-alert-dialog__content">
        <div class="ui-alert-dialog__heading">
          <AlertDialogTitle class="ui-alert-dialog__title">
            <slot name="title" />
          </AlertDialogTitle>
          <AlertDialogDescription class="ui-alert-dialog__description">
            <slot name="description" />
          </AlertDialogDescription>
        </div>

        <div v-if="$slots.default" class="ui-alert-dialog__body">
          <slot />
        </div>

        <footer class="ui-alert-dialog__actions">
          <AlertDialogCancel v-if="$slots.cancel" as-child>
            <slot name="cancel" />
          </AlertDialogCancel>
          <div class="ui-alert-dialog__decisions">
            <slot name="actions" />
          </div>
        </footer>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

<style scoped>
.ui-alert-dialog__overlay {
  position: fixed;
  z-index: var(--sd-layer-modal);
  inset: 0;
  background: var(--sd-color-surface-scrim);
  animation: ui-alert-dialog-overlay-in var(--sd-motion-duration-normal)
    var(--sd-motion-easing-standard);
}

.ui-alert-dialog__content {
  position: fixed;
  z-index: var(--sd-layer-modal);
  inset-block-start: 50%;
  inset-inline-start: 50%;
  display: grid;
  inline-size: min(calc(100vw - var(--sd-space-8)), 32.5rem);
  max-block-size: min(calc(100vh - var(--sd-space-8)), 40rem);
  overflow: auto;
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  box-shadow: var(--sd-shadow-overlay);
  transform: translate(-50%, -50%);
  animation: ui-alert-dialog-content-in var(--sd-motion-duration-normal)
    var(--sd-motion-easing-standard);
}

.ui-alert-dialog__content::before {
  position: absolute;
  inset-block-start: 0;
  inset-inline: var(--sd-space-6);
  block-size: 1px;
  background: var(--sd-color-border-focus);
  content: '';
  opacity: 0.7;
}

.ui-alert-dialog__content:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.ui-alert-dialog__heading {
  padding: var(--sd-space-6) var(--sd-space-6) 0;
}

.ui-alert-dialog__title {
  margin: 0;
  font-size: var(--sd-font-size-xl);
  font-weight: 680;
  line-height: var(--sd-line-height-tight);
  letter-spacing: -0.015em;
}

.ui-alert-dialog__description {
  margin: var(--sd-space-3) 0 0;
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-md);
  line-height: var(--sd-line-height-relaxed);
}

.ui-alert-dialog__body {
  padding: var(--sd-space-4) var(--sd-space-6) 0;
}

.ui-alert-dialog__actions {
  display: flex;
  gap: var(--sd-space-3);
  align-items: center;
  justify-content: space-between;
  padding: var(--sd-space-6);
}

.ui-alert-dialog__decisions {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  justify-content: flex-end;
}

@keyframes ui-alert-dialog-overlay-in {
  from {
    opacity: 0;
  }
}

@keyframes ui-alert-dialog-content-in {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + var(--sd-space-2)));
  }
}

@media (max-width: 30rem) {
  .ui-alert-dialog__actions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .ui-alert-dialog__decisions {
    align-items: stretch;
    flex-direction: column-reverse;
  }

  .ui-alert-dialog__actions :deep(.ui-button) {
    inline-size: 100%;
  }
}
</style>
