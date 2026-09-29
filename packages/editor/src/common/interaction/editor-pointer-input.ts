export const EDITOR_POINTER_INPUT_PHASE = {
  BEGIN: 'begin',
  CANCEL: 'cancel',
  END: 'end',
  UPDATE: 'update',
} as const

export type EditorPointerInputPhase =
  (typeof EDITOR_POINTER_INPUT_PHASE)[keyof typeof EDITOR_POINTER_INPUT_PHASE]

export type EditorPointerType = 'mouse' | 'pen' | 'touch' | 'unknown'

export interface EditorCssPoint {
  readonly xCssPixel: number
  readonly yCssPixel: number
}

export interface EditorInputModifiers {
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
export interface EditorPointerInput<Hit extends object> {
  readonly hasExceededDragThreshold: boolean
  readonly hit: Readonly<Hit> | null
  readonly modifiers: EditorInputModifiers
  readonly originModifiers: EditorInputModifiers
  readonly originPosition: EditorCssPoint
  readonly phase: EditorPointerInputPhase
  readonly captureId: symbol
  readonly pointerId: number
  readonly pointerType: EditorPointerType
  readonly position: EditorCssPoint
}
