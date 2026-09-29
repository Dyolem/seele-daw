import { parseNoteId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'
import { applyPianoRollSelectInteraction, type PianoRollSelectionTarget } from '#internal/index'

const NOTE_ID = parseNoteId('selection-note')
function createSelectionTarget() {
  return {
    clearSelection: vi.fn<PianoRollSelectionTarget['clearSelection']>(() => true),
    selectOnly: vi.fn<PianoRollSelectionTarget['selectOnly']>(() => true),
    toggleSelection: vi.fn<PianoRollSelectionTarget['toggleSelection']>(() => true),
  }
}

describe('Piano Roll Select Interaction', () => {
  it('selects only the completed click target', () => {
    const target = createSelectionTarget()
    expect(
      applyPianoRollSelectInteraction(target, { noteId: NOTE_ID, toggleSelection: false }),
    ).toBe(true)
    expect(target.selectOnly).toHaveBeenCalledWith(NOTE_ID)
    expect(target.toggleSelection).not.toHaveBeenCalled()
    expect(target.clearSelection).not.toHaveBeenCalled()
  })

  it('applies a semantic selection toggle without reading physical keys', () => {
    const target = createSelectionTarget()
    applyPianoRollSelectInteraction(target, { noteId: NOTE_ID, toggleSelection: true })
    expect(target.toggleSelection).toHaveBeenCalledWith(NOTE_ID)
    expect(target.selectOnly).not.toHaveBeenCalled()
  })

  it('clears selection for a blank target even when toggleSelection was requested', () => {
    const target = createSelectionTarget()
    applyPianoRollSelectInteraction(target, { noteId: null, toggleSelection: true })
    expect(target.clearSelection).toHaveBeenCalledOnce()
    expect(target.selectOnly).not.toHaveBeenCalled()
    expect(target.toggleSelection).not.toHaveBeenCalled()
  })
})
