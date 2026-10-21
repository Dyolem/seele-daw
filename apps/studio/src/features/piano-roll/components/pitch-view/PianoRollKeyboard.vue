<script setup lang="ts">
import { computed } from 'vue'
import { pianoRollMidiPitchToCssPixel, type PianoRollPitchViewport } from '@seele-daw/editor'
import { parseMidiPitch } from '@seele-daw/project-core'

const props = defineProps<{ readonly viewport: PianoRollPitchViewport | null }>()
const keys = computed(() => {
  const viewport = props.viewport
  if (viewport === null) return []
  return Array.from({ length: viewport.maximumPitch - viewport.minimumPitch + 1 }, (_, index) => {
    const pitch = parseMidiPitch(viewport.maximumPitch - index)
    const pitchClass = pitch % 12
    return {
      pitch,
      isBlack: [1, 3, 6, 8, 10].includes(pitchClass),
      label: pitchClass === 0 ? `C${Math.floor(pitch / 12) - 1}` : '',
      style: {
        blockSize: `${viewport.pitchRowHeightCssPixel}px`,
        transform: `translateY(${pianoRollMidiPitchToCssPixel(viewport, pitch)}px)`,
      },
    }
  })
})
</script>

<template>
  <div class="piano-roll-keyboard" aria-label="Piano keyboard">
    <div
      v-for="key in keys"
      :key="key.pitch"
      class="piano-roll-keyboard__row"
      :data-pitch="key.pitch"
      :style="key.style"
    >
      <span :class="{ 'piano-roll-keyboard__black': key.isBlack }">{{ key.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.piano-roll-keyboard {
  position: relative;
  min-block-size: 0;
  overflow: hidden;
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-editor-key-white);
}
.piano-roll-keyboard__row {
  position: absolute;
  inset: 0 0 auto;
  box-sizing: border-box;
  border-bottom: 1px solid var(--sd-color-border-strong);
  color: var(--sd-color-text-inverse);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}
.piano-roll-keyboard__row > span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-inline-end: var(--sd-space-2);
}
.piano-roll-keyboard__row > .piano-roll-keyboard__black {
  inline-size: 68%;
  justify-content: flex-start;
  border-radius: 0 var(--sd-radius-xs) var(--sd-radius-xs) 0;
  color: var(--sd-color-text-secondary);
  background: var(--sd-editor-key-black);
}
</style>
