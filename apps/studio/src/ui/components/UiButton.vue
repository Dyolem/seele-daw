<script setup lang="ts">
type UiButtonVariant = 'danger' | 'ghost' | 'primary' | 'secondary'
type UiButtonSize = 'medium' | 'small'
type UiButtonType = 'button' | 'reset' | 'submit'

interface UiButtonProps {
  readonly busy?: boolean
  readonly disabled?: boolean
  readonly size?: UiButtonSize
  readonly type?: UiButtonType
  readonly variant?: UiButtonVariant
}

const props = withDefaults(defineProps<UiButtonProps>(), {
  busy: false,
  disabled: false,
  size: 'medium',
  type: 'button',
  variant: 'secondary',
})
</script>

<template>
  <button
    class="ui-button"
    :class="[`ui-button--${props.variant}`, `ui-button--${props.size}`]"
    :type="props.type"
    :disabled="props.disabled || props.busy"
    :aria-busy="props.busy || undefined"
  >
    <span v-if="props.busy" class="ui-button__progress" aria-hidden="true"></span>
    <span v-else-if="$slots.leading" class="ui-button__icon">
      <slot name="leading" />
    </span>
    <span class="ui-button__label"><slot /></span>
  </button>
</template>

<style scoped>
.ui-button {
  display: inline-flex;
  gap: var(--sd-space-2);
  align-items: center;
  justify-content: center;
  min-inline-size: max-content;
  border: 1px solid transparent;
  border-radius: var(--sd-radius-md);
  font-size: var(--sd-font-size-md);
  font-weight: 650;
  line-height: var(--sd-line-height-tight);
  cursor: pointer;
  transition:
    color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    background var(--sd-motion-duration-fast) var(--sd-motion-easing-standard),
    border-color var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.ui-button--medium {
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-4);
}

.ui-button--small {
  min-block-size: var(--sd-control-height-sm);
  padding-inline: var(--sd-space-3);
  font-size: var(--sd-font-size-sm);
}

.ui-button--primary {
  color: var(--sd-color-text-inverse);
  background: var(--sd-color-control-primary);
  border-color: var(--sd-color-control-primary);
}

.ui-button--primary:hover:not(:disabled) {
  background: var(--sd-color-control-primary-hover);
  border-color: var(--sd-color-control-primary-hover);
}

.ui-button--primary:active:not(:disabled) {
  background: var(--sd-color-control-primary-pressed);
  border-color: var(--sd-color-control-primary-pressed);
}

.ui-button--secondary {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-secondary);
  border-color: var(--sd-color-border-default);
}

.ui-button--secondary:hover:not(:disabled) {
  background: var(--sd-color-control-secondary-hover);
  border-color: var(--sd-color-border-strong);
}

.ui-button--secondary:active:not(:disabled) {
  background: var(--sd-color-control-secondary-pressed);
}

.ui-button--danger {
  color: var(--sd-color-control-danger-text);
  background: var(--sd-color-control-danger);
  border-color: var(--sd-color-state-danger);
}

.ui-button--danger:hover:not(:disabled) {
  background: var(--sd-color-control-danger-hover);
}

.ui-button--danger:active:not(:disabled) {
  background: var(--sd-color-control-danger-pressed);
}

.ui-button--ghost {
  color: var(--sd-color-text-secondary);
  background: transparent;
}

.ui-button--ghost:hover:not(:disabled) {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-ghost-hover);
}

.ui-button--ghost:active:not(:disabled) {
  background: var(--sd-color-control-ghost-pressed);
}

.ui-button:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
}

.ui-button:disabled {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
  opacity: 0.72;
}

.ui-button__progress {
  inline-size: var(--sd-space-3);
  block-size: var(--sd-space-3);
  border: 1.5px solid color-mix(in srgb, currentcolor 28%, transparent);
  border-top-color: currentcolor;
  border-radius: var(--sd-radius-pill);
  animation: ui-button-progress var(--sd-motion-duration-slow) linear infinite;
}

.ui-button__label {
  white-space: nowrap;
}

.ui-button__icon {
  display: inline-grid;
  place-items: center;
}

@keyframes ui-button-progress {
  to {
    transform: rotate(1turn);
  }
}
</style>
