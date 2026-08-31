import { parseMidiSustainPedalEventId } from '@seele-daw/project-core'

import type { PianoRollSustainPedalLaneHit } from '#internal/common/piano-roll/index'

export const PIANO_ROLL_DOM_SUSTAIN_PEDAL_EVENT_ID_ATTRIBUTE =
  'data-piano-roll-sustain-pedal-event-id'

function isElement(target: EventTarget, surface: HTMLElement): target is Element {
  const elementConstructor = surface.ownerDocument.defaultView?.Element
  return elementConstructor !== undefined && target instanceof elementConstructor
}

/** Resolves one in-Surface CC64 event marker without exposing DOM identity. */
export function resolvePianoRollDomSustainPedalEventHit(
  event: Event,
  surface: HTMLElement,
): PianoRollSustainPedalLaneHit | null {
  const eventPath = event.composedPath()
  const surfaceIndex = eventPath.indexOf(surface)
  if (surfaceIndex < 0) return null

  for (const target of eventPath.slice(0, surfaceIndex)) {
    if (!isElement(target, surface)) continue

    const eventIdValue = target.getAttribute(PIANO_ROLL_DOM_SUSTAIN_PEDAL_EVENT_ID_ATTRIBUTE)
    if (eventIdValue === null) continue

    try {
      return Object.freeze({
        sustainPedalEventId: parseMidiSustainPedalEventId(eventIdValue),
      })
    } catch {
      return null
    }
  }

  return null
}
