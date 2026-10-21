import { computed, type StyleValue } from 'vue'
import { createPianoRollTimelineViewport } from '@seele-daw/editor'
import { ZERO_TICK, parseTick, type Tick } from '@seele-daw/project-core'
import type { PianoRollSurfaceGeometry } from '@/features/piano-roll/types/piano-roll-pitch-viewport'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'

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

  const visibleNotes = computed(() =>
    Object.freeze(
      getPresentation().readModel.clips.flatMap(({ notes }) =>
        notes
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
      ),
    ),
  )

  const clipWindows = computed(() =>
    Object.freeze(
      getPresentation().readModel.clips.flatMap((clipReadModel) => {
        const { clip } = clipReadModel
        if (clip.startTick >= getTimelineEndTick()) return []
        const visibleEndTick = Math.min(clip.endTick, getTimelineEndTick())
        const color = clip.color ?? getPresentation().color ?? 'var(--sd-color-border-focus)'
        return [
          Object.freeze({
            clipReadModel,
            style: Object.freeze({
              '--project-piano-roll-track-clip-color': color,
              inlineSize: `${((visibleEndTick - clip.startTick) / getTimelineEndTick()) * 100}%`,
              insetInlineStart: `${(clip.startTick / getTimelineEndTick()) * 100}%`,
            }) as StyleValue,
          }),
        ]
      }),
    ),
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
    visibleNotes,
    clipWindows,
  }
}
