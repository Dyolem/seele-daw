import type { NoteId } from '@seele-daw/project-core'

export const PIANO_ROLL_HIT_ZONE = {
  BODY: 'body',
  RESIZE_END: 'resize-end',
  RESIZE_START: 'resize-start',
} as const

export type PianoRollHitZone = (typeof PIANO_ROLL_HIT_ZONE)[keyof typeof PIANO_ROLL_HIT_ZONE]

export interface PianoRollHit {
  readonly noteId: NoteId
  readonly zone: PianoRollHitZone
}

export const PIANO_ROLL_POINTER_INPUT_PHASE = {
  BEGIN: 'begin',
  CANCEL: 'cancel',
  END: 'end',
  UPDATE: 'update',
} as const

export type PianoRollPointerInputPhase =
  (typeof PIANO_ROLL_POINTER_INPUT_PHASE)[keyof typeof PIANO_ROLL_POINTER_INPUT_PHASE]

export type PianoRollPointerType = 'mouse' | 'pen' | 'touch' | 'unknown'

export interface PianoRollCssPoint {
  readonly xCssPixel: number
  readonly yCssPixel: number
}

export interface PianoRollInputModifiers {
  readonly alt: boolean
  readonly control: boolean
  readonly meta: boolean
  readonly shift: boolean
}

/**
 * Framework-neutral facts for one captured primary-pointer gesture.
 *
 * Hit, origin modifiers, and origin position are fixed at Pointer Down.
 * Current modifiers and position may change while the Pointer is captured.
 */
export interface PianoRollPointerInput<Hit extends object = PianoRollHit> {
  readonly hasExceededDragThreshold: boolean
  readonly hit: Readonly<Hit> | null
  readonly modifiers: PianoRollInputModifiers
  readonly originModifiers: PianoRollInputModifiers
  readonly originPosition: PianoRollCssPoint
  readonly phase: PianoRollPointerInputPhase
  readonly pointerId: number
  readonly pointerType: PianoRollPointerType
  readonly position: PianoRollCssPoint
}
