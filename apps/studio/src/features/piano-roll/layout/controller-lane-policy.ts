export const CONTROLLER_LANE_DEFAULT_HEIGHT = 88
export const CONTROLLER_LANE_MINIMUM_HEIGHT = 64
export const CONTROLLER_LANE_MAXIMUM_HEIGHT = 240
export const CONTROLLER_LANE_HEADER_HEIGHT = 32
export const CONTROLLER_LANE_SPLITTER_HEIGHT = 12
export const CONTROLLER_LANE_VALUE_INSET = 12
const MINIMUM_NOTE_HEIGHT = 96
export const PIANO_ROLL_TOOLBAR_HEIGHT = 36
export const PIANO_ROLL_RULER_HEIGHT = 26
// Reserve space for a non-overlay horizontal scrollbar on Track surfaces.
const SCROLLBAR_ALLOWANCE = 16

export function resolveControllerLaneLayout(
  surfaceHeight: number,
  expanded: boolean,
  preferredHeight: number,
  additionalHeaderHeight = 0,
) {
  const available =
    surfaceHeight -
    PIANO_ROLL_TOOLBAR_HEIGHT -
    PIANO_ROLL_RULER_HEIGHT -
    additionalHeaderHeight -
    MINIMUM_NOTE_HEIGHT -
    CONTROLLER_LANE_HEADER_HEIGHT -
    CONTROLLER_LANE_SPLITTER_HEIGHT -
    SCROLLBAR_ALLOWANCE
  const maximum = Math.min(
    CONTROLLER_LANE_MAXIMUM_HEIGHT,
    Math.max(CONTROLLER_LANE_MINIMUM_HEIGHT, available),
  )
  const visible = expanded && available >= CONTROLLER_LANE_MINIMUM_HEIGHT
  return {
    visible,
    canExpand: available >= CONTROLLER_LANE_MINIMUM_HEIGHT,
    maximum,
    bodyHeight: visible
      ? Math.max(CONTROLLER_LANE_MINIMUM_HEIGHT, Math.min(maximum, preferredHeight))
      : 0,
    headerHeight: CONTROLLER_LANE_HEADER_HEIGHT + (visible ? CONTROLLER_LANE_SPLITTER_HEIGHT : 0),
  }
}
