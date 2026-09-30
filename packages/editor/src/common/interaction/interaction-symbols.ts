import type { InteractionId } from './interaction-session'

/** Registers Editor identities without retaining tokens or sharing them between gestures. */
export function createInteractionId(): InteractionId {
  return Symbol('seele/editor/interaction')
}

export function createPointerCaptureId(): symbol {
  return Symbol('seele/editor/pointer-capture')
}
