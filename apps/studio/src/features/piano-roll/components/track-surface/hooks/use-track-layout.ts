import { computed, type StyleValue } from 'vue'
import { createPianoRollTimelineViewport } from '@seele-daw/editor'
import { ZERO_TICK, parseTick, type Tick } from '@seele-daw/project-core'
import type { PianoRollSurfaceGeometry } from '@/features/piano-roll/types/piano-roll-pitch-viewport'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'
import {
  CLIP_HEADER_ROW_HEIGHT,
  CLIP_HEADER_MAXIMUM_VISIBLE_ROWS,
  createTrackClipRegions,
} from '@/features/piano-roll/components/track-surface/presentation/clip-regions'
import type { TrackVisibleClipNotes } from '@/features/piano-roll/components/track-surface/types/track-clip-region'

export function useTrackLayout({
  getGeometry,
  getPresentation,
  getTimelineEndTick,
  getBarSpanTick,
}: {
  readonly getGeometry: () => PianoRollSurfaceGeometry | null
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
}) {
  const timelineBars = computed(() => {
    const barCount = Math.ceil(getTimelineEndTick() / getBarSpanTick())
    return Object.freeze(
      Array.from({ length: barCount }, (_, index) => {
        const startTick = parseTick(index * getBarSpanTick())
        const spanTick = Math.min(getBarSpanTick(), getTimelineEndTick() - startTick)
        return Object.freeze({
          number: index + 1,
          style: Object.freeze({
            inlineSize: `${(spanTick / getBarSpanTick()) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM}rem`,
          }) as StyleValue,
        })
      }),
    )
  })

  const timelineContentStyle = computed(
    (): StyleValue => ({
      inlineSize: `${
        (getTimelineEndTick() / getBarSpanTick()) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
      }rem`,
    }),
  )

  const visibleClips = computed<readonly TrackVisibleClipNotes[]>(() =>
    Object.freeze(
      getPresentation().readModel.clips.map(({ clip, notes }) => ({
        clip,
        notes: notes
          .filter(
            ({ note }) =>
              viewport.value !== null &&
              note.pitch >= viewport.value.minimumPitch &&
              note.pitch <= viewport.value.maximumPitch,
          )
          .map(({ note, projectEndTick, projectStartTick }) =>
            Object.freeze({
              note,
              visibleEndTick: projectEndTick,
              visibleStartTick: projectStartTick,
            }),
          ),
      })),
    ),
  )

  const clipRegions = computed(() =>
    createTrackClipRegions(
      getPresentation().readModel,
      getTimelineEndTick(),
      getPresentation().color,
    ),
  )
  const clipHeaderRowCount = computed(() =>
    Math.max(1, ...clipRegions.value.map(({ headerRow }) => headerRow + 1)),
  )
  const clipHeaderHeight = computed(
    () =>
      Math.min(CLIP_HEADER_MAXIMUM_VISIBLE_ROWS, clipHeaderRowCount.value) * CLIP_HEADER_ROW_HEIGHT,
  )

  const viewport = computed(() => {
    const geometry = getGeometry()
    if (geometry === null) return null
    return createPianoRollTimelineViewport({
      ...geometry,
      visibleSpanTick: getTimelineEndTick(),
      visibleStartTick: ZERO_TICK,
    })
  })

  return {
    viewport,
    timelineBars,
    timelineContentStyle,
    visibleClips,
    clipRegions,
    clipHeaderRowCount,
    clipHeaderHeight,
  }
}
