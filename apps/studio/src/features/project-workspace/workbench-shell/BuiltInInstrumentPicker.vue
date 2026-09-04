<script setup lang="ts">
import CheckmarkIcon from '~icons/fluent/checkmark-16-regular'
import ChevronDownIcon from '~icons/fluent/chevron-down-16-regular'
import { ref } from 'vue'
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
  TabsContent,
  TabsList,
  TabsRoot,
  TabsTrigger,
} from 'reka-ui'

import UiIcon from '@/ui/components/UiIcon.vue'
import {
  BUILT_IN_INSTRUMENT_PRESET_GROUPS,
  findAvailableBuiltInInstrumentPreset,
  type BuiltInInstrumentPreset,
  type RuntimeUnavailableBuiltInInstrumentPreset,
} from '@/workbench/instrument/built-in-instrument-catalogue'

interface BuiltInInstrumentPickerProps {
  readonly placeholder: boolean
  readonly selectedSoundbankId: string
  readonly triggerText: string
}

const props = defineProps<BuiltInInstrumentPickerProps>()
const emit = defineEmits<{
  select: [soundbankId: string]
  unavailable: [preset: RuntimeUnavailableBuiltInInstrumentPreset]
}>()

const open = ref(false)
const activeCategoryId = ref<string>(BUILT_IN_INSTRUMENT_PRESET_GROUPS[0]?.categoryId ?? 'piano')

function updateOpen(nextOpen: boolean): void {
  open.value = nextOpen
  if (!nextOpen) return
  const selectedPreset = findAvailableBuiltInInstrumentPreset(props.selectedSoundbankId)
  activeCategoryId.value = selectedPreset?.categoryId ?? activeCategoryId.value
}

function choosePreset(preset: BuiltInInstrumentPreset): void {
  if (preset.availability === 'runtime-unavailable') {
    emit('unavailable', preset)
    return
  }
  emit('select', preset.soundbankId)
  open.value = false
}
</script>

<template>
  <PopoverRoot :open="open" @update:open="updateOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="built-in-instrument-picker__trigger"
        :data-placeholder="props.placeholder ? '' : undefined"
        aria-label="Built-in instrument"
      >
        <span>{{ props.triggerText }}</span>
        <span class="built-in-instrument-picker__trigger-icon">
          <UiIcon :icon="ChevronDownIcon" :size="16" />
        </span>
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        class="built-in-instrument-picker__content"
        align="start"
        :side-offset="4"
        :collision-padding="12"
      >
        <header class="built-in-instrument-picker__heading">
          <div>
            <strong>Built-in sounds</strong>
            <span>Preset catalogue</span>
          </div>
          <span>439 Presets · 289 playable</span>
        </header>

        <TabsRoot
          v-model="activeCategoryId"
          class="built-in-instrument-picker__tabs"
          orientation="vertical"
        >
          <TabsList class="built-in-instrument-picker__families" aria-label="Instrument category">
            <TabsTrigger
              v-for="group in BUILT_IN_INSTRUMENT_PRESET_GROUPS"
              :key="group.categoryId"
              class="built-in-instrument-picker__family"
              :data-category-id="group.categoryId"
              :value="group.categoryId"
            >
              <span>{{ group.displayName }}</span>
              <span>{{ group.presets.length }}</span>
            </TabsTrigger>
          </TabsList>

          <div class="built-in-instrument-picker__options-host">
            <TabsContent
              v-for="group in BUILT_IN_INSTRUMENT_PRESET_GROUPS"
              :key="group.categoryId"
              class="built-in-instrument-picker__options"
              :value="group.categoryId"
            >
              <header>
                <strong>{{ group.displayName }}</strong>
                <span>
                  {{ group.presets.filter((preset) => preset.availability === 'available').length }}
                  playable · {{ group.presets.length }} total
                </span>
              </header>
              <div class="built-in-instrument-picker__option-list">
                <button
                  v-for="preset in group.presets"
                  :key="preset.sourcePresetId"
                  type="button"
                  class="built-in-instrument-picker__option"
                  :aria-current="
                    preset.availability === 'available' &&
                    preset.soundbankId === props.selectedSoundbankId
                      ? 'true'
                      : undefined
                  "
                  :data-availability="preset.availability"
                  :data-engine="preset.engine"
                  :data-soundbank-id="
                    preset.availability === 'available' ? preset.soundbankId : undefined
                  "
                  :data-source-preset-id="preset.sourcePresetId"
                  @click="choosePreset(preset)"
                >
                  <span class="built-in-instrument-picker__check">
                    <UiIcon
                      v-if="
                        preset.availability === 'available' &&
                        preset.soundbankId === props.selectedSoundbankId
                      "
                      :icon="CheckmarkIcon"
                      :size="16"
                    />
                  </span>
                  <span class="built-in-instrument-picker__names">
                    <strong>{{ preset.displayName }}</strong>
                    <span>{{ preset.subtitle }}</span>
                  </span>
                  <span class="built-in-instrument-picker__badges">
                    <span
                      v-if="preset.availability === 'runtime-unavailable'"
                      class="built-in-instrument-picker__engine"
                    >
                      {{ preset.engine }}
                    </span>
                    <span
                      v-if="preset.availability === 'runtime-unavailable'"
                      class="built-in-instrument-picker__badge"
                      data-tone="warning"
                    >
                      Not supported
                    </span>
                  </span>
                </button>
              </div>
            </TabsContent>
          </div>
        </TabsRoot>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<style scoped>
