import type { PianoRollPointerInput, PianoRollCssPoint } from '@seele-daw/editor'
import {
  TIMELINE_GRID_SNAP_MODE,
  pianoRollCssPixelToMidiPitch,
  pianoRollCssPixelToTimelineTickPosition,
  resolvePianoRollTrackNotePlacement,
  resolveTimelineGridTick,
  type InteractionOperation,
} from '@seele-daw/editor'
import { parseTick } from '@seele-daw/project-core'
import type {
  TrackPlacementConfiguration,
  TrackPlacementPreview,
  TrackPlacementResult,
} from '@/features/piano-roll/components/track-surface/types/track-placement'

/** Hover and Pointer Down use the same placement policy, with different snapshot lifetimes. */
export function resolveTrackPlacement(
  configuration: TrackPlacementConfiguration,
  point: PianoRollCssPoint,
): TrackPlacementPreview | null {
  const { viewport, grid, snapEnabled } = configuration
  const { xCssPixel, yCssPixel } = point
  if (
    xCssPixel < 0 ||
    xCssPixel > viewport.widthCssPixel ||
    yCssPixel < 0 ||
    yCssPixel >= viewport.heightCssPixel
  )
    return null
  let projectStartTick = resolveTimelineGridTick({
    grid,
    snapEnabled,
    snapMode: TIMELINE_GRID_SNAP_MODE.FLOOR,
    tickPosition: pianoRollCssPixelToTimelineTickPosition(viewport, xCssPixel),
  })
  const lastInteriorTick = parseTick(configuration.timelineEndTick - 1)
  if (projectStartTick > lastInteriorTick) {
    projectStartTick = snapEnabled
      ? parseTick(
          Math.floor(lastInteriorTick / grid.subdivisionSpanTick) * grid.subdivisionSpanTick,
        )
      : lastInteriorTick
  }
  return Object.freeze({
    pitch: pianoRollCssPixelToMidiPitch(viewport, yCssPixel),
    placement: resolvePianoRollTrackNotePlacement({
      barSpanTick: configuration.barSpanTick,
      noteDurationTick: configuration.noteDurationTick,
      projectStartTick,
      readModel: configuration.readModel,
    }),
  })
}

/** Track Pencil is a click operation; drag cancellation does not become a placement. */
export class TrackPlacementOperation implements InteractionOperation<
  PianoRollPointerInput,
  TrackPlacementPreview,
  TrackPlacementResult
> {
  readonly #result: TrackPlacementResult | null
  readonly #preview: TrackPlacementPreview | null
  constructor(configuration: TrackPlacementConfiguration, input: PianoRollPointerInput) {
    this.#preview =
      input.hit === null && configuration.tool === 'pencil'
        ? resolveTrackPlacement(configuration, input.originPosition)
        : null
    const clip =
      input.hit === null
        ? undefined
        : configuration.readModel.clips.find(({ notes }) =>
            notes.some(({ note }) => note.id === input.hit?.noteId),
          )
    if (clip !== undefined)
      this.#result = Object.freeze({ type: 'activate-clip', clipId: clip.clip.clipId })
    else
      this.#result =
        this.#preview === null
          ? null
          : Object.freeze({ type: 'place-note', preview: this.#preview })
  }
  update(input: PianoRollPointerInput): TrackPlacementPreview | null {
    return input.hasExceededDragThreshold ? null : this.#preview
  }
  complete(input: PianoRollPointerInput) {
    return Object.freeze({
      preview: this.update(input),
      result: input.hasExceededDragThreshold ? null : this.#result,
    })
  }
}
