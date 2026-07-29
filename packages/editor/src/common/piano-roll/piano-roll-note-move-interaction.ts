import {
  MIDI_PITCH_MAX,
  MIDI_PITCH_MIN,
  addTicks,
  createMidiNoteByIdQuery,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseTick,
  parseTickDelta,
  type MidiNoteRecord,
  type MidiPitch,
  type MidiPitchDelta,
  type ModelRevision,
  type NoteId,
  type ProjectSession,
  type Tick,
  type TickDelta,
} from '@seele-daw/project-core'

import type { TimelineGrid } from '../timeline-grid'
import type { PianoRollClipContext } from './piano-roll-clip-context'
import { PianoRollError } from './piano-roll-error'
import {
  PIANO_ROLL_HIT_ZONE,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  type PianoRollCssPoint,
  type PianoRollPointerInput,
} from './piano-roll-input'
import type { PianoRollViewport } from './piano-roll-viewport'

export interface PianoRollNoteMoveGesture {
  readonly anchorNoteId: NoteId
  readonly baseRevision: ModelRevision
  readonly context: PianoRollClipContext
  readonly noteIds: readonly NoteId[]
  readonly notes: readonly MidiNoteRecord[]
  readonly originPosition: PianoRollCssPoint
  readonly pointerId: number
  readonly selectOnlyOnCommit: boolean
  readonly snapBypassed: boolean
}

export interface PianoRollNoteMovePreviewNote {
  readonly noteId: NoteId
  readonly pitch: MidiPitch
  readonly visibleEndTick: Tick
  readonly visibleStartTick: Tick
}

export interface PianoRollNoteMovePreview {
  readonly deltaPitch: MidiPitchDelta
  readonly deltaTick: TickDelta
  readonly movedNoteIds: readonly NoteId[]
  readonly notes: readonly PianoRollNoteMovePreviewNote[]
  readonly snapGuideTick: Tick | null
}

export interface CreatePianoRollNoteMoveGestureInput {
  readonly context: PianoRollClipContext
  readonly pointerInput: PianoRollPointerInput
  readonly selectedNoteIds: readonly NoteId[]
  readonly session: Pick<ProjectSession, 'query'>
}

export interface ResolvePianoRollNoteMovePreviewInput {
  readonly gesture: PianoRollNoteMoveGesture
  readonly grid: TimelineGrid
  readonly pointerInput: PianoRollPointerInput
  readonly snapEnabled: boolean
  readonly viewport: PianoRollViewport
}

function noteIntersectsClip(
  context: PianoRollClipContext,
  note: MidiNoteRecord,
): boolean {
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  return note.startTick < context.sourceEndTick && context.sourceStartTick < noteEndTick
}

/**
 * Captures authoritative Note facts at Pointer Down so every later preview is
 * deterministic even when Vue state or the Project changes during the gesture.
 */
