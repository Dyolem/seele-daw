import { computed, shallowRef, watch, type ShallowRef, type StyleValue } from 'vue'
import { createPianoRollTimelineViewport, type PianoRollTimelineViewport } from '@seele-daw/editor'
import { ZERO_TICK, parseTick, type Tick } from '@seele-daw/project-core'
import {
  INITIAL_MINIMUM_PITCH,
  INITIAL_MAXIMUM_PITCH,
} from '@/features/piano-roll/presentation/piano-roll-pitch-layout'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/types/piano-roll-presentation'

export function useTrackLayout({
  canvasHost,
  getPresentation,
  getTimelineEndTick,
  getBarSpanTick,
  reportFailure,
}: {
  readonly canvasHost: Readonly<ShallowRef<HTMLElement | null>>
  readonly getPresentation: () => ReadyProjectPianoRollTrackPresentation
  readonly getTimelineEndTick: () => Tick
  readonly getBarSpanTick: () => Tick
  readonly reportFailure: (cause: unknown) => void
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
              note.pitch >= INITIAL_MINIMUM_PITCH && note.pitch <= INITIAL_MAXIMUM_PITCH,
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

  const viewport = shallowRef<PianoRollTimelineViewport | null>(null)
  let observer: ResizeObserver | null = null
  let observing = false
  function refreshViewport(): void {
    if (!observing) return
    const host = canvasHost.value
    if (host === null || host.clientWidth <= 0 || host.clientHeight <= 0) {
      viewport.value = null
      return
    }
    try {
      const previous = viewport.value
      if (
        previous !== null &&
        previous.widthCssPixel === host.clientWidth &&
        previous.heightCssPixel === host.clientHeight &&
        previous.visibleSpanTick === getTimelineEndTick()
      )
        return
      viewport.value = createPianoRollTimelineViewport({
        heightCssPixel: host.clientHeight,
        maximumPitch: INITIAL_MAXIMUM_PITCH,
        minimumPitch: INITIAL_MINIMUM_PITCH,
        visibleSpanTick: getTimelineEndTick(),
        visibleStartTick: ZERO_TICK,
        widthCssPixel: host.clientWidth,
      })
    } catch (cause) {
      viewport.value = null
      reportFailure(cause)
    }
  }
  watch([getTimelineEndTick, getBarSpanTick], refreshViewport, { flush: 'post' })

  return {
    viewport: computed(() => viewport.value),
    timelineBars,
    timelineContentStyle,
    visibleNotes,
    clipWindows,
    mount() {
      const host = canvasHost.value
      if (host === null || observing) return
      observing = true
      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(refreshViewport)
        observer.observe(host)
      } else {
        window.addEventListener('resize', refreshViewport)
      }
      refreshViewport()
    },
    dispose() {
      observing = false
      observer?.disconnect()
      observer = null
      window.removeEventListener('resize', refreshViewport)
      viewport.value = null
    },
  }
}
