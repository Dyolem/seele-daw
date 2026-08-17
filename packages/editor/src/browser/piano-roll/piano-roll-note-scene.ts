import type {
  PianoRollNoteMovePreview,
  PianoRollNoteReadModelState,
  PianoRollNoteResizePreview,
} from '#internal/common/piano-roll/index'
import {
  pianoRollClipTickToCssPixel,
  pianoRollMidiPitchToCssPixel,
  type PianoRollTimelineViewport,
} from '#internal/common/piano-roll/index'
import { PianoRollBrowserError } from '#internal/browser/piano-roll/piano-roll-browser-error'
import type {
  PianoRollNoteScene,
  PianoRollNoteVisual,
} from '#internal/browser/piano-roll/piano-roll-note-renderer'
import {
  parseTick,
  type MidiPitch,
  type NoteId,
  type Tick,
} from '@seele-daw/project-core'

export interface PianoRollNoteSceneStyle {
  readonly borderColor: string
  readonly fillColor: string
  readonly opacity: number
  readonly selectedBorderColor: string
  readonly selectedGlowColor: string
}

export interface CreatePianoRollNoteSceneInput {
  readonly movePreview?: PianoRollNoteMovePreview | null
  readonly notes: PianoRollNoteReadModelState['notes']
  readonly resizePreview?: PianoRollNoteResizePreview | null
  readonly selectedNoteIds: readonly NoteId[]
  readonly style: PianoRollNoteSceneStyle
  readonly viewport: PianoRollTimelineViewport
}

interface SceneNote {
  readonly noteId: NoteId
  readonly pitch: MidiPitch
  readonly visibleEndTick: Tick
  readonly visibleStartTick: Tick
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

function pitchRowHeight(viewport: PianoRollTimelineViewport): number {
  return (
    viewport.heightCssPixel /
    (viewport.maximumPitch - viewport.minimumPitch + 1)
  )
}

function createSceneNotes(input: CreatePianoRollNoteSceneInput): readonly SceneNote[] {
  const previewNoteIds = new Set(input.movePreview?.movedNoteIds ?? [])
  if (input.resizePreview !== null && input.resizePreview !== undefined) {
    previewNoteIds.add(input.resizePreview.resizedNoteId)
  }
  const notes: SceneNote[] = input.notes
    .filter((visibleNote) => !previewNoteIds.has(visibleNote.note.id))
    .map((visibleNote) => ({
      noteId: visibleNote.note.id,
      pitch: visibleNote.note.pitch,
      visibleEndTick: visibleNote.visibleEndTick,
      visibleStartTick: visibleNote.visibleStartTick,
    }))

  for (const previewNote of input.movePreview?.notes ?? []) {
    if (
      previewNote.pitch < input.viewport.minimumPitch ||
      previewNote.pitch > input.viewport.maximumPitch ||
      previewNote.visibleEndTick <= input.viewport.visibleStartTick ||
      previewNote.visibleStartTick >= input.viewport.visibleEndTick
    ) {
      continue
    }

    notes.push({
      noteId: previewNote.noteId,
      pitch: previewNote.pitch,
      visibleEndTick: parseTick(
        Math.min(previewNote.visibleEndTick, input.viewport.visibleEndTick),
      ),
      visibleStartTick: parseTick(
        Math.max(previewNote.visibleStartTick, input.viewport.visibleStartTick),
      ),
    })
  }

  const resizedNote = input.resizePreview?.note
  if (
    resizedNote !== null &&
    resizedNote !== undefined &&
    resizedNote.pitch >= input.viewport.minimumPitch &&
    resizedNote.pitch <= input.viewport.maximumPitch &&
    resizedNote.visibleEndTick > input.viewport.visibleStartTick &&
    resizedNote.visibleStartTick < input.viewport.visibleEndTick
  ) {
    notes.push({
      noteId: resizedNote.noteId,
      pitch: resizedNote.pitch,
      visibleEndTick: parseTick(
        Math.min(resizedNote.visibleEndTick, input.viewport.visibleEndTick),
      ),
      visibleStartTick: parseTick(
        Math.max(resizedNote.visibleStartTick, input.viewport.visibleStartTick),
      ),
    })
  }

  return notes
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
  const selectedNoteIds = new Set([
    ...input.selectedNoteIds,
    ...(input.movePreview?.movedNoteIds ?? []),
  ])
  if (input.resizePreview !== null && input.resizePreview !== undefined) {
    selectedNoteIds.add(input.resizePreview.resizedNoteId)
  }
  const rowHeight = pitchRowHeight(input.viewport)
  const inset = Math.min(1, rowHeight / 5)
  const notes = createSceneNotes(input).map((note): PianoRollNoteVisual => {
    const selected = selectedNoteIds.has(note.noteId)
    const xCssPixel = pianoRollClipTickToCssPixel(
      input.viewport,
      note.visibleStartTick,
    )
    const endXCssPixel = pianoRollClipTickToCssPixel(
      input.viewport,
      note.visibleEndTick,
    )

    return Object.freeze({
      borderColor: selected ? selectedBorderColor : borderColor,
      fillColor,
      glowColor: selected ? selectedGlowColor : null,
      heightCssPixel: Math.max(1, rowHeight - inset * 2),
      noteId: note.noteId,
      opacity,
      pitch: note.pitch,
      selected,
      visibleEndTick: note.visibleEndTick,
      visibleStartTick: note.visibleStartTick,
      widthCssPixel: Math.max(1, endXCssPixel - xCssPixel),
      xCssPixel,
      yCssPixel:
        pianoRollMidiPitchToCssPixel(input.viewport, note.pitch) + inset,
    })
  })

  return Object.freeze({
    heightCssPixel: input.viewport.heightCssPixel,
    notes: Object.freeze(notes),
    widthCssPixel: input.viewport.widthCssPixel,
  })
}
