import { PROJECT_PPQ, parsePositiveTick, type Tick } from '@seele-daw/project-core'
import type { ValueOf } from '@seele-daw/type-utils'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

export const PIANO_ROLL_TOOL = {
  CURSOR: 'cursor',
  PENCIL: 'pencil',
} as const

export type PianoRollTool = ValueOf<typeof PIANO_ROLL_TOOL>

export const PIANO_ROLL_GRID_PRESET = {
  SIXTEENTH: '1/16',
} as const

export type PianoRollGridPreset = ValueOf<typeof PIANO_ROLL_GRID_PRESET>

const GRID_PRESET_SUBDIVISION_SPAN_TICK = Object.freeze({
  [PIANO_ROLL_GRID_PRESET.SIXTEENTH]: parsePositiveTick(PROJECT_PPQ / 4),
}) satisfies Readonly<Record<PianoRollGridPreset, Tick>>

export const PIANO_ROLL_DEFAULT_TOOL = PIANO_ROLL_TOOL.PENCIL
export const PIANO_ROLL_DEFAULT_SNAP_ENABLED = true
export const PIANO_ROLL_DEFAULT_GRID_PRESET =
  PIANO_ROLL_GRID_PRESET.SIXTEENTH

/**
 * Owns lightweight Piano Roll preferences for one Studio application lifetime.
 *
 * Project and Clip lifecycle changes intentionally do not reset this Store.
 */
export const usePianoRollPreferencesStore = defineStore(
  'piano-roll-preferences',
  () => {
    const activeTool = shallowRef<PianoRollTool>(PIANO_ROLL_DEFAULT_TOOL)
    const snapEnabled = shallowRef(PIANO_ROLL_DEFAULT_SNAP_ENABLED)
    const gridPreset = shallowRef<PianoRollGridPreset>(
      PIANO_ROLL_DEFAULT_GRID_PRESET,
    )
    const subdivisionSpanTick = computed(
      () => GRID_PRESET_SUBDIVISION_SPAN_TICK[gridPreset.value],
    )

    function activateTool(tool: PianoRollTool): void {
      activeTool.value = tool
    }

    function setSnapEnabled(enabled: boolean): void {
      snapEnabled.value = enabled
    }

    function toggleSnap(): void {
      snapEnabled.value = !snapEnabled.value
    }

    function selectGridPreset(preset: PianoRollGridPreset): void {
      gridPreset.value = preset
    }

    function reset(): void {
      activeTool.value = PIANO_ROLL_DEFAULT_TOOL
      snapEnabled.value = PIANO_ROLL_DEFAULT_SNAP_ENABLED
      gridPreset.value = PIANO_ROLL_DEFAULT_GRID_PRESET
    }

    return {
      activeTool,
      snapEnabled,
      gridPreset,
      subdivisionSpanTick,
      activateTool,
      setSnapEnabled,
      toggleSnap,
      selectGridPreset,
      reset,
    }
  },
)