.built-in-instrument-picker__trigger {
  display: flex;
  gap: var(--sd-space-2);
  align-items: center;
  justify-content: space-between;
  min-inline-size: 0;
  inline-size: 100%;
  block-size: var(--sd-control-height-sm);
  padding-inline: var(--sd-space-2);
  overflow: hidden;
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-secondary);
  font: inherit;
  font-size: var(--sd-font-size-xs);
  text-align: start;
  cursor: pointer;
}

.built-in-instrument-picker__trigger > span:first-child {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.built-in-instrument-picker__trigger:hover,
.built-in-instrument-picker__trigger[data-state='open'] {
  border-color: var(--sd-color-border-strong);
  background: var(--sd-color-control-secondary-hover);
}

.built-in-instrument-picker__trigger[data-placeholder] {
  color: var(--sd-color-text-muted);
}

.built-in-instrument-picker__trigger:focus-visible,
:global(.built-in-instrument-picker__family:focus-visible),
:global(.built-in-instrument-picker__option:focus-visible) {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.built-in-instrument-picker__trigger-icon {
  display: inline-flex;
  flex: 0 0 auto;
  color: var(--sd-color-text-muted);
  transition: transform var(--sd-motion-duration-fast) var(--sd-motion-easing-standard);
}

.built-in-instrument-picker__trigger[data-state='open'] .built-in-instrument-picker__trigger-icon {
  transform: rotate(180deg);
}

:global(.built-in-instrument-picker__content) {
  z-index: var(--sd-layer-popover);
  inline-size: min(50rem, calc(100vw - var(--sd-space-6)));
  max-block-size: min(36rem, var(--reka-popover-content-available-height));
  overflow: hidden;
  border: 1px solid var(--sd-color-border-strong);
  border-radius: var(--sd-radius-md);
  color: var(--sd-color-text-primary);
  background: var(--sd-color-surface-overlay);
  box-shadow: var(--sd-shadow-overlay);
  outline: none;
  animation: built-in-instrument-picker-in var(--sd-motion-duration-normal)
    var(--sd-motion-easing-standard);
}

:global(.built-in-instrument-picker__heading) {
  display: flex;
  gap: var(--sd-space-4);
  align-items: center;
  justify-content: space-between;
  min-block-size: 3.25rem;
  padding: var(--sd-space-2) var(--sd-space-3);
  border-bottom: 1px solid var(--sd-color-border-subtle);
}

:global(.built-in-instrument-picker__heading > div) {
  display: grid;
  gap: 1px;
}

:global(.built-in-instrument-picker__heading strong) {
  font-size: var(--sd-font-size-sm);
}

:global(.built-in-instrument-picker__heading span) {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  white-space: nowrap;
}

:global(.built-in-instrument-picker__tabs) {
  display: grid;
  grid-template-columns: 12rem minmax(0, 1fr);
  block-size: min(30rem, calc(var(--reka-popover-content-available-height) - 3.25rem));
  min-block-size: 22rem;
}

:global(.built-in-instrument-picker__families) {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-block-size: 0;
  padding: var(--sd-space-2);
  overflow-y: auto;
  border-right: 1px solid var(--sd-color-border-subtle);
  background: var(--sd-color-surface-sunken);
}

:global(.built-in-instrument-picker__family) {
  display: flex;
  flex: 0 0 auto;
  gap: var(--sd-space-2);
  align-items: center;
  justify-content: space-between;
  min-block-size: var(--sd-control-height-sm);
  padding-inline: var(--sd-space-2);
  border: 0;
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-secondary);
  background: transparent;
  font: inherit;
  font-size: var(--sd-font-size-xs);
  font-weight: 600;
  text-align: start;
  white-space: nowrap;
  cursor: pointer;
}

:global(.built-in-instrument-picker__family > span:last-child) {
  color: var(--sd-color-text-muted);
  font-size: 0.625rem;
  font-variant-numeric: tabular-nums;
}

:global(.built-in-instrument-picker__family:hover) {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-ghost-hover);
}

