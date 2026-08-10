import {
  addTicks,
  createMidiNoteByIdQuery,
  parsePositiveTick,
  parseTick,
  type MidiNoteRecord,
  type MidiPitch,
  type ModelRevision,
  type NoteId,
  type ProjectSession,
  type Tick,
} from '@seele-daw/project-core'

import type { PianoRollClipContext } from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollCssPoint,
  type PianoRollHitZone,
  type PianoRollPointerInput,
} from '#internal/common/piano-roll/piano-roll-input'
import type { PianoRollViewport } from '#internal/common/piano-roll/piano-roll-viewport'
import type { TimelineGrid } from '#internal/common/timeline-grid'

export type PianoRollNoteResizeEdge =
  | typeof PIANO_ROLL_HIT_ZONE.RESIZE_START
  | typeof PIANO_ROLL_HIT_ZONE.RESIZE_END

export interface PianoRollNoteResizeGesture {
  readonly baseRevision: ModelRevision
  readonly context: PianoRollClipContext
  readonly edge: PianoRollNoteResizeEdge
  readonly note: MidiNoteRecord
  readonly originPosition: PianoRollCssPoint
  readonly pointerId: number
  readonly selectOnlyOnCommit: boolean
}

export interface PianoRollNoteResizePreviewNote {
  readonly noteId: NoteId
  readonly pitch: MidiPitch
  readonly visibleEndTick: Tick
  readonly visibleStartTick: Tick
}

export interface PianoRollNoteResizePreview {
  readonly durationTick: Tick
  readonly edge: PianoRollNoteResizeEdge
  readonly note: PianoRollNoteResizePreviewNote | null
  readonly resizedNoteId: NoteId
  readonly snapGuideTick: Tick | null
  readonly sourceStartTick: Tick
}

export interface CreatePianoRollNoteResizeGestureInput {
  readonly context: PianoRollClipContext
  readonly pointerInput: PianoRollPointerInput
  readonly selectedNoteIds: readonly NoteId[]
  readonly session: Pick<ProjectSession, 'query'>
}

export interface ResolvePianoRollNoteResizePreviewInput {
  readonly gesture: PianoRollNoteResizeGesture
  readonly grid: TimelineGrid
  readonly pointerInput: PianoRollPointerInput
  readonly snapEnabled: boolean
  readonly viewport: PianoRollViewport
}

function isResizeEdge(zone: PianoRollHitZone): zone is PianoRollNoteResizeEdge {
  return (
    zone === PIANO_ROLL_HIT_ZONE.RESIZE_START ||
    zone === PIANO_ROLL_HIT_ZONE.RESIZE_END
  )
}

function noteIntersectsClip(
  context: PianoRollClipContext,
  note: MidiNoteRecord,
): boolean {
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  return note.startTick < context.sourceEndTick && context.sourceStartTick < noteEndTick
}

/** Captures the one authoritative Note and edge fixed at Pointer Down. */
export function createPianoRollNoteResizeGesture(
  input: CreatePianoRollNoteResizeGestureInput,
): PianoRollNoteResizeGesture | null {
  const pointerInput = input.pointerInput
  if (
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN ||
    pointerInput.hit === null ||
    !isResizeEdge(pointerInput.hit.zone)
  ) {
    return null
  }

  const result = input.session.query(
    createMidiNoteByIdQuery({
      sourceId: input.context.sourceId,
      noteId: pointerInput.hit.noteId,
    }),
  )
  const note = result.note
  if (note === undefined || !noteIntersectsClip(input.context, note)) return null

  return Object.freeze({
    baseRevision: result.modelRevision,
    context: input.context,
    edge: pointerInput.hit.zone,
    note,
    originPosition: pointerInput.originPosition,
    pointerId: pointerInput.pointerId,
    selectOnlyOnCommit: !input.selectedNoteIds.includes(note.id),
  })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function resolveRawTargetEdgeTick(
  input: ResolvePianoRollNoteResizePreviewInput,
): number {
  const pointerDeltaCssPixel =
    input.pointerInput.position.xCssPixel - input.gesture.originPosition.xCssPixel
  const rawDelta =
    (pointerDeltaCssPixel / input.viewport.widthCssPixel) *
    input.viewport.visibleSpanTick
  if (!Number.isFinite(rawDelta)) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      'Piano Roll Note resize resolved a non-finite horizontal delta',
    )
  }

  const note = input.gesture.note
  const originalEdgeTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? note.startTick
      : addTicks(note.startTick, note.durationTick)
  return originalEdgeTick + rawDelta
}

