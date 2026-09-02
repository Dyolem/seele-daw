<script setup lang="ts">
import {
  PIANO_ROLL_INTERACTION_TOOL,
  PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT,
  PIANO_ROLL_SUSTAIN_PEDAL_TRANSFORM_AXIS,
  PIANO_ROLL_TRACK_CLIP_STATUS,
  PIANO_ROLL_POINTER_INPUT_PHASE,
  createPianoRollSustainPedalInteractionSession,
  createPianoRollSemanticPointerInputAdapter,
  createPianoRollValueLaneViewport,
  pianoRollMidiControlValueToValueLaneCssPixel,
  pianoRollValueLaneTimelineTickToCssPixel,
  reconcilePianoRollSustainPedalSelection,
  resolvePianoRollDomSustainPedalEventHit,
  resolvePianoRollSustainPedalEditingScope,
  resolvePianoRollSustainPedalRemoval,
  type PianoRollClipContext,
  type PianoRollGrid,
  type PianoRollPointerInputAdapter,
  type PianoRollSustainPedalClipLaneReadModel,
  type PianoRollSustainPedalEditingScope,
  type PianoRollSustainPedalInteractionState,
  type PianoRollSustainPedalLaneEventProjection,
  type PianoRollSustainPedalLaneStepSegment,
  type PianoRollTrackSustainPedalLaneReadModel,
  type PianoRollValueLaneViewport,
} from '@seele-daw/editor'
import {
  addTicks,
  isMidiSustainPedalDown,
  parseMidiControlValue,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiControlValue,
  type MidiSustainPedalEventId,
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

import { createProjectPianoRollSustainPedalIntentHandler } from '@/features/piano-roll/project-piano-roll-sustain-pedal-intent-handler'
import { useProjectMidiSustainPedal } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'

interface PianoRollSustainPedalLaneProps {
  readonly clipContext: PianoRollClipContext | null
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
  readonly preview: boolean
  readonly selected: boolean
  readonly style: StyleValue
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}

interface ActiveLaneInteractionConfiguration {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly modelRevision: ModelRevision
  readonly scope: PianoRollSustainPedalEditingScope | null
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
  completed: []
  failure: [cause: unknown]
  placement: [placement: PianoRollSustainPedalLanePlacement]
  requestFocus: []
}>()
const { projectMidiSustainPedal } = useProjectMidiSustainPedal()

const laneSurface = useTemplateRef<HTMLElement>('laneSurface')
const viewport = shallowRef<PianoRollValueLaneViewport | null>(null)
const selectedEventIds = shallowRef<readonly MidiSustainPedalEventId[]>(Object.freeze([]))
const interactionSession = createPianoRollSustainPedalInteractionSession()
const interactionState = shallowRef<PianoRollSustainPedalInteractionState>(interactionSession.state)
let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
let resizeObserver: ResizeObserver | null = null
let activeInteractionConfiguration: ActiveLaneInteractionConfiguration | null = null

function selectionsEqual(
  left: readonly MidiSustainPedalEventId[],
  right: readonly MidiSustainPedalEventId[],
): boolean {
  return left.length === right.length && left.every((eventId, index) => eventId === right[index])
}

function setSelectedEventIds(eventIds: readonly MidiSustainPedalEventId[]): void {
  const next = Object.freeze([...eventIds])
  if (selectionsEqual(selectedEventIds.value, next)) return
  selectedEventIds.value = next
}

const handleInteractionIntent = createProjectPianoRollSustainPedalIntentHandler({
  getAuthorityRevision: () => props.readModel.modelRevision,
  getInteractionScope: () => activeInteractionConfiguration?.scope ?? null,
  getSelectedEventIds: () => selectedEventIds.value,
  interactionSession,
  projectMidiSustainPedal,
  reportFailure: (cause) => emit('failure', cause),
  reportSuccess: () => emit('completed'),
  setSelectedEventIds,
})
const unsubscribeInteractionSession = interactionSession.subscribe({
  onStateChange: (state) => {
    interactionState.value = state
  },
})
const selectedEventIdSet = computed(() => new Set(selectedEventIds.value))

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
  const preview = interactionState.value.preview

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
  return `CC64 Channel ${props.readModel.channel + 1}, ${eventCount} visible ${
    eventCount === 1 ? 'event' : 'events'
  }, CC64 selection ${selectedEventIds.value.length}`
})

function resolveEditingScope(): PianoRollSustainPedalEditingScope | null {
  const model = props.readModel
  if ('clipId' in model) {
    if (props.clipContext === null) {
      throw new Error('Clip Focus Sustain Pedal editing requires its Piano Roll Clip context')
    }
    return resolvePianoRollSustainPedalEditingScope({
      context: props.clipContext,
      readModel: model,
    })
  }
  return resolvePianoRollSustainPedalEditingScope({ readModel: model })
}

