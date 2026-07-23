<script setup lang="ts">
import type { Component } from 'vue'

type UiIconSize = 16 | 20 | 24

interface UiIconProps {
  readonly icon: Component
  readonly size?: UiIconSize
}

const props = withDefaults(defineProps<UiIconProps>(), {
  size: 20,
})
</script>

<template>
  <component
    :is="props.icon"
    class="ui-icon"
    :class="`ui-icon--${props.size}`"
    aria-hidden="true"
    focusable="false"
  />
</template>

<style scoped>
.ui-icon {
  display: block;
  flex: 0 0 auto;
  color: currentcolor;
}

.ui-icon--16 {
  inline-size: 1rem;
  block-size: 1rem;
}

.ui-icon--20 {
  inline-size: 1.25rem;
  block-size: 1.25rem;
}

.ui-icon--24 {
  inline-size: 1.5rem;
  block-size: 1.5rem;
}
</style>
