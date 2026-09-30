import type { InteractionOperation } from '@seele-daw/editor'
import { parseTick, type TempoEventRecord } from '@seele-daw/project-core'
import {
  resolveDraggedProjectTempoBpm,
  resolveProjectTempoTrackDragAxis,
  resolveProjectTempoTrackTick,
} from '@/features/project-workspace/tempo-track/tempo-track'
import type {
  TempoTrackDragMapping,
  TempoTrackDragPreview,
  TempoTrackDragResult,
  TempoTrackPointerInput,
} from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import type { ProjectTempoTrackDragAxis } from '@/features/project-workspace/tempo-track/types/tempo-track'

/** Freezes the grab mapping and owns only the once-selected editing axis. */
export class TempoTrackDragOperation implements InteractionOperation<
  TempoTrackPointerInput,
  TempoTrackDragPreview,
  TempoTrackDragResult
> {
  readonly #event: TempoEventRecord
  readonly #mapping: TempoTrackDragMapping
  readonly #origin: TempoTrackPointerInput['originPosition']
  readonly #grabOffsetTick: number
  #axis: ProjectTempoTrackDragAxis | null = null

  constructor(
    event: TempoEventRecord,
    mapping: TempoTrackDragMapping,
    input: TempoTrackPointerInput,
  ) {
    this.#event = Object.freeze({ ...event })
    this.#mapping = Object.freeze({ ...mapping, scale: Object.freeze({ ...mapping.scale }) })
    this.#origin = Object.freeze({ ...input.originPosition })
    this.#grabOffsetTick = this.#tickAt(this.#origin.xCssPixel) - event.tick
  }

  update(input: TempoTrackPointerInput): TempoTrackDragPreview {
    if (this.#axis === null && input.hasExceededDragThreshold) {
      this.#axis = resolveProjectTempoTrackDragAxis(
        input.position.xCssPixel - this.#origin.xCssPixel,
        input.position.yCssPixel - this.#origin.yCssPixel,
        this.#event.tick !== 0,
      )
    }
    let { bpm, tick } = this.#event
    if (this.#axis === 'tick') {
      tick = parseTick(
        Math.min(
          this.#mapping.timelineEndTick,
          Math.max(0, this.#tickAt(input.position.xCssPixel) - this.#grabOffsetTick),
        ),
      )
    } else if (this.#axis === 'bpm' && input.position.yCssPixel !== this.#origin.yCssPixel) {
      // Returning to the origin preserves imported precision and produces no command.
      bpm = resolveDraggedProjectTempoBpm({
        currentClientY: input.position.yCssPixel,
        laneHeight: this.#mapping.height,
        scale: this.#mapping.scale,
        startBpm: bpm,
        startClientY: this.#origin.yCssPixel,
      })
    }
    return Object.freeze({ axis: this.#axis, bpm, tick, tempoEventId: this.#event.id })
  }

  complete(input: TempoTrackPointerInput) {
    const preview = this.update(input)
    let result: TempoTrackDragResult | null = null
    if (preview.axis === 'tick' && preview.tick !== this.#event.tick) {
      result = Object.freeze({ axis: 'tick', tempoEventId: this.#event.id, tick: preview.tick })
    } else if (preview.axis === 'bpm' && preview.bpm !== this.#event.bpm) {
      result = Object.freeze({ axis: 'bpm', tempoEventId: this.#event.id, bpm: preview.bpm })
    }
    return { preview, result }
  }

  #tickAt(xCssPixel: number) {
    return resolveProjectTempoTrackTick({
      clientX: xCssPixel,
      laneLeft: 0,
      laneWidth: this.#mapping.width,
      timelineEndTick: this.#mapping.timelineEndTick,
    })
  }
}
