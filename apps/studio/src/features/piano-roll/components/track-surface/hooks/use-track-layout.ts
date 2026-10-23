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
import type { TrackRenderWindow } from '@/features/piano-roll/components/track-surface/types/track-render-window'

export function useTrackLayout({
  getGeometry,
  getPresentation,
  getTimelineEndTick,
  getBarSpanTick,
  getRenderWindow,
}: {
  readonly getGeometry: () => PianoRollSurfaceGeometry | null
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
  readonly getRenderWindow: () => TrackRenderWindow | null
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

  const visibleClips = computed<readonly TrackVisibleClipNotes[]>(() => {
    const visible = renderViewport.value
    if (visible === null) return []
    return getPresentation()
      .readModel.clips.filter(
        ({ clip }) =>
          clip.startTick < visible.visibleEndTick && clip.endTick > visible.visibleStartTick,
      )
      .map(({ clip, notes }) => ({
        clip,
        notes: notes
          .filter(
            ({ note, projectStartTick, projectEndTick }) =>
              note.pitch >= visible.minimumPitch &&
              note.pitch <= visible.maximumPitch &&
              projectStartTick < visible.visibleEndTick &&
              projectEndTick > visible.visibleStartTick,
          )
          .map(({ note, projectEndTick, projectStartTick }) => ({
            note,
            visibleEndTick: parseTick(Math.min(projectEndTick, visible.visibleEndTick)),
            visibleStartTick: parseTick(Math.max(projectStartTick, visible.visibleStartTick)),
          })),
      }))
  })

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

  const renderViewport = computed(() => {
    const full = viewport.value
    const window = getRenderWindow()
    if (full === null || window === null) return null
    const ticksPerPixel = full.visibleSpanTick / full.widthCssPixel
    const start = parseTick(Math.floor(window.leftCssPixel * ticksPerPixel))
    const end = parseTick(
      Math.min(
        full.visibleEndTick,
        Math.ceil((window.leftCssPixel + window.widthCssPixel) * ticksPerPixel),
      ),
    )
    return createPianoRollTimelineViewport({
      ...full,
      visibleStartTick: start,
      visibleSpanTick: parseTick(end - start),
      widthCssPixel: (end - start) / ticksPerPixel,
    })
  })
  const renderWindowStyle = computed((): StyleValue => {
    const full = viewport.value
    const rendered = renderViewport.value
    if (full === null || rendered === null) return { display: 'none' }
    return {
      width: `${rendered.widthCssPixel}px`,
      transform: `translateX(${(rendered.visibleStartTick / full.visibleSpanTick) * full.widthCssPixel}px)`,
    }
  })

  return {
    viewport,
    renderViewport,
    renderWindowStyle,
    timelineBars,
    timelineContentStyle,
    visibleClips,
    clipRegions,
    clipHeaderRowCount,
    clipHeaderHeight,
  }
}