function resolveTargetEdgeTick(
  input: ResolvePianoRollNoteResizePreviewInput,
): Tick {
  const rawTargetSourceTick = resolveRawTargetEdgeTick(input)
  let candidateTargetTick: number

  if (!input.snapEnabled || input.pointerInput.modifiers.alt) {
    candidateTargetTick = Math.round(rawTargetSourceTick)
  } else {
    const rawTargetClipTick =
      rawTargetSourceTick - input.gesture.context.sourceStartTick
    const targetSubdivision = Math.round(
      (rawTargetClipTick - input.grid.originTick) /
        input.grid.subdivisionSpanTick,
    )
    candidateTargetTick =
      input.gesture.context.sourceStartTick +
      input.grid.originTick +
      targetSubdivision * input.grid.subdivisionSpanTick
  }

  const note = input.gesture.note
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  const minimumTargetTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? 0
      : note.startTick + 1
  const maximumTargetTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? noteEndTick - 1
      : input.gesture.context.sourceLengthTick

  return parseTick(
    clamp(candidateTargetTick, minimumTargetTick, maximumTargetTick),
  )
}

function createPreviewNote(
  context: PianoRollClipContext,
  note: MidiNoteRecord,
  sourceStartTick: Tick,
  durationTick: Tick,
): PianoRollNoteResizePreviewNote | null {
  const sourceEndTick = addTicks(sourceStartTick, durationTick)
  const visibleSourceStartTick = Math.max(context.sourceStartTick, sourceStartTick)
  const visibleSourceEndTick = Math.min(context.sourceEndTick, sourceEndTick)
  if (visibleSourceStartTick >= visibleSourceEndTick) return null

  return Object.freeze({
    noteId: note.id,
    pitch: note.pitch,
    visibleEndTick: parseTick(visibleSourceEndTick - context.sourceStartTick),
    visibleStartTick: parseTick(
      visibleSourceStartTick - context.sourceStartTick,
    ),
  })
}

/** Resolves one drag frame without changing Project facts. */
export function resolvePianoRollNoteResizePreview(
  input: ResolvePianoRollNoteResizePreviewInput,
): PianoRollNoteResizePreview | null {
  const pointerInput = input.pointerInput
  if (
    (pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE &&
      pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END) ||
    !pointerInput.hasExceededDragThreshold ||
    pointerInput.pointerId !== input.gesture.pointerId
  ) {
    return null
  }

  if (input.viewport.clipId !== input.gesture.context.clipId) {
    throw new PianoRollError(
      'viewport-clip-mismatch',
      `Piano Roll Note resize does not belong to Clip ${input.gesture.context.clipId}`,
    )
  }

  const targetEdgeTick = resolveTargetEdgeTick(input)
  const note = input.gesture.note
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  const sourceStartTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? targetEdgeTick
      : note.startTick
  const sourceEndTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? noteEndTick
      : targetEdgeTick
  const durationTick = parsePositiveTick(sourceEndTick - sourceStartTick)
  const draggedEdgeTick =
    input.gesture.edge === PIANO_ROLL_HIT_ZONE.RESIZE_START
      ? sourceStartTick
      : sourceEndTick
  const snapGuideTick =
    input.snapEnabled &&
    !pointerInput.modifiers.alt &&
    draggedEdgeTick >= input.gesture.context.sourceStartTick &&
    draggedEdgeTick <= input.gesture.context.sourceEndTick
      ? parseTick(draggedEdgeTick - input.gesture.context.sourceStartTick)
      : null

  return Object.freeze({
    durationTick,
    edge: input.gesture.edge,
    note: createPreviewNote(
      input.gesture.context,
      note,
      sourceStartTick,
      durationTick,
    ),
    resizedNoteId: note.id,
    snapGuideTick,
    sourceStartTick,
  })
}
