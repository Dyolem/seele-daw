import { computed, type StyleValue } from 'vue'
import {
  PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS,
  PIANO_ROLL_TRACK_CLIP_STATUS,
  pianoRollMidiControlValueToValueLaneCssPixel,
  pianoRollValueLaneTimelineTickToCssPixel,
  type PianoRollSustainPedalInteractionState,
  type PianoRollSustainPedalLaneEventProjection,
  type PianoRollSustainPedalLaneStepSegment,
  type PianoRollValueLaneViewport,
} from '@seele-daw/editor'
import {
  addTicks,
  isMidiSustainPedalDown,
  parseMidiControlValue,
  parseTick,
  type ClipId,
  type MidiControlValue,
  type MidiSustainPedalEventId,
  type Tick,
} from '@seele-daw/project-core'
import type { SustainPedalLaneReadModel } from '@/features/piano-roll/components/sustain-pedal/types/sustain-pedal-lane'

export function useSustainPedalProjection({
  getReadModel,
  getVisibleStartTick,
  getVisibleSpanTick,
  getViewport,
  getSelectedEventIds,
  getPreview,
}: {
  readonly getReadModel: () => SustainPedalLaneReadModel
  readonly getVisibleStartTick: () => Tick
  readonly getVisibleSpanTick: () => Tick
  readonly getViewport: () => PianoRollValueLaneViewport | null
  readonly getSelectedEventIds: () => readonly MidiSustainPedalEventId[]
  readonly getPreview: () => PianoRollSustainPedalInteractionState['preview']
}) {
  interface LaneOccurrence {
    readonly active: boolean
    readonly endTick: Tick
    readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
    readonly key: ClipId
    readonly segments: readonly PianoRollSustainPedalLaneStepSegment[]
    readonly startTick: Tick
    readonly unsupported: boolean
  }

  interface RenderedLaneSegment {
    readonly active: boolean
    readonly key: string
    readonly pedalDown: boolean
    readonly style: StyleValue
    readonly value: MidiControlValue
  }

  interface RenderedLaneEvent {
    readonly active: boolean
    readonly affectsPlayback: boolean
    readonly clipId: ClipId
    readonly event: PianoRollSustainPedalLaneEventProjection['event']
    readonly key: string
    readonly pedalDown: boolean
    readonly preview: boolean
    readonly selected: boolean
    readonly style: StyleValue
    readonly timelineTick: Tick
    readonly value: MidiControlValue
  }

  const selectedEventIdSet = computed(() => new Set(getSelectedEventIds()))

  const occurrences = computed<readonly LaneOccurrence[]>(() => {
    const model = getReadModel()
    if ('clipId' in model) {
      return Object.freeze([
        Object.freeze({
          active: true,
          endTick: addTicks(getVisibleStartTick(), getVisibleSpanTick()),
          events: model.events,
          key: model.clipId,
          segments: model.segments,
          startTick: getVisibleStartTick(),
          unsupported: false,
        }),
      ])
    }

    return Object.freeze(
      [...model.clips]
        .sort(
          (left, right) =>
            Number(left.clip.clipId === model.activeClipId) -
            Number(right.clip.clipId === model.activeClipId),
        )
        .map(({ clip, events, segments }) =>
          Object.freeze({
            active: clip.clipId === model.activeClipId,
            endTick: clip.endTick,
            events,
            key: clip.clipId,
            segments,
            startTick: clip.startTick,
            unsupported: clip.status === PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED,
          }),
        ),
    )
  })

  const thresholdStyle = computed<StyleValue | null>(() => {
    const currentViewport = getViewport()
    if (currentViewport === null) return null
    return {
      insetBlockStart: `${pianoRollMidiControlValueToValueLaneCssPixel(
        currentViewport,
        parseMidiControlValue(64),
      )}px`,
    }
  })

  function clampVisibleTick(tick: Tick): Tick {
    const currentViewport = getViewport()
    if (currentViewport === null) return tick
    return parseTick(
      Math.min(currentViewport.visibleEndTick, Math.max(currentViewport.visibleStartTick, tick)),
    )
  }

  const occurrenceWindows = computed(() => {
    const currentViewport = getViewport()
    if (currentViewport === null) return Object.freeze([])

    return Object.freeze(
      occurrences.value.flatMap((occurrence) => {
        if (
          occurrence.endTick < currentViewport.visibleStartTick ||
          occurrence.startTick > currentViewport.visibleEndTick
        ) {
          return []
        }
        const startX = pianoRollValueLaneTimelineTickToCssPixel(
          currentViewport,
          clampVisibleTick(occurrence.startTick),
        )
        const endX = pianoRollValueLaneTimelineTickToCssPixel(
          currentViewport,
          clampVisibleTick(occurrence.endTick),
        )
        return [
          Object.freeze({
            ...occurrence,
            style: Object.freeze({
              inlineSize: `${Math.max(1, endX - startX)}px`,
              transform: `translateX(${startX}px)`,
            }) as StyleValue,
          }),
        ]
      }),
    )
  })

  const renderedSegments = computed<readonly RenderedLaneSegment[]>(() => {
    const currentViewport = getViewport()
    if (currentViewport === null) return Object.freeze([])

    return Object.freeze(
      occurrences.value.flatMap((occurrence) =>
        occurrence.segments.flatMap((segment, index) => {
          if (
            segment.endTick < currentViewport.visibleStartTick ||
            segment.startTick > currentViewport.visibleEndTick
          ) {
            return []
          }
          const startX = pianoRollValueLaneTimelineTickToCssPixel(
            currentViewport,
            clampVisibleTick(segment.startTick),
          )
          const endX = pianoRollValueLaneTimelineTickToCssPixel(
            currentViewport,
            clampVisibleTick(segment.endTick),
          )
          const y = pianoRollMidiControlValueToValueLaneCssPixel(currentViewport, segment.value)
          return [
            Object.freeze({
              active: occurrence.active,
              key: `${occurrence.key}:segment:${index}`,
              pedalDown: segment.pedalDown,
              style: Object.freeze({
                blockSize: `${Math.max(1, currentViewport.heightCssPixel - y)}px`,
                inlineSize: `${Math.max(1, endX - startX)}px`,
                transform: `translate3d(${startX}px, ${Math.min(
                  currentViewport.heightCssPixel - 1,
                  y,
                )}px, 0)`,
              }) as StyleValue,
              value: segment.value,
            }),
          ]
        }),
      ),
    )
  })

  const renderedEvents = computed<readonly RenderedLaneEvent[]>(() => {
    const currentViewport = getViewport()
    if (currentViewport === null) return Object.freeze([])
    const preview = getPreview()

    return Object.freeze(
      occurrences.value.flatMap((occurrence) =>
        occurrence.events.flatMap((projection) => {
          let timelineTick = projection.timelineTick
          let value = projection.event.value
          let isPreview = false
          if (occurrence.active && preview !== null) {
            const previewEvent = preview.events.find(
              (candidate) => candidate.eventId === projection.event.id,
            )
            if (
              preview.axis === PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS.TICK &&
              preview.eventIds.includes(projection.event.id) &&
              previewEvent === undefined
            ) {
              return []
            }
            if (previewEvent !== undefined) {
              timelineTick = previewEvent.timelineTick
              value = previewEvent.value
              isPreview = true
            }
          }
          if (
            timelineTick < currentViewport.visibleStartTick ||
            timelineTick > currentViewport.visibleEndTick
          ) {
            return []
          }
          const x = pianoRollValueLaneTimelineTickToCssPixel(currentViewport, timelineTick)
          const y = pianoRollMidiControlValueToValueLaneCssPixel(currentViewport, value)
          return [
            Object.freeze({
              active: occurrence.active,
              affectsPlayback: isPreview
                ? timelineTick < occurrence.endTick
                : projection.affectsPlayback,
              clipId: occurrence.key,
              event: projection.event,
              key: `${occurrence.key}:event:${projection.event.id}`,
              pedalDown: isPreview ? isMidiSustainPedalDown(value) : projection.pedalDown,
              preview: isPreview,
              selected: occurrence.active && selectedEventIdSet.value.has(projection.event.id),
              style: Object.freeze({ transform: `translate3d(${x}px, ${y}px, 0)` }) as StyleValue,
              timelineTick,
              value,
            }),
          ]
        }),
      ),
    )
  })

  const accessibleSummary = computed(() => {
    const eventCount = occurrences.value.reduce(
      (count, occurrence) => count + occurrence.events.length,
      0,
    )
    return `CC64 Channel ${getReadModel().channel + 1}, ${eventCount} visible ${
      eventCount === 1 ? 'event' : 'events'
    }, CC64 selection ${getSelectedEventIds().length}`
  })

  return { thresholdStyle, occurrenceWindows, renderedSegments, renderedEvents, accessibleSummary }
}
