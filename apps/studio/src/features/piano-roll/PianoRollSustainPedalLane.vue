<script setup lang="ts">
import {
  PIANO_ROLL_TRACK_CLIP_STATUS,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollSemanticPointerInputAdapter,
  createPianoRollValueLaneViewport,
  pianoRollMidiControlValueToValueLaneCssPixel,
  pianoRollValueLaneTimelineTickToCssPixel,
  resolvePianoRollDomSustainPedalEventHit,
  resolvePianoRollSustainPedalPencilPlacement,
  type PianoRollGrid,
  type PianoRollPointerInputAdapter,
  type PianoRollSustainPedalClipLaneReadModel,
  type PianoRollSustainPedalLaneEventProjection,
  type PianoRollSustainPedalLaneStepSegment,
  type PianoRollTrackSustainPedalLaneReadModel,
  type PianoRollValueLaneViewport,
} from '@seele-daw/editor'
import {
  addTicks,
  parseMidiControlValue,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiControlValue,
  type ModelRevision,
  type Tick,
} from '@seele-daw/project-core'
import {
  computed,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
  type StyleValue,
} from 'vue'

interface PianoRollSustainPedalLaneProps {
  readonly grid: PianoRollGrid
  readonly label: string
  readonly pencilEnabled: boolean
  readonly readModel:
    | PianoRollSustainPedalClipLaneReadModel
    | PianoRollTrackSustainPedalLaneReadModel
  readonly snapEnabled: boolean
  readonly visibleSpanTick: Tick
  readonly visibleStartTick: Tick
}

interface LaneOccurrence {
  readonly active: boolean
  readonly endTick: Tick
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly key: string
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
  readonly event: PianoRollSustainPedalLaneEventProjection['event']
  readonly key: string
  readonly pedalDown: boolean
  readonly style: StyleValue
  readonly timelineTick: Tick
}

interface ActiveLanePlacementConfiguration {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly grid: PianoRollGrid
  readonly modelRevision: ModelRevision
  readonly snapEnabled: boolean
  readonly viewport: PianoRollValueLaneViewport
}

interface PianoRollSustainPedalLanePlacement {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly modelRevision: ModelRevision
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}

const props = defineProps<PianoRollSustainPedalLaneProps>()
const emit = defineEmits<{
  failure: [cause: unknown]
  placement: [placement: PianoRollSustainPedalLanePlacement]
  requestFocus: []
}>()

const laneSurface = useTemplateRef<HTMLElement>('laneSurface')
const viewport = shallowRef<PianoRollValueLaneViewport | null>(null)
let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
let resizeObserver: ResizeObserver | null = null
let activePlacementConfiguration: ActiveLanePlacementConfiguration | null = null

