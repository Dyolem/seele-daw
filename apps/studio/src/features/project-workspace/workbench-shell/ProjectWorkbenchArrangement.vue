<script setup lang="ts">
import AddIcon from '~icons/fluent/add-20-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import MoreIcon from '~icons/fluent/more-horizontal-20-regular'
import MusicNoteIcon from '~icons/fluent/music-note-2-20-regular'
import ZoomInIcon from '~icons/fluent/zoom-in-20-regular'
import ZoomOutIcon from '~icons/fluent/zoom-out-20-regular'

import UiButton from '@/ui/components/UiButton.vue'
import UiIcon from '@/ui/components/UiIcon.vue'
import UiIconButton from '@/ui/components/UiIconButton.vue'
</script>

<template>
  <div class="project-workbench__arrangement-layout">
    <aside class="project-workbench__track-panel" aria-label="Tracks">
      <header class="project-workbench__track-heading">
        <strong>Tracks</strong>
        <UiIconButton
          disabled
          :icon="MoreIcon"
          label="Track options — track editing is not available"
          size="small"
        />
      </header>
      <div class="project-workbench__track-actions">
        <UiButton disabled size="small" variant="secondary">
          <template #leading>
            <UiIcon :icon="AddIcon" :size="16" />
          </template>
          Add track
        </UiButton>
      </div>
      <div class="project-workbench__track-empty">
        <span>
          <UiIcon :icon="MusicNoteIcon" :size="20" />
        </span>
        <strong>No tracks yet</strong>
        <p>Track creation will arrive with the Arrangement editor.</p>
      </div>
    </aside>

    <section class="project-workbench__arrangement" aria-label="Arrangement host">
      <header class="project-workbench__ruler">
        <ol aria-label="Timeline bars">
          <li v-for="bar in 8" :key="bar">{{ bar }}</li>
        </ol>
        <div class="project-workbench__arrangement-tools">
          <UiIconButton
            disabled
            :icon="GridIcon"
            label="Grid settings — Arrangement is not available"
            size="small"
          />
          <UiIconButton
            disabled
            :icon="ZoomOutIcon"
            label="Zoom out — Arrangement is not available"
            size="small"
          />
          <UiIconButton
            disabled
            :icon="ZoomInIcon"
            label="Zoom in — Arrangement is not available"
            size="small"
          />
        </div>
      </header>
      <div class="project-workbench__arrangement-host">
        <div class="project-workbench__surface-empty">
          <span><UiIcon :icon="GridIcon" :size="24" /></span>
          <strong>Arrangement</strong>
          <p>The editor surface will be composed here in the next product slice.</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.project-workbench__arrangement-layout {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-row: 1;
  grid-template-columns: var(--project-workbench-track-width) minmax(0, 1fr);
}

.project-workbench__track-panel {
  display: grid;
  min-block-size: 0;
  grid-template-rows: var(--project-workbench-ruler-height) auto minmax(0, 1fr);
  border-inline-end: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading,
.project-workbench__ruler {
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-workbench__track-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: var(--sd-space-3) var(--sd-space-1);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-actions {
  padding: var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

.project-workbench__track-actions :deep(.ui-button) {
  inline-size: 100%;
}

.project-workbench__track-empty {
  display: grid;
  min-block-size: 0;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-5);
  color: var(--sd-color-text-muted);
  text-align: center;
}

.project-workbench__track-empty > span,
.project-workbench__surface-empty > span {
  display: grid;
  inline-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  block-size: calc(var(--sd-control-height-md) + var(--sd-space-2));
  margin-bottom: var(--sd-space-3);
  place-items: center;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-border-focus);
  background: var(--sd-color-surface-sunken);
}

.project-workbench__track-empty strong,
.project-workbench__surface-empty strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-sm);
}

.project-workbench__track-empty p,
.project-workbench__surface-empty p {
  max-inline-size: 24rem;
  margin: var(--sd-space-2) 0 0;
  font-size: var(--sd-font-size-xs);
  line-height: var(--sd-line-height-default);
}

.project-workbench__arrangement {
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  grid-template-rows: var(--project-workbench-ruler-height) minmax(0, 1fr);
  background: var(--sd-color-surface-canvas);
}

.project-workbench__ruler {
  position: relative;
  min-inline-size: 0;
}

.project-workbench__ruler ol {
  display: grid;
  block-size: 100%;
  grid-template-columns: repeat(8, minmax(5rem, 1fr));
  min-inline-size: 40rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-workbench__ruler li {
  padding: var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-workbench__arrangement-tools {
  position: absolute;
  inset-block-start: var(--sd-space-0-5);
  inset-inline-end: var(--sd-space-2);
  display: flex;
  gap: var(--sd-space-0-5);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  background: var(--sd-color-surface-panel);
}

.project-workbench__arrangement-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background:
    linear-gradient(to right, var(--sd-color-border-subtle) 1px, transparent 1px),
    var(--sd-color-surface-canvas);
  background-size: calc(100% / 8) 100%;
}

.project-workbench__surface-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  padding: var(--sd-space-6);
  color: var(--sd-color-text-muted);
  text-align: center;
}
</style>
