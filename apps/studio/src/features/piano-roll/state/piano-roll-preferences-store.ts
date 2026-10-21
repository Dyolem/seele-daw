import {
  PIANO_ROLL_TOOL,
  PIANO_ROLL_EDITING_SCOPE,
  PIANO_ROLL_GRID_PRESET,
  PIANO_ROLL_PITCH_VIEW_MODE,
  type PianoRollPitchViewMode,
  type PianoRollTool,
  type PianoRollEditingScope,
  type PianoRollGridPreset,
} from '@/features/piano-roll/types/piano-roll-preferences'
import {
  PROJECT_PPQ,
  parseMidiChannel,
  parsePositiveTick,
  type MidiChannel,
  type Tick,
  type MidiPitch,
  MIDI_PITCH_MIN,
  MIDI_PITCH_MAX,
} from '@seele-daw/project-core'
import { PIANO_ROLL_DEFAULT_CENTER_PITCH } from '@seele-daw/editor'
import {
  PIANO_ROLL_DEFAULT_PITCH_RANGE_SIZE,
  PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE,
  PIANO_ROLL_PITCH_COUNT,
  PIANO_ROLL_FIT_PITCH_PADDING,
  PIANO_ROLL_PITCH_ZOOM_FACTOR,
} from '@/features/piano-roll/viewport/pitch-viewport-policy'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

const GRID_PRESET_SUBDIVISION_SPAN_TICK = Object.freeze({
  [PIANO_ROLL_GRID_PRESET.SIXTEENTH]: parsePositiveTick(PROJECT_PPQ / 4),
}) satisfies Readonly<Record<PianoRollGridPreset, Tick>>

export const PIANO_ROLL_DEFAULT_TOOL = PIANO_ROLL_TOOL.PENCIL
export const PIANO_ROLL_DEFAULT_EDITING_SCOPE = PIANO_ROLL_EDITING_SCOPE.TRACK
export const PIANO_ROLL_DEFAULT_SNAP_ENABLED = true
export const PIANO_ROLL_DEFAULT_GRID_PRESET = PIANO_ROLL_GRID_PRESET.SIXTEENTH
/** MIDI facts are zero-based, while the visible Channel selector is numbered 1–16. */
export const PIANO_ROLL_DEFAULT_SUSTAIN_PEDAL_CHANNEL = parseMidiChannel(0)

/**
 * Owns lightweight Piano Roll preferences for one Studio application lifetime.
 *
 * Project and Clip lifecycle changes intentionally do not reset this Store.
 */
export const usePianoRollPreferencesStore = defineStore('piano-roll-preferences', () => {
  const activeTool = shallowRef<PianoRollTool>(PIANO_ROLL_DEFAULT_TOOL)
  const editingScope = shallowRef<PianoRollEditingScope>(PIANO_ROLL_DEFAULT_EDITING_SCOPE)
  const snapEnabled = shallowRef(PIANO_ROLL_DEFAULT_SNAP_ENABLED)
  const gridPreset = shallowRef<PianoRollGridPreset>(PIANO_ROLL_DEFAULT_GRID_PRESET)
  const sustainPedalChannel = shallowRef<MidiChannel>(PIANO_ROLL_DEFAULT_SUSTAIN_PEDAL_CHANNEL)
  const pitchViewMode = shallowRef<PianoRollPitchViewMode>(PIANO_ROLL_PITCH_VIEW_MODE.STANDARD)
  const pitchCenter = shallowRef<number>(PIANO_ROLL_DEFAULT_CENTER_PITCH)
  const pitchRangeSize = shallowRef(PIANO_ROLL_DEFAULT_PITCH_RANGE_SIZE)
  const subdivisionSpanTick = computed(() => GRID_PRESET_SUBDIVISION_SPAN_TICK[gridPreset.value])

  function activateTool(tool: PianoRollTool): void {
    activeTool.value = tool
  }

  function selectEditingScope(scope: PianoRollEditingScope): void {
    editingScope.value = scope
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

  function selectSustainPedalChannel(channel: MidiChannel): void {
    sustainPedalChannel.value = parseMidiChannel(channel)
  }

  function reset(): void {
    activeTool.value = PIANO_ROLL_DEFAULT_TOOL
    editingScope.value = PIANO_ROLL_DEFAULT_EDITING_SCOPE
    snapEnabled.value = PIANO_ROLL_DEFAULT_SNAP_ENABLED
    gridPreset.value = PIANO_ROLL_DEFAULT_GRID_PRESET
    sustainPedalChannel.value = PIANO_ROLL_DEFAULT_SUSTAIN_PEDAL_CHANNEL
    pitchViewMode.value = PIANO_ROLL_PITCH_VIEW_MODE.STANDARD
    pitchCenter.value = PIANO_ROLL_DEFAULT_CENTER_PITCH
    pitchRangeSize.value = PIANO_ROLL_DEFAULT_PITCH_RANGE_SIZE
  }

  function selectPitchViewMode(mode: PianoRollPitchViewMode): void {
    pitchViewMode.value = mode
  }

  function setPitchCenter(center: number): void {
    if (!Number.isFinite(center)) return
    pitchCenter.value = Math.max(MIDI_PITCH_MIN, Math.min(MIDI_PITCH_MAX, center))
  }

  function zoomPitchRange(direction: 'in' | 'out'): void {
    const factor =
      direction === 'in' ? 1 / PIANO_ROLL_PITCH_ZOOM_FACTOR : PIANO_ROLL_PITCH_ZOOM_FACTOR
    pitchRangeSize.value = Math.min(
      PIANO_ROLL_PITCH_COUNT,
      Math.max(PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE, Math.round(pitchRangeSize.value * factor)),
    )
  }

  function fitPitchRange(pitches: readonly MidiPitch[]): void {
    if (pitches.length === 0) return
    let minimum = MIDI_PITCH_MAX
    let maximum = MIDI_PITCH_MIN
    for (const pitch of pitches) {
      minimum = Math.min(minimum, pitch)
      maximum = Math.max(maximum, pitch)
    }
    minimum = Math.max(MIDI_PITCH_MIN, minimum - PIANO_ROLL_FIT_PITCH_PADDING)
    maximum = Math.min(MIDI_PITCH_MAX, maximum + PIANO_ROLL_FIT_PITCH_PADDING)
    pitchCenter.value = (minimum + maximum) / 2
    pitchRangeSize.value = Math.max(PIANO_ROLL_MINIMUM_PITCH_RANGE_SIZE, maximum - minimum + 1)
    pitchViewMode.value = PIANO_ROLL_PITCH_VIEW_MODE.RANGE
  }

  return {
    activeTool,
    editingScope,
    snapEnabled,
    gridPreset,
    sustainPedalChannel,
    pitchViewMode,
    pitchCenter,
    pitchRangeSize,
    selectPitchViewMode,
    setPitchCenter,
    zoomPitchRange,
    fitPitchRange,
    subdivisionSpanTick,
    activateTool,
    selectEditingScope,
    setSnapEnabled,
    toggleSnap,
    selectGridPreset,
    selectSustainPedalChannel,
    reset,
  }
})