const occurrences = computed<readonly LaneOccurrence[]>(() => {
  const model = props.readModel
  if ('clipId' in model) {
    return Object.freeze([
      Object.freeze({
        active: true,
        endTick: addTicks(props.visibleStartTick, props.visibleSpanTick),
        events: model.events,
        key: model.clipId,
        segments: model.segments,
        startTick: props.visibleStartTick,
        unsupported: false,
      }),
    ])
  }

  return Object.freeze(
    model.clips.map(({ clip, events, segments }) =>
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
  const currentViewport = viewport.value
  if (currentViewport === null) return null
  return {
    insetBlockStart: `${pianoRollMidiControlValueToValueLaneCssPixel(
      currentViewport,
      parseMidiControlValue(64),
    )}px`,
  }
})

function clampVisibleTick(tick: Tick): Tick {
  const currentViewport = viewport.value
  if (currentViewport === null) return tick
  return parseTick(
    Math.min(currentViewport.visibleEndTick, Math.max(currentViewport.visibleStartTick, tick)),
  )
}

const occurrenceWindows = computed(() => {
  const currentViewport = viewport.value
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
  const currentViewport = viewport.value
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
  const currentViewport = viewport.value
  if (currentViewport === null) return Object.freeze([])

  return Object.freeze(
    occurrences.value.flatMap((occurrence) =>
      occurrence.events.flatMap((projection) => {
        if (
          projection.timelineTick < currentViewport.visibleStartTick ||
          projection.timelineTick > currentViewport.visibleEndTick
        ) {
          return []
        }
        const x = pianoRollValueLaneTimelineTickToCssPixel(currentViewport, projection.timelineTick)
        const y = pianoRollMidiControlValueToValueLaneCssPixel(
          currentViewport,
          projection.event.value,
        )
        return [
          Object.freeze({
            active: occurrence.active,
            affectsPlayback: projection.affectsPlayback,
            event: projection.event,
            key: `${occurrence.key}:event:${projection.event.id}`,
            pedalDown: projection.pedalDown,
            style: Object.freeze({ transform: `translate3d(${x}px, ${y}px, 0)` }) as StyleValue,
            timelineTick: projection.timelineTick,
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
  return `CC64 Channel ${props.readModel.channel + 1}, ${eventCount} visible ${
    eventCount === 1 ? 'event' : 'events'
  }`
})

function refreshViewport(): void {
  const surface = laneSurface.value
  if (surface === null || surface.clientWidth <= 0 || surface.clientHeight <= 0) return

  try {
    viewport.value = createPianoRollValueLaneViewport({
      heightCssPixel: surface.clientHeight,
      visibleSpanTick: props.visibleSpanTick,
      visibleStartTick: props.visibleStartTick,
      widthCssPixel: surface.clientWidth,
    })
  } catch (cause) {
    emit('failure', cause)
  }
}

function handleWindowResize(): void {
  refreshViewport()
}

watch(
  () => [props.visibleStartTick, props.visibleSpanTick],
  () => {
    pointerInputAdapter?.cancel()
    refreshViewport()
  },
)
watch(
  () => {
    const model = props.readModel
    return [
      model.projectId,
      model.modelRevision,
      model.channel,
      'clipId' in model ? model.clipId : model.trackId,
      'activeClipId' in model ? model.activeClipId : model.clipId,
    ]
  },
  () => pointerInputAdapter?.cancel(),
)

onMounted(() => {
  const surface = laneSurface.value
  if (surface === null) return

  try {
    pointerInputAdapter = createPianoRollSemanticPointerInputAdapter({
      observer: {
        onError: ({ cause }) => {
          activePlacementConfiguration = null
          emit('failure', cause)
        },
        onInput: (input) => {
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
            emit('requestFocus')
            const currentViewport = viewport.value
            const model = props.readModel
            activePlacementConfiguration =
              props.pencilEnabled && currentViewport !== null
                ? Object.freeze({
                    activeClipId: 'clipId' in model ? model.clipId : model.activeClipId,
                    channel: model.channel,
                    grid: props.grid,
                    modelRevision: model.modelRevision,
                    snapEnabled: props.snapEnabled,
                    viewport: currentViewport,
                  })
                : null
            return
          }
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
            activePlacementConfiguration = null
            return
          }
          if (input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END) return

          const configuration = activePlacementConfiguration
          activePlacementConfiguration = null
          if (configuration === null) return
          const placement = resolvePianoRollSustainPedalPencilPlacement({
            grid: configuration.grid,
            pointerInput: input,
            snapEnabled: configuration.snapEnabled,
            viewport: configuration.viewport,
          })
          if (placement !== null) {
            emit(
              'placement',
              Object.freeze({
                ...placement,
                activeClipId: configuration.activeClipId,
                channel: configuration.channel,
                modelRevision: configuration.modelRevision,
              }),
            )
          }
        },
      },
      resolveHit: resolvePianoRollDomSustainPedalEventHit,
      surface,
    })
  } catch (cause) {
    emit('failure', cause)
    return
  }

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(refreshViewport)
    resizeObserver.observe(surface)
  } else {
    window.addEventListener('resize', handleWindowResize)
  }
  refreshViewport()
})

onUnmounted(() => {
  activePlacementConfiguration = null
  pointerInputAdapter?.dispose()
  pointerInputAdapter = null
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', handleWindowResize)
})
</script>

<template>
  <div
    ref="laneSurface"
    class="piano-roll-sustain-pedal-lane"
    :class="{ 'piano-roll-sustain-pedal-lane--pencil': props.pencilEnabled }"
    :aria-label="props.label"
    role="group"
  >
    <span
      v-if="thresholdStyle"
      class="piano-roll-sustain-pedal-lane__threshold"
      :style="thresholdStyle"
      aria-hidden="true"
    ></span>
    <span
      v-for="occurrence in occurrenceWindows"
      :key="`${occurrence.key}:window`"
      class="piano-roll-sustain-pedal-lane__occurrence"
      :class="{
        'piano-roll-sustain-pedal-lane__occurrence--active': occurrence.active,
        'piano-roll-sustain-pedal-lane__occurrence--unsupported': occurrence.unsupported,
      }"
      :style="occurrence.style"
      aria-hidden="true"
    ></span>
    <span
      v-for="segment in renderedSegments"
      :key="segment.key"
      class="piano-roll-sustain-pedal-lane__segment"
      :class="{
        'piano-roll-sustain-pedal-lane__segment--down': segment.pedalDown,
        'piano-roll-sustain-pedal-lane__segment--inactive': !segment.active,
      }"
      :style="segment.style"
      aria-hidden="true"
    ></span>
    <button
      v-for="event in renderedEvents"
      :key="event.key"
      type="button"
      class="piano-roll-sustain-pedal-lane__event"
      :class="{
        'piano-roll-sustain-pedal-lane__event--down': event.pedalDown,
        'piano-roll-sustain-pedal-lane__event--inactive': !event.active,
        'piano-roll-sustain-pedal-lane__event--terminal': !event.affectsPlayback,
      }"
      :data-piano-roll-sustain-pedal-event-id="event.event.id"
      :style="event.style"
      :aria-label="`Sustain Pedal value ${event.event.value} at tick ${event.timelineTick}${
        event.affectsPlayback ? '' : ', terminal endpoint'
      }`"
    ></button>
    <span class="piano-roll-sustain-pedal-lane__accessible-status" aria-live="polite">
      {{ accessibleSummary }}
    </span>
  </div>
</template>

<style scoped>
.piano-roll-sustain-pedal-lane {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  border-block-start: 1px solid var(--sd-color-border-default);
  background:
    linear-gradient(
      to bottom,
      color-mix(in srgb, var(--sd-color-surface-panel) 54%, transparent),
      transparent
    ),
    var(--sd-color-surface-canvas);
}

.piano-roll-sustain-pedal-lane--pencil {
  cursor: crosshair;
}

.piano-roll-sustain-pedal-lane__threshold {
  position: absolute;
  z-index: 1;
  inset-inline: 0;
  block-size: 1px;
  pointer-events: none;
  border-block-start: 1px dashed var(--sd-color-border-strong);
  opacity: 0.72;
}

.piano-roll-sustain-pedal-lane__occurrence {
  position: absolute;
  z-index: 0;
  inset-block: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  pointer-events: none;
  border-inline: 1px solid color-mix(in srgb, var(--sd-color-border-focus) 36%, transparent);
  background: color-mix(in srgb, var(--sd-color-border-focus) 4%, transparent);
  opacity: 0.4;
}

.piano-roll-sustain-pedal-lane__occurrence--active {
  background: color-mix(in srgb, var(--sd-color-border-focus) 9%, transparent);
  opacity: 1;
}

.piano-roll-sustain-pedal-lane__occurrence--unsupported {
  border-inline-style: dashed;
  background: repeating-linear-gradient(
    -45deg,
    transparent,
    transparent 4px,
    color-mix(in srgb, var(--sd-color-border-strong) 12%, transparent) 4px,
    color-mix(in srgb, var(--sd-color-border-strong) 12%, transparent) 8px
  );
}

.piano-roll-sustain-pedal-lane__segment {
  position: absolute;
  z-index: 2;
  inset-block-start: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  min-block-size: 1px;
  pointer-events: none;
  border-block-start: 2px solid var(--sd-color-text-muted);
  background: color-mix(in srgb, var(--sd-color-text-muted) 12%, transparent);
  opacity: 0.76;
}

.piano-roll-sustain-pedal-lane__segment--down {
  border-block-start-color: var(--sd-color-border-focus);
  background: color-mix(in srgb, var(--sd-color-border-focus) 22%, transparent);
  opacity: 1;
}

.piano-roll-sustain-pedal-lane__segment--inactive {
  opacity: 0.42;
}

.piano-roll-sustain-pedal-lane__event {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-start: 0;
  inline-size: 0.625rem;
  block-size: 0.625rem;
  padding: 0;
  border: 2px solid var(--sd-color-surface-canvas);
  border-radius: 50%;
  background: var(--sd-color-text-muted);
  box-shadow: 0 0 0 1px var(--sd-color-text-muted);
  transform-origin: center;
  translate: -50% -50%;
}

.piano-roll-sustain-pedal-lane__event--down {
  background: var(--sd-color-border-focus);
  box-shadow: 0 0 0 1px var(--sd-color-border-focus);
}

.piano-roll-sustain-pedal-lane__event--inactive {
  opacity: 0.54;
}

.piano-roll-sustain-pedal-lane__event--terminal {
  border-radius: 0;
  rotate: 45deg;
  background: transparent;
}

.piano-roll-sustain-pedal-lane__accessible-status {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
