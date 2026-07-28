import { PROJECT_PPQ } from '@seele-daw/project-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_DEFAULT_GRID_PRESET,
  PIANO_ROLL_DEFAULT_SNAP_ENABLED,
  PIANO_ROLL_DEFAULT_TOOL,
  PIANO_ROLL_GRID_PRESET,
  PIANO_ROLL_TOOL,
  usePianoRollPreferencesStore,
} from '@/features/piano-roll/piano-roll-preferences-store'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Piano Roll Preferences Store', () => {
  it('starts with the accepted Pencil, Snap and 1/16 defaults', () => {
    const preferences = usePianoRollPreferencesStore()

    expect(preferences.activeTool).toBe(PIANO_ROLL_DEFAULT_TOOL)
    expect(preferences.activeTool).toBe(PIANO_ROLL_TOOL.PENCIL)
    expect(preferences.snapEnabled).toBe(PIANO_ROLL_DEFAULT_SNAP_ENABLED)
    expect(preferences.snapEnabled).toBe(true)
    expect(preferences.gridPreset).toBe(PIANO_ROLL_DEFAULT_GRID_PRESET)
    expect(preferences.gridPreset).toBe(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    expect(preferences.subdivisionSpanTick).toBe(PROJECT_PPQ / 4)
  })

  it('changes Tool and Snap without coupling either preference', () => {
    const preferences = usePianoRollPreferencesStore()

    preferences.activateTool(PIANO_ROLL_TOOL.CURSOR)
    expect(preferences.activeTool).toBe(PIANO_ROLL_TOOL.CURSOR)
    expect(preferences.snapEnabled).toBe(true)

    preferences.setSnapEnabled(false)
    expect(preferences.activeTool).toBe(PIANO_ROLL_TOOL.CURSOR)
    expect(preferences.snapEnabled).toBe(false)

    preferences.toggleSnap()
    expect(preferences.snapEnabled).toBe(true)
  })

  it('keeps preferences across consumers in the same Studio application', () => {
    const pinia = createPinia()
    const firstConsumer = usePianoRollPreferencesStore(pinia)

    firstConsumer.activateTool(PIANO_ROLL_TOOL.CURSOR)
    firstConsumer.setSnapEnabled(false)
    firstConsumer.selectGridPreset(PIANO_ROLL_GRID_PRESET.SIXTEENTH)

    const nextClipConsumer = usePianoRollPreferencesStore(pinia)
    expect(nextClipConsumer).toBe(firstConsumer)
    expect(nextClipConsumer.activeTool).toBe(PIANO_ROLL_TOOL.CURSOR)
    expect(nextClipConsumer.snapEnabled).toBe(false)
    expect(nextClipConsumer.gridPreset).toBe(
      PIANO_ROLL_GRID_PRESET.SIXTEENTH,
    )
  })

  it('restores defaults only through an explicit reset', () => {
    const preferences = usePianoRollPreferencesStore()

    preferences.activateTool(PIANO_ROLL_TOOL.CURSOR)
    preferences.setSnapEnabled(false)
    preferences.reset()

    expect(preferences.activeTool).toBe(PIANO_ROLL_TOOL.PENCIL)
    expect(preferences.snapEnabled).toBe(true)
    expect(preferences.gridPreset).toBe(
      PIANO_ROLL_GRID_PRESET.SIXTEENTH,
    )
  })

  it('starts from defaults in a new Studio application Pinia instance', () => {
    const previousApplication = usePianoRollPreferencesStore(createPinia())
    previousApplication.activateTool(PIANO_ROLL_TOOL.CURSOR)
    previousApplication.setSnapEnabled(false)

    const nextApplication = usePianoRollPreferencesStore(createPinia())
    expect(nextApplication.activeTool).toBe(PIANO_ROLL_TOOL.PENCIL)
    expect(nextApplication.snapEnabled).toBe(true)
    expect(nextApplication.gridPreset).toBe(
      PIANO_ROLL_GRID_PRESET.SIXTEENTH,
    )
  })
})
