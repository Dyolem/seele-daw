import type { PianoRollNoteReadModelState } from '#internal/common/piano-roll/index'
import {
  pianoRollClipTickToCssPixel,
  pianoRollMidiPitchToCssPixel,
  type PianoRollViewport,
} from '#internal/common/piano-roll/index'
import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import type {
  PianoRollNoteScene,
  PianoRollNoteVisual,
} from '#internal/browser/piano-roll/piano-roll-note-renderer'
import type { NoteId } from '@seele-daw/project-core'

export interface PianoRollNoteSceneStyle {
  readonly borderColor: string
  readonly fillColor: string
  readonly opacity: number
  readonly selectedBorderColor: string
  readonly selectedGlowColor: string
}

export interface CreatePianoRollNoteSceneInput {
  readonly notes: PianoRollNoteReadModelState['notes']
  readonly selectedNoteIds: readonly NoteId[]
  readonly style: PianoRollNoteSceneStyle
  readonly viewport: PianoRollViewport
}

function requireColor(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new PianoRollBrowserError(
      'invalid-theme',
      `Piano Roll Note ${field} must be a non-empty CSS color`,
    )
  }
  return value
}

function requireOpacity(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new PianoRollBrowserError(
      'invalid-theme',
      'Piano Roll Note opacity must be a finite value from 0 through 1',
    )
  }
  return value
}

function pitchRowHeight(viewport: PianoRollViewport): number {
  return (
    viewport.heightCssPixel /
    (viewport.maximumPitch - viewport.minimumPitch + 1)
  )
}

/** Projects read-model Notes into renderer-neutral CSS Pixel geometry. */
export function createPianoRollNoteScene(
  input: CreatePianoRollNoteSceneInput,
): PianoRollNoteScene {
  const borderColor = requireColor(input.style.borderColor, 'borderColor')
  const fillColor = requireColor(input.style.fillColor, 'fillColor')
  const selectedBorderColor = requireColor(
    input.style.selectedBorderColor,
    'selectedBorderColor',
  )
  const selectedGlowColor = requireColor(
    input.style.selectedGlowColor,
    'selectedGlowColor',
  )
  const opacity = requireOpacity(input.style.opacity)
  const selectedNoteIds = new Set(input.selectedNoteIds)
  const rowHeight = pitchRowHeight(input.viewport)
  const inset = Math.min(1, rowHeight / 5)
  const notes = input.notes.map((visibleNote): PianoRollNoteVisual => {
    const selected = selectedNoteIds.has(visibleNote.note.id)
    const xCssPixel = pianoRollClipTickToCssPixel(
      input.viewport,
      visibleNote.visibleStartTick,
    )
    const endXCssPixel = pianoRollClipTickToCssPixel(
      input.viewport,
      visibleNote.visibleEndTick,
    )

    return Object.freeze({
      borderColor: selected ? selectedBorderColor : borderColor,
      fillColor,
      glowColor: selected ? selectedGlowColor : null,
      heightCssPixel: Math.max(1, rowHeight - inset * 2),
      noteId: visibleNote.note.id,
      opacity,
      pitch: visibleNote.note.pitch,
      selected,
      visibleEndTick: visibleNote.visibleEndTick,
      visibleStartTick: visibleNote.visibleStartTick,
      widthCssPixel: Math.max(1, endXCssPixel - xCssPixel),
      xCssPixel,
      yCssPixel:
        pianoRollMidiPitchToCssPixel(input.viewport, visibleNote.note.pitch) +
        inset,
    })
  })

  return Object.freeze({
    heightCssPixel: input.viewport.heightCssPixel,
    notes: Object.freeze(notes),
    widthCssPixel: input.viewport.widthCssPixel,
  })
}
