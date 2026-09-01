import { PROJECT_PPQ, parseMidiChannel } from '@seele-daw/project-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  PIANO_ROLL_DEFAULT_GRID_PRESET,
  PIANO_ROLL_DEFAULT_EDITING_SCOPE,
  PIANO_ROLL_DEFAULT_SNAP_ENABLED,
  PIANO_ROLL_DEFAULT_SUSTAIN_PEDAL_CHANNEL,
  PIANO_ROLL_DEFAULT_TOOL,
  PIANO_ROLL_GRID_PRESET,
  PIANO_ROLL_EDITING_SCOPE,
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
    expect(preferences.editingScope).toBe(PIANO_ROLL_DEFAULT_EDITING_SCOPE)
    expect(preferences.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.TRACK)
    expect(preferences.snapEnabled).toBe(PIANO_ROLL_DEFAULT_SNAP_ENABLED)
    expect(preferences.snapEnabled).toBe(true)
    expect(preferences.gridPreset).toBe(PIANO_ROLL_DEFAULT_GRID_PRESET)
    expect(preferences.gridPreset).toBe(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    expect(preferences.subdivisionSpanTick).toBe(PROJECT_PPQ / 4)
    expect(preferences.sustainPedalChannel).toBe(PIANO_ROLL_DEFAULT_SUSTAIN_PEDAL_CHANNEL)
    expect(preferences.sustainPedalChannel).toBe(0)
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
    firstConsumer.selectEditingScope(PIANO_ROLL_EDITING_SCOPE.CLIP)
    firstConsumer.setSnapEnabled(false)
    firstConsumer.selectGridPreset(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    firstConsumer.selectSustainPedalChannel(parseMidiChannel(9))

    const nextClipConsumer = usePianoRollPreferencesStore(pinia)
    expect(nextClipConsumer).toBe(firstConsumer)
    expect(nextClipConsumer.activeTool).toBe(PIANO_ROLL_TOOL.CURSOR)
    expect(nextClipConsumer.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.CLIP)
    expect(nextClipConsumer.snapEnabled).toBe(false)
    expect(nextClipConsumer.gridPreset).toBe(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    expect(nextClipConsumer.sustainPedalChannel).toBe(9)
  })

  it('restores defaults only through an explicit reset', () => {
    const preferences = usePianoRollPreferencesStore()

    preferences.activateTool(PIANO_ROLL_TOOL.CURSOR)
    preferences.selectEditingScope(PIANO_ROLL_EDITING_SCOPE.CLIP)
    preferences.setSnapEnabled(false)
    preferences.selectSustainPedalChannel(parseMidiChannel(15))
    preferences.reset()

    expect(preferences.activeTool).toBe(PIANO_ROLL_TOOL.PENCIL)
    expect(preferences.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.TRACK)
    expect(preferences.snapEnabled).toBe(true)
    expect(preferences.gridPreset).toBe(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    expect(preferences.sustainPedalChannel).toBe(0)
  })

  it('starts from defaults in a new Studio application Pinia instance', () => {
    const previousApplication = usePianoRollPreferencesStore(createPinia())
    previousApplication.activateTool(PIANO_ROLL_TOOL.CURSOR)
    previousApplication.selectEditingScope(PIANO_ROLL_EDITING_SCOPE.CLIP)
    previousApplication.setSnapEnabled(false)
    previousApplication.selectSustainPedalChannel(parseMidiChannel(3))

    const nextApplication = usePianoRollPreferencesStore(createPinia())
    expect(nextApplication.activeTool).toBe(PIANO_ROLL_TOOL.PENCIL)
    expect(nextApplication.editingScope).toBe(PIANO_ROLL_EDITING_SCOPE.TRACK)
    expect(nextApplication.snapEnabled).toBe(true)
    expect(nextApplication.gridPreset).toBe(PIANO_ROLL_GRID_PRESET.SIXTEENTH)
    expect(nextApplication.sustainPedalChannel).toBe(0)
  })
})