function reconcileSelection(): void {
  try {
    setSelectedEventIds(
      reconcilePianoRollSustainPedalSelection(resolveEditingScope(), selectedEventIds.value),
    )
  } catch (cause) {
    setSelectedEventIds([])
    emit('failure', cause)
  }
}

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
    if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    activeInteractionConfiguration = null
    refreshViewport()
  },
)
watch(
  [
    () => props.readModel.projectId,
    () => props.readModel.channel,
    () => ('clipId' in props.readModel ? props.readModel.clipId : props.readModel.trackId),
    () =>
      'activeClipId' in props.readModel ? props.readModel.activeClipId : props.readModel.clipId,
    () => props.clipContext?.clipId ?? null,
    () => props.clipContext?.sourceId ?? null,
  ],
  () => {
    if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    activeInteractionConfiguration = null
    setSelectedEventIds([])
  },
)
watch(
  () => props.readModel.modelRevision,
  (revision) => {
    if (interactionState.value.pointerId !== null) pointerInputAdapter?.cancel()
    interactionSession.notifyAuthorityRevision(revision)
    reconcileSelection()
  },
)

function hasSelection(): boolean {
  return selectedEventIds.value.length > 0
}

function hasCancellableInteraction(): boolean {
  return interactionState.value.pointerId !== null
}

function clearSelectionOrCancelInteraction(): boolean {
  if (hasCancellableInteraction()) {
    if (!(pointerInputAdapter?.cancel() ?? false)) interactionSession.cancel()
    activeInteractionConfiguration = null
    emit('completed')
    return true
  }
  if (!hasSelection()) return false
  setSelectedEventIds([])
  emit('completed')
  return true
}

function removeSelectedEvents(): boolean {
  let removal: ReturnType<typeof resolvePianoRollSustainPedalRemoval>
  try {
    removal = resolvePianoRollSustainPedalRemoval(resolveEditingScope(), selectedEventIds.value)
  } catch (cause) {
    emit('failure', cause)
    return hasSelection()
  }
  if (removal === null) return false

  try {
    projectMidiSustainPedal.removeEvents({
      baseRevision: removal.baseRevision,
      clipId: removal.clipId,
      eventIds: removal.eventIds,
    })
    setSelectedEventIds([])
    emit('completed')
  } catch (cause) {
    emit('failure', cause)
  }
  return true
}

defineExpose({
  clearSelectionOrCancelInteraction,
  hasCancellableInteraction,
  hasSelection,
  removeSelectedEvents,
})

onMounted(() => {
  const surface = laneSurface.value
  if (surface === null) return

  try {
    pointerInputAdapter = createPianoRollSemanticPointerInputAdapter({
      observer: {
        onError: ({ cause }) => {
          activeInteractionConfiguration = null
          interactionSession.cancel()
          emit('failure', cause)
        },
        onInput: (input) => {
          const currentViewport = viewport.value
          if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
            surface.focus({ preventScroll: true })
            emit('requestFocus')
            const model = props.readModel
            if (currentViewport === null) return
            try {
              activeInteractionConfiguration = Object.freeze({
                activeClipId: 'clipId' in model ? model.clipId : model.activeClipId,
                channel: model.channel,
                modelRevision: model.modelRevision,
                scope: resolveEditingScope(),
              })
            } catch (cause) {
              activeInteractionConfiguration = null
              emit('failure', cause)
              return
            }
          }
          const configuration = activeInteractionConfiguration
          const outcome = interactionSession.handlePointerInput(
            input,
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN &&
              configuration !== null &&
              currentViewport !== null
              ? {
                  grid: props.grid,
                  scope: configuration.scope,
                  selectedEventIds: selectedEventIds.value,
                  snapEnabled: props.snapEnabled,
                  tool: props.pencilEnabled
                    ? PIANO_ROLL_INTERACTION_TOOL.PENCIL
                    : PIANO_ROLL_INTERACTION_TOOL.CURSOR,
                  viewport: currentViewport,
                }
              : undefined,
          )
          if (outcome.failure !== null) emit('failure', outcome.failure)
          if (outcome.intent !== null) {
            if (
              outcome.intent.type === PIANO_ROLL_SUSTAIN_PEDAL_INTERACTION_INTENT.PLACE_EVENT &&
              configuration !== null
            ) {
              const placement = outcome.intent.placement
              emit(
                'placement',
                Object.freeze({
                  ...placement,
                  activeClipId: configuration.activeClipId,
                  channel: configuration.channel,
                  modelRevision: configuration.modelRevision,
                }),
              )
            } else {
              handleInteractionIntent(outcome.intent)
            }
          }
          if (
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.END ||
            input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL
          ) {
            activeInteractionConfiguration = null
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
  activeInteractionConfiguration = null
  pointerInputAdapter?.dispose()
  pointerInputAdapter = null
  unsubscribeInteractionSession()
  interactionSession.dispose()
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
    :data-interaction-status="interactionState.status"
    role="group"
    tabindex="0"
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
        'piano-roll-sustain-pedal-lane__event--preview': event.preview,
        'piano-roll-sustain-pedal-lane__event--selected': event.selected,
        'piano-roll-sustain-pedal-lane__event--terminal': !event.affectsPlayback,
      }"
      :data-piano-roll-sustain-pedal-event-id="event.event.id"
      :style="event.style"
      :aria-label="`Sustain Pedal value ${event.value} at tick ${event.timelineTick}${
        event.affectsPlayback ? '' : ', terminal endpoint'
      }${event.selected ? ', selected' : ''}`"
      :aria-pressed="event.selected"
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

.piano-roll-sustain-pedal-lane:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
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

.piano-roll-sustain-pedal-lane__event--preview {
  z-index: 4;
}

.piano-roll-sustain-pedal-lane__event--selected {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: 2px;
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
