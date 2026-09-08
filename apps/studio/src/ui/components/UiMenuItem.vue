<template>
  <div class="ui-menu-item">
    <span v-if="$slots.leading" class="ui-menu-item__leading"><slot name="leading" /></span>
    <span class="ui-menu-item__label"><slot /></span>
    <span v-if="$slots.trailing" class="ui-menu-item__trailing"><slot name="trailing" /></span>
  </div>
</template>

<style scoped>
.ui-menu-item {
  display: flex;
  align-items: center;
  gap: var(--sd-space-3);
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-3);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
  outline: none;
  cursor: pointer;
}

.ui-menu-item:not([aria-disabled='true']):is(:hover, :focus) {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-ghost-hover);
}

.ui-menu-item[aria-disabled='true'] {
  color: var(--sd-color-text-disabled);
  cursor: not-allowed;
}

.ui-menu-item__leading {
  display: inline-flex;
  flex: 0 0 auto;
}

.ui-menu-item__label {
  flex: 1;
  min-inline-size: 0;
  overflow-wrap: anywhere;
}

.ui-menu-item__trailing {
  flex: 0 0 auto;
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  white-space: nowrap;
}
</style>
