import { parseNoteId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  applyPianoRollSelectInteraction,
  type PianoRollPointerInput,
  type PianoRollSelectionTarget,
} from '#internal/index'

const NOTE_ID = parseNoteId('select-interaction-note')
const ZERO_POINT = Object.freeze({
  xCssPixel: 0,
  yCssPixel: 0,
})

function createSelectionTarget(): PianoRollSelectionTarget {
  return {
    clearSelection: vi.fn<PianoRollSelectionTarget['clearSelection']>(() => true),
    selectOnly: vi.fn<PianoRollSelectionTarget['selectOnly']>(() => true),
    toggleSelection: vi.fn<PianoRollSelectionTarget['toggleSelection']>(
      () => true,
    ),
  }
}

function createPointerInput(
  overrides: Partial<PianoRollPointerInput> = {},
): PianoRollPointerInput {
  return Object.freeze({
    hasExceededDragThreshold: false,
    hit: Object.freeze({
      noteId: NOTE_ID,
      zone: PIANO_ROLL_HIT_ZONE.BODY,
    }),
    modifiers: Object.freeze({
      alt: false,
      control: false,
      meta: false,
      shift: false,
    }),
    originPosition: ZERO_POINT,
    phase: PIANO_ROLL_POINTER_INPUT_PHASE.END,
    pointerId: 1,
    pointerType: 'mouse',
    position: ZERO_POINT,
    ...overrides,
  })
}

describe('Piano Roll Select Interaction', () => {
  it('selects only the hit Note after a completed plain click', () => {
    const target = createSelectionTarget()

    expect(
      applyPianoRollSelectInteraction(target, createPointerInput()),
    ).toBe(true)
    expect(target.selectOnly).toHaveBeenCalledWith(NOTE_ID)
    expect(target.toggleSelection).not.toHaveBeenCalled()
    expect(target.clearSelection).not.toHaveBeenCalled()
  })

  it.each(['control', 'meta', 'shift'] as const)(
    'toggles the hit Note when %s modifies the click',
    (modifier) => {
      const target = createSelectionTarget()

      applyPianoRollSelectInteraction(
        target,
        createPointerInput({
          modifiers: Object.freeze({
            alt: false,
            control: false,
            meta: false,
            shift: false,
            [modifier]: true,
          }),
        }),
      )

      expect(target.toggleSelection).toHaveBeenCalledWith(NOTE_ID)
      expect(target.selectOnly).not.toHaveBeenCalled()
    },
  )

  it('clears selection after a completed blank-grid click', () => {
    const target = createSelectionTarget()

    applyPianoRollSelectInteraction(
      target,
      createPointerInput({ hit: null }),
    )

    expect(target.clearSelection).toHaveBeenCalledOnce()
    expect(target.selectOnly).not.toHaveBeenCalled()
    expect(target.toggleSelection).not.toHaveBeenCalled()
  })

  it.each([
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN }),
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE }),
    createPointerInput({ phase: PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL }),
    createPointerInput({ hasExceededDragThreshold: true }),
  ])('ignores incomplete and drag gestures', (input) => {
    const target = createSelectionTarget()

    expect(applyPianoRollSelectInteraction(target, input)).toBe(false)
    expect(target.selectOnly).not.toHaveBeenCalled()
    expect(target.toggleSelection).not.toHaveBeenCalled()
    expect(target.clearSelection).not.toHaveBeenCalled()
  })
})