export function createPianoRollNoteMoveGesture(
  input: CreatePianoRollNoteMoveGestureInput,
): PianoRollNoteMoveGesture | null {
  const pointerInput = input.pointerInput
  if (
    pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN ||
    pointerInput.hit === null ||
    pointerInput.hit.zone !== PIANO_ROLL_HIT_ZONE.BODY
  ) {
    return null
  }

  const hitIsSelected = input.selectedNoteIds.includes(pointerInput.hit.noteId)
  const noteIds = hitIsSelected
    ? input.selectedNoteIds
    : [pointerInput.hit.noteId]
  const notes: MidiNoteRecord[] = []
  let baseRevision: ModelRevision | null = null

  for (const noteId of noteIds) {
    const result = input.session.query(
      createMidiNoteByIdQuery({
        sourceId: input.context.sourceId,
        noteId,
      }),
    )
    if (baseRevision !== null && result.modelRevision !== baseRevision) {
      throw new PianoRollError(
        'invalid-move-gesture',
        'Piano Roll Note move could not capture one stable Project revision',
      )
    }
    baseRevision = result.modelRevision
    const note = result.note
    if (note === undefined || !noteIntersectsClip(input.context, note)) return null
    notes.push(note)
  }

  if (baseRevision === null) return null

  return Object.freeze({
    anchorNoteId: pointerInput.hit.noteId,
    baseRevision,
    context: input.context,
    noteIds: Object.freeze([...noteIds]),
    notes: Object.freeze(notes),
    originPosition: pointerInput.originPosition,
    pointerId: pointerInput.pointerId,
    selectOnlyOnCommit: !hitIsSelected,
    snapBypassed: pointerInput.modifiers.alt,
  })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function resolveTickDelta(
  input: ResolvePianoRollNoteMovePreviewInput,
  anchor: MidiNoteRecord,
): TickDelta {
  const pointerDeltaCssPixel =
    input.pointerInput.position.xCssPixel - input.gesture.originPosition.xCssPixel
  const rawDelta =
    (pointerDeltaCssPixel / input.viewport.widthCssPixel) *
    input.viewport.visibleSpanTick

  if (!Number.isFinite(rawDelta)) {
    throw new PianoRollError(
      'coordinate-outside-viewport',
      'Piano Roll Note move resolved a non-finite horizontal delta',
    )
  }

  let candidateDelta: number
  if (!input.snapEnabled || input.gesture.snapBypassed) {
    candidateDelta = Math.round(rawDelta)
  } else {
    const anchorClipStartTick =
      anchor.startTick - input.gesture.context.sourceStartTick
    const rawTargetClipTick = anchorClipStartTick + rawDelta
    const targetSubdivision = Math.round(
      (rawTargetClipTick - input.grid.originTick) /
        input.grid.subdivisionSpanTick,
    )

    // Snap the absolute target coordinate so off-grid Notes join the active
    // Grid instead of preserving an offset from an earlier Grid resolution.
    candidateDelta =
      input.grid.originTick +
      targetSubdivision * input.grid.subdivisionSpanTick -
      anchorClipStartTick
  }

  const minimumDelta = Math.max(...input.gesture.notes.map((note) => -note.startTick))
  const maximumDelta = Math.min(
    ...input.gesture.notes.map(
      (note) =>
        input.gesture.context.sourceLengthTick -
        (note.startTick + note.durationTick),
    ),
  )
  return parseTickDelta(clamp(candidateDelta, minimumDelta, maximumDelta))
}

function resolvePitchDelta(
  input: ResolvePianoRollNoteMovePreviewInput,
): MidiPitchDelta {
  const pitchRowHeight =
    input.viewport.heightCssPixel /
    (input.viewport.maximumPitch - input.viewport.minimumPitch + 1)
  const rawDelta =
    (input.gesture.originPosition.yCssPixel -
      input.pointerInput.position.yCssPixel) /
    pitchRowHeight
  const candidateDelta = Math.round(rawDelta)
  const minimumDelta = Math.max(
    ...input.gesture.notes.map((note) => MIDI_PITCH_MIN - note.pitch),
  )
  const maximumDelta = Math.min(
    ...input.gesture.notes.map((note) => MIDI_PITCH_MAX - note.pitch),
  )
  return parseMidiPitchDelta(clamp(candidateDelta, minimumDelta, maximumDelta))
}

function createPreviewNotes(
  context: PianoRollClipContext,
  gesture: PianoRollNoteMoveGesture,
  deltaTick: TickDelta,
  deltaPitch: MidiPitchDelta,
): readonly PianoRollNoteMovePreviewNote[] {
  const notes: PianoRollNoteMovePreviewNote[] = []

  for (const note of gesture.notes) {
    const sourceStartTick = note.startTick + deltaTick
    const sourceEndTick = sourceStartTick + note.durationTick
    const visibleSourceStartTick = Math.max(context.sourceStartTick, sourceStartTick)
    const visibleSourceEndTick = Math.min(context.sourceEndTick, sourceEndTick)
    if (visibleSourceStartTick >= visibleSourceEndTick) continue

    notes.push(
      Object.freeze({
        noteId: note.id,
        pitch: parseMidiPitch(note.pitch + deltaPitch),
        visibleEndTick: parseTick(visibleSourceEndTick - context.sourceStartTick),
        visibleStartTick: parseTick(
          visibleSourceStartTick - context.sourceStartTick,
        ),
      }),
    )
  }

  return Object.freeze(notes)
}

/**
 * Resolves one drag frame into a frozen, renderer-neutral Selection preview.
 *
 * Every Note receives the same clamped delta. No Project write occurs here.
 */
export function resolvePianoRollNoteMovePreview(
  input: ResolvePianoRollNoteMovePreviewInput,
): PianoRollNoteMovePreview | null {
  const pointerInput = input.pointerInput
  if (
    (pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.UPDATE &&
      pointerInput.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END) ||
    !pointerInput.hasExceededDragThreshold ||
    pointerInput.pointerId !== input.gesture.pointerId
  ) {
    return null
  }

  if (
    input.viewport.clipId !== input.gesture.context.clipId ||
    input.gesture.notes.length === 0
  ) {
    throw new PianoRollError(
      'viewport-clip-mismatch',
      `Piano Roll Note move does not belong to Clip ${input.gesture.context.clipId}`,
    )
  }

  const anchor = input.gesture.notes.find(
    (note) => note.id === input.gesture.anchorNoteId,
  )
  if (anchor === undefined) {
    throw new PianoRollError(
      'invalid-move-gesture',
      'Piano Roll Note move is missing its anchor Note',
    )
  }

  const deltaTick = resolveTickDelta(input, anchor)
  const deltaPitch = resolvePitchDelta(input)
  const anchorTargetSourceTick = anchor.startTick + deltaTick
  const snapGuideTick =
    input.snapEnabled &&
    !input.gesture.snapBypassed &&
    anchorTargetSourceTick >= input.gesture.context.sourceStartTick &&
    anchorTargetSourceTick <= input.gesture.context.sourceEndTick
      ? parseTick(anchorTargetSourceTick - input.gesture.context.sourceStartTick)
      : null

  return Object.freeze({
    deltaPitch,
    deltaTick,
    movedNoteIds: input.gesture.noteIds,
    notes: createPreviewNotes(
      input.gesture.context,
      input.gesture,
      deltaTick,
      deltaPitch,
    ),
    snapGuideTick,
  })
}
