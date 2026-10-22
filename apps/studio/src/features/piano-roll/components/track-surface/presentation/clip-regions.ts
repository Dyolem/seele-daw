import type { PianoRollTrackReadModel } from '@seele-daw/editor'
import type { Tick } from '@seele-daw/project-core'
import type { TrackClipRegion } from '@/features/piano-roll/components/track-surface/types/track-clip-region'

export const CLIP_HEADER_ROW_HEIGHT = 24
export const CLIP_HEADER_MAXIMUM_VISIBLE_ROWS = 2

/** Interval rows stay stable when Active Clip or Pitch changes. */
export function createTrackClipRegions(
  readModel: PianoRollTrackReadModel,
  timelineEndTick: Tick,
  trackColor: string | null,
): readonly TrackClipRegion[] {
  const rowEnds: number[] = []
  return readModel.clips.flatMap(({ clip }) => {
    if (clip.startTick >= timelineEndTick) return []
    let headerRow = rowEnds.findIndex((end) => end <= clip.startTick)
    if (headerRow < 0) headerRow = rowEnds.length
    rowEnds[headerRow] = clip.endTick
    const visibleEndTick = Math.min(clip.endTick, timelineEndTick)
    return [
      {
        clip,
        headerRow,
        style: {
          '--piano-roll-clip-color': clip.color ?? trackColor ?? 'var(--sd-color-border-focus)',
          inlineSize: `${((visibleEndTick - clip.startTick) / timelineEndTick) * 100}%`,
          insetInlineStart: `${(clip.startTick / timelineEndTick) * 100}%`,
        },
      },
    ]
  })
}
