import {
  PIANO_ROLL_HIT_ZONE,
  type PianoRollHit,
} from '#internal/common/piano-roll/index'
import { parseNoteId } from '@seele-daw/project-core'

export const PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE = 'data-piano-roll-note-id'

function isElement(
  target: EventTarget,
  surface: HTMLElement,
): target is Element {
  const elementConstructor = surface.ownerDocument.defaultView?.Element
  return elementConstructor !== undefined && target instanceof elementConstructor
}

/**
 * Converts the browser's composed event path into a renderer-neutral Note hit.
 *
 * Invalid or out-of-Surface markers fail closed instead of leaking DOM details
 * into the interaction layer.
 */
export function resolvePianoRollDomNoteHit(
  event: Event,
  surface: HTMLElement,
): PianoRollHit | null {
  const eventPath = event.composedPath()
  const surfaceIndex = eventPath.indexOf(surface)
  if (surfaceIndex < 0) return null

  for (const target of eventPath.slice(0, surfaceIndex)) {
    if (!isElement(target, surface)) continue

    const noteIdValue = target.getAttribute(PIANO_ROLL_DOM_NOTE_ID_ATTRIBUTE)
    if (noteIdValue === null) continue

    try {
      return Object.freeze({
        noteId: parseNoteId(noteIdValue),
        zone: PIANO_ROLL_HIT_ZONE.BODY,
      })
    } catch {
      return null
    }
  }

  return null
}
