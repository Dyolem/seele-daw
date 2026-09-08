<template>
  <div class="ui-menu-surface">
    <slot />
  </div>
</template>

<style scoped>
.ui-menu-surface {
  z-index: var(--sd-layer-popover);
  min-inline-size: min(14rem, calc(100dvw - var(--sd-space-4)));
  max-inline-size: calc(100dvw - var(--sd-space-4));
  max-block-size: calc(100dvh - var(--sd-space-4));
  overflow: auto;
  overscroll-behavior: contain;
  padding: var(--sd-space-2);
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-lg);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  box-shadow: var(--sd-shadow-overlay);
  outline: none;
  animation: ui-menu-surface-in var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

@keyframes ui-menu-surface-in {
  from {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-menu-surface {
    animation: none;
  }
}
</style>