:global(.built-in-instrument-picker__family[data-state='active']) {
  color: var(--sd-color-text-primary);
  background: var(--sd-color-control-secondary);
}

:global(.built-in-instrument-picker__options-host) {
  min-inline-size: 0;
  min-block-size: 0;
  padding: var(--sd-space-2);
  overflow: hidden;
}

:global(.built-in-instrument-picker__options) {
  grid-template-rows: auto minmax(0, 1fr);
  min-inline-size: 0;
  block-size: 100%;
  outline: none;
}

:global(.built-in-instrument-picker__options[data-state='active']) {
  display: grid;
}

:global(.built-in-instrument-picker__options > header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-block-size: var(--sd-control-height-md);
  padding-inline: var(--sd-space-2);
}

:global(.built-in-instrument-picker__options > header strong) {
  font-size: var(--sd-font-size-sm);
}

:global(.built-in-instrument-picker__options > header span) {
  color: var(--sd-color-text-muted);
  font-size: var(--sd-font-size-xs);
  white-space: nowrap;
}

:global(.built-in-instrument-picker__option-list) {
  min-block-size: 0;
  padding-inline-end: var(--sd-space-1);
  overflow-y: auto;
}

:global(.built-in-instrument-picker__option) {
  display: grid;
  grid-template-columns: 1rem minmax(0, 1fr) auto;
  gap: var(--sd-space-2);
  align-items: center;
  min-inline-size: 0;
  inline-size: 100%;
  min-block-size: 2.75rem;
  padding: var(--sd-space-1) var(--sd-space-2);
  border: 0;
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-primary);
  background: transparent;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

:global(.built-in-instrument-picker__option:hover) {
  background: var(--sd-color-control-ghost-hover);
}

:global(.built-in-instrument-picker__option[aria-current='true']) {
  color: var(--sd-color-border-focus);
  background: var(--sd-color-control-secondary);
}

:global(.built-in-instrument-picker__option[data-availability='runtime-unavailable']) {
  color: var(--sd-color-text-secondary);
}

:global(.built-in-instrument-picker__check) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 1rem;
}

:global(.built-in-instrument-picker__names) {
  display: grid;
  gap: 1px;
  min-inline-size: 0;
}

:global(.built-in-instrument-picker__names strong),
:global(.built-in-instrument-picker__names span) {
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: normal;
}

:global(.built-in-instrument-picker__names strong) {
  font-size: var(--sd-font-size-xs);
}

:global(.built-in-instrument-picker__names span) {
  color: var(--sd-color-text-muted);
  font-size: 0.6875rem;
}

:global(.built-in-instrument-picker__badges) {
  display: flex;
  gap: var(--sd-space-1);
  align-items: center;
  justify-content: flex-end;
  min-inline-size: 9.5rem;
}

:global(.built-in-instrument-picker__engine) {
  color: var(--sd-color-text-muted);
  font-size: 0.625rem;
  white-space: nowrap;
}

:global(.built-in-instrument-picker__badge) {
  padding: 1px var(--sd-space-1);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-muted);
  font-size: 0.625rem;
  font-weight: 650;
  line-height: 1.4;
  white-space: nowrap;
}

:global(.built-in-instrument-picker__badge[data-tone='warning']) {
  color: var(--sd-color-state-warning);
  border-color: var(--sd-color-state-warning);
}

@media (max-width: 42rem) {
  :global(.built-in-instrument-picker__content) {
    inline-size: calc(100vw - var(--sd-space-4));
  }

  :global(.built-in-instrument-picker__tabs) {
    grid-template-columns: 9rem minmax(0, 1fr);
  }

  :global(.built-in-instrument-picker__badges) {
    min-inline-size: 0;
  }

  :global(.built-in-instrument-picker__engine) {
    display: none;
  }
}

@keyframes built-in-instrument-picker-in {
  from {
    opacity: 0;
    transform: translateY(calc(var(--sd-space-1) * -1));
  }
}
</style>
