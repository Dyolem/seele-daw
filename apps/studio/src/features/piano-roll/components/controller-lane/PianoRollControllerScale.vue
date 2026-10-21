<script setup lang="ts">
import { CONTROLLER_LANE_VALUE_INSET } from '@/features/piano-roll/layout/controller-lane-policy'
</script>
<template>
  <div
    class="piano-roll-controller-scale"
    :style="{ '--controller-value-inset': `${CONTROLLER_LANE_VALUE_INSET}px` }"
    aria-hidden="true"
  >
    <span>127</span><span>64</span><span>0</span>
  </div>
</template>
<style scoped>
.piano-roll-controller-scale {
  position: relative;
  min-block-size: 0;
  border-inline-end: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  background: var(--sd-color-surface-panel);
}
.piano-roll-controller-scale > span {
  position: absolute;
  inset-inline-end: var(--sd-space-2);
  inset-block-start: 50%;
  translate: 0 -50%;
}
.piano-roll-controller-scale > span:first-child {
  inset-block-start: var(--controller-value-inset);
}
.piano-roll-controller-scale > span:last-child {
  inset-block-start: calc(100% - var(--controller-value-inset));
}
</style>
