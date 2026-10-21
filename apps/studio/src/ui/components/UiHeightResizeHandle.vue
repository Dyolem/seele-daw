<script setup lang="ts">
import { computed, onBeforeUnmount, useTemplateRef, watch } from 'vue'

const props = defineProps<{
  readonly label: string
  readonly modelValue: number
  readonly minimum: number
  readonly maximum: number
}>()
const emit = defineEmits<{
  'update:modelValue': [height: number]
  resizeStart: []
  resizeEnd: [cancelled: boolean]
}>()
const element = useTemplateRef<HTMLElement>('element')
const bounded = (height: number) =>
  Math.max(props.minimum, Math.min(props.maximum, Math.round(height)))
const current = computed(() => bounded(props.modelValue))
let drag: { pointerId: number; originY: number; originHeight: number; preference: number } | null =
  null

function finish(cancelled = false): void {
  const previous = drag
  drag = null
  window.removeEventListener('blur', cancel)
  window.removeEventListener('keydown', cancelOnEscape, true)
  if (previous === null) return
  if (cancelled) emit('update:modelValue', previous.preference)
  try {
    if (element.value?.hasPointerCapture?.(previous.pointerId))
      element.value.releasePointerCapture(previous.pointerId)
  } finally {
    emit('resizeEnd', cancelled)
  }
}
function cancel(): void {
  finish(true)
}
function cancelPointer(event: PointerEvent): void {
  if (drag?.pointerId === event.pointerId) cancel()
}
function cancelOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || drag === null) return
  event.preventDefault()
  event.stopPropagation()
  cancel()
}
function start(event: PointerEvent): void {
  if (
    event.button !== 0 ||
    event.isPrimary === false ||
    drag !== null ||
    props.maximum <= props.minimum
  )
    return
  drag = {
    pointerId: event.pointerId,
    originY: event.clientY,
    originHeight: current.value,
    preference: props.modelValue,
  }
  emit('resizeStart')
  try {
    element.value?.focus({ preventScroll: true })
    element.value?.setPointerCapture?.(event.pointerId)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', cancelOnEscape, true)
  } catch (cause) {
    cancel()
    throw cause
  }
  event.preventDefault()
}
function move(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId) return
  emit('update:modelValue', bounded(drag.originHeight + drag.originY - event.clientY))
  event.preventDefault()
}
function end(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId) return
  if (event.clientY === drag.originY) {
    cancel()
    return
  }
  move(event)
  finish()
}
function keydown(event: KeyboardEvent): void {
  if (drag !== null) return
  const step = 16
  let height: number
  switch (event.key) {
    case 'ArrowUp':
      height = current.value + step
      break
    case 'ArrowDown':
      height = current.value - step
      break
    case 'Home':
      height = props.minimum
      break
    case 'End':
      height = props.maximum
      break
    default:
      return
  }
  event.preventDefault()
  event.stopPropagation()
  emit('update:modelValue', bounded(height))
}
watch([() => props.minimum, () => props.maximum], cancel, { flush: 'sync' })
onBeforeUnmount(cancel)
</script>

<template>
  <div
    ref="element"
    class="ui-height-resize-handle"
    role="separator"
    :aria-label="label"
    aria-orientation="horizontal"
    :aria-valuemin="minimum"
    :aria-valuemax="maximum"
    :aria-valuenow="current"
    tabindex="0"
    @pointerdown="start"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="cancelPointer"
    @lostpointercapture="cancelPointer"
    @keydown="keydown"
  >
    <span></span>
  </div>
</template>

<style scoped>
.ui-height-resize-handle {
  display: grid;
  min-block-size: 0;
  place-items: center;
  border-block: 1px solid var(--sd-color-border-strong);
  background: var(--sd-color-surface-sunken);
  cursor: ns-resize;
  touch-action: none;
}
.ui-height-resize-handle > span {
  inline-size: 3.5rem;
  block-size: 2px;
  border-radius: var(--sd-radius-pill);
  background: var(--sd-color-border-strong);
}
.ui-height-resize-handle:hover > span,
.ui-height-resize-handle:focus-visible > span {
  background: var(--sd-color-border-focus);
}
.ui-height-resize-handle:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}
</style>
