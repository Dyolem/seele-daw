<script setup lang="ts">
import {
  PIANO_ROLL_POINTER_INPUT_PHASE,
  PIANO_ROLL_TRACK_CLIP_STATUS,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  TIMELINE_GRID_SNAP_MODE,
  createPianoRollGrid,
  createPianoRollGridCanvasRenderer,
  createPianoRollNoteScene,
  createPianoRollPointerInputAdapter,
  createPianoRollTrackSustainPedalLaneReadModel,
  createPianoRollTimelineViewport,
  pianoRollCssPixelToMidiPitch,
  pianoRollCssPixelToTimelineTickPosition,
  pianoRollMidiPitchToCssPixel,
  pianoRollTimelineTickToCssPixel,
  resolvePianoRollDomNoteHit,
  resolvePianoRollTrackNotePlacement,
  resolveTimelineGridTick,
  type PianoRollGridCanvasRenderer,
  type PianoRollGridCanvasTheme,
  type PianoRollNoteRenderer,
  type PianoRollPointerInput,
  type PianoRollPointerInputAdapter,
  type PianoRollTimelineViewport,
  type PianoRollTrackNotePlacement,
} from '@seele-daw/editor'
import {
  ZERO_TICK,
  parseMidiChannel,
  parseMidiPitch,
  parsePositiveTick,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiControlValue,
  type MidiPitch,
  type ModelRevision,
  type NoteId,
  type Tick,
} from '@seele-daw/project-core'
import CursorIcon from '~icons/fluent/cursor-20-regular'
import GridIcon from '~icons/fluent/grid-20-regular'
import PenIcon from '~icons/fluent/pen-20-regular'
import TargetArrowIcon from '~icons/fluent/target-arrow-20-regular'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
  watchEffect,
  type StyleValue,
} from 'vue'

import TrackPlayhead from '@/features/piano-roll/playhead/TrackPlayhead.vue'
import PianoRollSustainPedalLane from '@/features/piano-roll/PianoRollSustainPedalLane.vue'
import type { ReadyProjectPianoRollTrackPresentation } from '@/features/piano-roll/project-piano-roll-presentation'
import { createProjectPianoRollNoteRenderer } from '@/features/piano-roll/project-piano-roll-note-renderer'
import {
  PIANO_ROLL_TOOL,
  usePianoRollPreferencesStore,
  type PianoRollTool,
} from '@/features/piano-roll/piano-roll-preferences-store'
import {
  resolvePagedFollowScrollLeft,
  timelinePositionRatio,
} from '@/features/project-workspace/timeline/layout'
import { PROJECT_TIMELINE_BAR_INLINE_SIZE_REM } from '@/features/project-workspace/timeline/scale'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import UiIconButton from '@/ui/components/UiIconButton.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { useProjectMidiNotes } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { ProjectMidiSustainPedalError } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-error'
import { useProjectMidiSustainPedal } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import { useProjectPlayback } from '@/workbench/project/playback/vue/project-playback-context'

interface ProjectPianoRollTrackSurfaceProps {
  readonly barSpanTick: Tick
  readonly presentation: ReadyProjectPianoRollTrackPresentation
  readonly timelineEndTick: Tick
  readonly timeSignatureNumerator: number
}

interface TrackPlacementPreview {
  readonly pitch: MidiPitch
  readonly placement: PianoRollTrackNotePlacement
}

const props = defineProps<ProjectPianoRollTrackSurfaceProps>()
const { projectMidiNotes } = useProjectMidiNotes()
const { projectMidiSustainPedal } = useProjectMidiSustainPedal()
const { state: playbackState, visualPosition: playbackVisualPosition } = useProjectPlayback()
const pianoRollPreferences = usePianoRollPreferencesStore()
const workbenchSelection = useProjectWorkbenchSelectionStore()
const toasts = useUiToastStore()

const INITIAL_MINIMUM_PITCH = parseMidiPitch(48)
const INITIAL_MAXIMUM_PITCH = parseMidiPitch(72)

const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const canvasHost = useTemplateRef<HTMLElement>('canvasHost')
const gridCanvas = useTemplateRef<HTMLCanvasElement>('gridCanvas')
const noteHost = useTemplateRef<HTMLElement>('noteHost')
const scrollViewport = useTemplateRef<HTMLElement>('scrollViewport')
const viewport = shallowRef<PianoRollTimelineViewport | null>(null)
const placementPreview = shallowRef<TrackPlacementPreview | null>(null)
const failureMessage = shallowRef<string | null>(null)
const gridRenderer = shallowRef<PianoRollGridCanvasRenderer | null>(null)
const noteRenderer = shallowRef<PianoRollNoteRenderer | null>(null)
const isTimelineFollowSuspended = shallowRef(false)
let pointerInputAdapter: PianoRollPointerInputAdapter | null = null
let resizeObserver: ResizeObserver | null = null
let observedScrollLeft = 0

const TIMELINE_INTERACTION_KEYS = new Set([
  ' ',
  'ArrowLeft',
  'ArrowRight',
  'End',
  'Enter',
  'Home',
  'PageDown',
  'PageUp',
])

const isCurrentProjectPlaying = computed(
  () =>
    playbackState.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING &&
    playbackState.value.projectId === props.presentation.projectId,
)
const isTimelineFollowActive = computed(
  () => isCurrentProjectPlaying.value && !isTimelineFollowSuspended.value,
)
const timelineFollowLabel = computed(() => {
  if (!isCurrentProjectPlaying.value) return 'Track timeline follow — starts with playback'
  return isTimelineFollowSuspended.value
    ? 'Resume Track timeline follow'
    : 'Pause Track timeline follow'
})
const currentPlaybackPositionTick = computed(() =>
  playbackVisualPosition.value.projectId === props.presentation.projectId
    ? playbackVisualPosition.value.positionTick
    : 0,
)

const pianoKeys = Object.freeze(
  Array.from({ length: INITIAL_MAXIMUM_PITCH - INITIAL_MINIMUM_PITCH + 1 }, (_, index) => {
    const pitch = INITIAL_MAXIMUM_PITCH - index
    const pitchClass = pitch % 12
    return Object.freeze({
      isBlack: [1, 3, 6, 8, 10].includes(pitchClass),
      label: pitchClass === 0 ? `C${Math.floor(pitch / 12) - 1}` : '',
      pitch,
    })
  }),
)

const timelineBars = computed(() => {
  const barCount = Math.ceil(props.timelineEndTick / props.barSpanTick)
  return Object.freeze(
    Array.from({ length: barCount }, (_, index) => {
      const startTick = parseTick(index * props.barSpanTick)
      const spanTick = Math.min(props.barSpanTick, props.timelineEndTick - startTick)
      return Object.freeze({
        number: index + 1,
        style: Object.freeze({
          inlineSize: `${(spanTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM}rem`,
        }) as StyleValue,
      })
    }),
  )
})

const timelineContentStyle = computed(
  (): StyleValue => ({
    inlineSize: `${
      (props.timelineEndTick / props.barSpanTick) * PROJECT_TIMELINE_BAR_INLINE_SIZE_REM
    }rem`,
  }),
)

const visibleNotes = computed(() =>
  Object.freeze(
    props.presentation.readModel.clips.flatMap(({ notes }) =>
      notes
        .filter(
          ({ note }) => note.pitch >= INITIAL_MINIMUM_PITCH && note.pitch <= INITIAL_MAXIMUM_PITCH,
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

const noteClipIdByNoteId = computed(() => {
  const clipIdByNoteId = new Map<NoteId, ClipId>()
  for (const { clip, notes } of props.presentation.readModel.clips) {
    for (const { note } of notes) clipIdByNoteId.set(note.id, clip.clipId)
  }
  return clipIdByNoteId
})

const clipWindows = computed(() =>
  Object.freeze(
    props.presentation.readModel.clips.flatMap((clipReadModel) => {
      const { clip } = clipReadModel
      if (clip.startTick >= props.timelineEndTick) return []
      const visibleEndTick = Math.min(clip.endTick, props.timelineEndTick)
      const color = clip.color ?? props.presentation.color ?? 'var(--sd-color-border-focus)'
      return [
        Object.freeze({
          clipReadModel,
          style: Object.freeze({
            '--project-piano-roll-track-clip-color': color,
            inlineSize: `${((visibleEndTick - clip.startTick) / props.timelineEndTick) * 100}%`,
            insetInlineStart: `${(clip.startTick / props.timelineEndTick) * 100}%`,
          }) as StyleValue,
        }),
      ]
    }),
  ),
)

const activeClipId = computed(() => props.presentation.readModel.activeClipId)
const sustainPedalLaneReadModel = computed(() =>
  createPianoRollTrackSustainPedalLaneReadModel({
    activeClipId: props.presentation.readModel.activeClipId,
    channel: pianoRollPreferences.sustainPedalChannel,
    snapshot: props.presentation.snapshot,
    trackId: props.presentation.trackId,
  }),
)
const midiChannelOptions = Object.freeze(Array.from({ length: 16 }, (_, channel) => channel))

const previewNoteStyle = computed((): StyleValue | null => {
  const currentViewport = viewport.value
  const preview = placementPreview.value
  if (currentViewport === null || preview === null) return null

  const rowHeight =
    currentViewport.heightCssPixel /
    (currentViewport.maximumPitch - currentViewport.minimumPitch + 1)
  const inset = Math.min(1, rowHeight / 5)
  const x = pianoRollTimelineTickToCssPixel(currentViewport, preview.placement.projectStartTick)
  const endX = pianoRollTimelineTickToCssPixel(
    currentViewport,
    parseTick(Math.min(currentViewport.visibleEndTick, preview.placement.projectEndTick)),
  )
  return {
    blockSize: `${Math.max(1, rowHeight - inset * 2)}px`,
    inlineSize: `${Math.max(1, endX - x)}px`,
    transform: `translate3d(${x}px, ${
      pianoRollMidiPitchToCssPixel(currentViewport, preview.pitch) + inset
    }px, 0)`,
  }
})

const previewClipStyle = computed((): StyleValue | null => {
  const preview = placementPreview.value?.placement
  if (preview === undefined || preview.status !== PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY) {
    return null
  }

  let startTick: Tick
  let endTick: Tick
  if (preview.action === PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP) {
    startTick = preview.clipStartTick
    endTick = parseTick(
      Math.min(props.timelineEndTick, preview.clipStartTick + preview.clipSpanTick),
    )
  } else if (preview.action === PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP) {
    const target = props.presentation.readModel.clips.find(
      ({ clip }) => clip.clipId === preview.clipId,
    )
    if (target === undefined) return null
    startTick = target.clip.endTick
    endTick = parseTick(Math.min(props.timelineEndTick, preview.projectEndTick))
  } else {
    return null
  }

  return {
    inlineSize: `${((endTick - startTick) / props.timelineEndTick) * 100}%`,
    insetInlineStart: `${(startTick / props.timelineEndTick) * 100}%`,
  }
})

const previewMessage = computed(() => {
  const placement = placementPreview.value?.placement
  if (placement === undefined) return null
  if (placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
    return placement.message
  }
  switch (placement.action) {
    case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP:
      return 'Add note to the Active Clip'
    case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP:
      return `Create a Clip at bar ${Math.floor(placement.clipStartTick / props.barSpanTick) + 1}`
    case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP:
      return 'Extend the Clip and add the note in one edit'
  }
  return null
})

const accessibleStatus = computed(() => {
  if (failureMessage.value !== null) return failureMessage.value
  const clipCount = props.presentation.readModel.clips.length
  const noteCount = visibleNotes.value.length
  return `${props.presentation.name}, Track time, ${clipCount} MIDI ${
    clipCount === 1 ? 'clip' : 'clips'
  }, ${noteCount} visible ${noteCount === 1 ? 'note' : 'notes'}`
})

function createDisplayGrid() {
  return createPianoRollGrid({
    barSpanTick: props.barSpanTick,
    beatSpanTick: parsePositiveTick(props.barSpanTick / props.timeSignatureNumerator),
    originTick: ZERO_TICK,
    subdivisionSpanTick: pianoRollPreferences.subdivisionSpanTick,
  })
}

function activateTool(tool: PianoRollTool): void {
  pianoRollPreferences.activateTool(tool)
}

function handleSustainPedalChannelChange(event: Event): void {
  pianoRollPreferences.selectSustainPedalChannel(
    parseMidiChannel(Number((event.currentTarget as HTMLSelectElement).value)),
  )
}

function focusSurface(): void {
  surfaceElement.value?.focus({ preventScroll: true })
}

function reportSustainPedalFailure(cause: unknown): void {
  const message = describeCause(cause, 'The Sustain Pedal Lane could not complete the interaction.')
  failureMessage.value = message
  if (
    cause instanceof ProjectMidiSustainPedalError &&
    ['target-clip-looped', 'timeline-tick-outside-clip', 'track-active-clip-required'].includes(
      cause.code,
    )
  ) {
    toasts.warning('Sustain Pedal placement needs attention', message)
    return
  }
  toasts.danger('Sustain Pedal event could not be placed', message)
}

function handleSustainPedalPlacement(placement: {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly modelRevision: ModelRevision
  readonly timelineTick: Tick
  readonly value: MidiControlValue
}): void {
  try {
    projectMidiSustainPedal.placeOnTrack({
      activeClipId: placement.activeClipId,
      baseRevision: placement.modelRevision,
      channel: placement.channel,
      projectTick: placement.timelineTick,
      trackId: props.presentation.trackId,
      value: placement.value,
    })
    failureMessage.value = null
  } catch (cause) {
    reportSustainPedalFailure(cause)
  }
}

function readThemeColor(style: CSSStyleDeclaration, token: string): string {
  return style.getPropertyValue(token).trim()
}

function createThemeSnapshot(): {
  readonly grid: PianoRollGridCanvasTheme
  readonly noteBorderColor: string
  readonly noteFillColor: string
  readonly selectedBorderColor: string
  readonly selectedGlowColor: string
} {
  const element = surfaceElement.value
  if (element === null) throw new Error('Track Piano Roll surface is not mounted')
  const style = getComputedStyle(element)
  return Object.freeze({
    grid: Object.freeze({
      background: readThemeColor(style, '--sd-color-surface-canvas'),
      blackPitchRow: readThemeColor(style, '--sd-editor-pitch-row-black'),
      gridBar: readThemeColor(style, '--sd-editor-grid-bar'),
      gridBeat: readThemeColor(style, '--sd-editor-grid-beat'),
      gridSubdivision: readThemeColor(style, '--sd-editor-grid-subdivision'),
      pitchRowBorder: readThemeColor(style, '--sd-editor-pitch-row-border'),
      whitePitchRow: readThemeColor(style, '--sd-editor-pitch-row-white'),
    }),
    noteBorderColor: readThemeColor(style, '--sd-editor-note-border'),
    noteFillColor: props.presentation.color ?? readThemeColor(style, '--sd-color-border-focus'),
    selectedBorderColor: readThemeColor(style, '--sd-editor-note-selected-border'),
    selectedGlowColor: readThemeColor(style, '--sd-editor-note-selected-glow'),
  })
}

function render(): void {
  const host = canvasHost.value
  const currentGridRenderer = gridRenderer.value
  const currentNoteRenderer = noteRenderer.value
  if (
    host === null ||
    host.clientWidth <= 0 ||
    host.clientHeight <= 0 ||
    currentGridRenderer === null ||
    currentNoteRenderer === null
  ) {
    return
  }

  try {
    const nextViewport = createPianoRollTimelineViewport({
      heightCssPixel: host.clientHeight,
      maximumPitch: INITIAL_MAXIMUM_PITCH,
      minimumPitch: INITIAL_MINIMUM_PITCH,
      visibleSpanTick: props.timelineEndTick,
      visibleStartTick: ZERO_TICK,
      widthCssPixel: host.clientWidth,
    })
    const theme = createThemeSnapshot()
    currentGridRenderer.render({
      grid: createDisplayGrid(),
      theme: theme.grid,
      viewport: nextViewport,
    })
    currentNoteRenderer.render(
      createPianoRollNoteScene({
        notes: visibleNotes.value,
        selectedNoteIds: Object.freeze([]),
        style: {
          borderColor: theme.noteBorderColor,
          fillColor: theme.noteFillColor,
          opacity: props.presentation.muted ? 0.46 : 1,
          selectedBorderColor: theme.selectedBorderColor,
          selectedGlowColor: theme.selectedGlowColor,
        },
        viewport: nextViewport,
      }),
    )
    viewport.value = nextViewport
    failureMessage.value = null
  } catch (cause) {
    failureMessage.value = describeCause(cause, 'The Track Piano Roll could not be rendered.')
  }
}

function describeCause(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.trim().length > 0 ? cause.message : fallback
}

function clampTrackStartTick(candidate: Tick): Tick {
  const lastInteriorTick = parseTick(props.timelineEndTick - 1)
  if (candidate <= lastInteriorTick) return candidate
  if (!pianoRollPreferences.snapEnabled) return lastInteriorTick
  const subdivision = pianoRollPreferences.subdivisionSpanTick
  return parseTick(Math.floor(lastInteriorTick / subdivision) * subdivision)
}

function resolvePlacementAt(xCssPixel: number, yCssPixel: number): TrackPlacementPreview | null {
  const currentViewport = viewport.value
  if (currentViewport === null) return null
  if (
    xCssPixel < 0 ||
    xCssPixel > currentViewport.widthCssPixel ||
    yCssPixel < 0 ||
    yCssPixel >= currentViewport.heightCssPixel
  ) {
    return null
  }

  const projectStartTick = clampTrackStartTick(
    resolveTimelineGridTick({
      grid: createDisplayGrid(),
      snapEnabled: pianoRollPreferences.snapEnabled,
      snapMode: TIMELINE_GRID_SNAP_MODE.FLOOR,
      tickPosition: pianoRollCssPixelToTimelineTickPosition(currentViewport, xCssPixel),
    }),
  )
  return Object.freeze({
    pitch: pianoRollCssPixelToMidiPitch(currentViewport, yCssPixel),
    placement: resolvePianoRollTrackNotePlacement({
      barSpanTick: props.barSpanTick,
      noteDurationTick: pianoRollPreferences.subdivisionSpanTick,
      projectStartTick,
      readModel: props.presentation.readModel,
    }),
  })
}

function localPoint(event: PointerEvent): {
  readonly xCssPixel: number
  readonly yCssPixel: number
} | null {
  const host = canvasHost.value
  if (host === null) return null
  const bounds = host.getBoundingClientRect()
  return {
    xCssPixel: event.clientX - bounds.left,
    yCssPixel: event.clientY - bounds.top,
  }
}

function handleHover(event: PointerEvent): void {
  if (pianoRollPreferences.activeTool !== PIANO_ROLL_TOOL.PENCIL) {
    placementPreview.value = null
    return
  }
  const host = canvasHost.value
  const point = localPoint(event)
  if (host === null || point === null || resolvePianoRollDomNoteHit(event, host) !== null) {
    placementPreview.value = null
    return
  }
  placementPreview.value = resolvePlacementAt(point.xCssPixel, point.yCssPixel)
}

function activateClip(clipId: ClipId): void {
  if (!props.presentation.readModel.clips.some(({ clip }) => clip.clipId === clipId)) {
    return
  }
  workbenchSelection.selectClip(props.presentation.trackId, clipId)
}

function handleActiveClipChange(event: Event): void {
  const value = (event.currentTarget as HTMLSelectElement).value
  if (value.length === 0) {
    workbenchSelection.clearClipSelection()
    return
  }
  const target = props.presentation.readModel.clips.find(({ clip }) => clip.clipId === value)
  if (target !== undefined) activateClip(target.clip.clipId)
}

function handlePointerInput(input: PianoRollPointerInput): void {
  if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.BEGIN) {
    surfaceElement.value?.focus({ preventScroll: true })
    return
  }
  if (input.phase === PIANO_ROLL_POINTER_INPUT_PHASE.CANCEL) {
    placementPreview.value = null
    return
  }
  if (input.phase !== PIANO_ROLL_POINTER_INPUT_PHASE.END || input.hasExceededDragThreshold) {
    return
  }

  if (input.hit !== null) {
    const clipId = noteClipIdByNoteId.value.get(input.hit.noteId)
    if (clipId !== undefined) activateClip(clipId)
    placementPreview.value = null
    return
  }
  if (pianoRollPreferences.activeTool !== PIANO_ROLL_TOOL.PENCIL) return

  const preview = resolvePlacementAt(input.originPosition.xCssPixel, input.originPosition.yCssPixel)
  placementPreview.value = preview
  if (preview === null) return
  if (preview.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
    failureMessage.value = preview.placement.message
    toasts.warning('MIDI note placement needs attention', preview.placement.message)
    return
  }

  try {
    const result = projectMidiNotes.placeMidiNoteOnTrack({
      activeClipId: props.presentation.readModel.activeClipId,
      barSpanTick: props.barSpanTick,
      baseRevision: props.presentation.readModel.modelRevision,
      noteDurationTick: preview.placement.noteDurationTick,
      pitch: preview.pitch,
      projectStartTick: preview.placement.projectStartTick,
      trackId: props.presentation.trackId,
    })
    activateClip(result.clipId)
    placementPreview.value = null
    failureMessage.value = null
  } catch (cause) {
    const message = describeCause(
      cause,
      'The Project rejected the Track MIDI Note placement. Please try again.',
    )
    failureMessage.value = message
    toasts.danger('MIDI note could not be placed', message)
  }
}

function setScrollLeft(nextScrollLeft: number): void {
  const element = scrollViewport.value
  if (element === null) return

  const maximumScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth)
  element.scrollLeft = Math.min(maximumScrollLeft, Math.max(0, nextScrollLeft))
  // Consume the ensuing native scroll event as this page jump, not as user navigation.
  observedScrollLeft = element.scrollLeft
}

function followCurrentPlaybackPosition(): void {
  const element = scrollViewport.value
  if (element === null || !isTimelineFollowActive.value) return

  setScrollLeft(
    resolvePagedFollowScrollLeft({
      clientWidth: element.clientWidth,
      positionRatio: timelinePositionRatio(
        currentPlaybackPositionTick.value,
        props.timelineEndTick,
      ),
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
    }),
  )
}

function suspendTimelineFollow(): void {
  if (isCurrentProjectPlaying.value) isTimelineFollowSuspended.value = true
}

function toggleTimelineFollow(): void {
  if (!isCurrentProjectPlaying.value) return

  isTimelineFollowSuspended.value = !isTimelineFollowSuspended.value
  if (!isTimelineFollowSuspended.value) void nextTick(followCurrentPlaybackPosition)
}

function isFollowControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('.project-piano-roll-track__follow-control') !== null
  )
}

function handleTimelinePointerDown(event: PointerEvent): void {
  if (!isFollowControlTarget(event.target)) suspendTimelineFollow()
}

function handleTimelineKeydown(event: KeyboardEvent): void {
  if (!isFollowControlTarget(event.target) && TIMELINE_INTERACTION_KEYS.has(event.key)) {
    suspendTimelineFollow()
  }
}

function handleTimelineWheel(event: WheelEvent): void {
  if (event.deltaX !== 0 || (event.shiftKey && event.deltaY !== 0)) suspendTimelineFollow()
}

function handleScroll(event: Event): void {
  placementPreview.value = null
  const element = event.currentTarget as HTMLElement
  if (element.scrollLeft === observedScrollLeft) return

  observedScrollLeft = element.scrollLeft
  suspendTimelineFollow()
}

watchEffect(render)

watch(
  isCurrentProjectPlaying,
  (isPlaying, wasPlaying) => {
    if (!isPlaying || wasPlaying) return

    isTimelineFollowSuspended.value = false
    void nextTick(followCurrentPlaybackPosition)
  },
  { immediate: true },
)

watch(currentPlaybackPositionTick, followCurrentPlaybackPosition, { flush: 'post' })

watch(
  () => props.timelineEndTick,
  () => void nextTick(followCurrentPlaybackPosition),
)

onMounted(() => {
  const grid = gridCanvas.value
  const notes = noteHost.value
  const host = canvasHost.value
  if (grid === null || notes === null || host === null) return

  try {
    gridRenderer.value = createPianoRollGridCanvasRenderer({ canvas: grid })
    noteRenderer.value = createProjectPianoRollNoteRenderer({ container: notes })
    pointerInputAdapter = createPianoRollPointerInputAdapter({
      observer: {
        onError: (failure) => {
          failureMessage.value = describeCause(
            failure.cause,
            'The Track Piano Roll pointer input failed.',
          )
        },
        onInput: handlePointerInput,
      },
      surface: host,
    })
  } catch (cause) {
    failureMessage.value = describeCause(cause, 'The Track Piano Roll could not be composed.')
    return
  }

  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(render)
    resizeObserver.observe(host)
  }
  render()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  pointerInputAdapter?.dispose()
  pointerInputAdapter = null
  gridRenderer.value?.dispose()
  gridRenderer.value = null
  noteRenderer.value?.dispose()
  noteRenderer.value = null
})
</script>

<template>
  <section
    ref="surfaceElement"
    class="project-piano-roll-track"
    role="region"
    :aria-label="`Track Piano Roll for ${props.presentation.name}`"
    :data-placement-status="placementPreview?.placement.status ?? 'idle'"
    :data-snap-enabled="pianoRollPreferences.snapEnabled"
    :data-tool="pianoRollPreferences.activeTool"
    tabindex="0"
  >
    <header class="project-piano-roll-track__toolbar" aria-label="Piano Roll controls">
      <div class="project-piano-roll-track__tool-group" role="group" aria-label="Editing tool">
        <UiIconButton
          :icon="PenIcon"
          label="Pencil tool"
          :pressed="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.PENCIL"
          size="small"
          @click="activateTool(PIANO_ROLL_TOOL.PENCIL)"
        />
        <UiIconButton
          :icon="CursorIcon"
          label="Cursor tool"
          :pressed="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.CURSOR"
          size="small"
          @click="activateTool(PIANO_ROLL_TOOL.CURSOR)"
        />
      </div>
      <span class="project-piano-roll-track__toolbar-divider" aria-hidden="true"></span>
      <div class="project-piano-roll-track__snap-control">
        <UiIconButton
          :icon="GridIcon"
          :label="`Snap to ${pianoRollPreferences.gridPreset} grid — ${
            pianoRollPreferences.snapEnabled ? 'on' : 'off'
          }`"
          :pressed="pianoRollPreferences.snapEnabled"
          size="small"
          @click="pianoRollPreferences.toggleSnap()"
        />
        <span aria-hidden="true">{{ pianoRollPreferences.gridPreset }}</span>
      </div>
      <span class="project-piano-roll-track__scope-label">TRACK TIME</span>
      <UiIconButton
        class="project-piano-roll-track__follow-control"
        :disabled="!isCurrentProjectPlaying"
        :icon="TargetArrowIcon"
        :label="timelineFollowLabel"
        :pressed="isTimelineFollowActive"
        size="small"
        @click="toggleTimelineFollow"
      />
      <label class="project-piano-roll-track__active-clip">
        <span>Active Clip</span>
        <select :value="activeClipId ?? ''" @change="handleActiveClipChange">
          <option value="">None</option>
          <option
            v-for="{ clip } in props.presentation.readModel.clips"
            :key="clip.clipId"
            :value="clip.clipId"
          >
            {{ clip.name
            }}{{ clip.status === PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED ? ' (looped)' : '' }}
          </option>
        </select>
      </label>
      <label class="project-piano-roll-track__channel-control">
        <span>CC64 Ch</span>
        <select
          :value="pianoRollPreferences.sustainPedalChannel"
          aria-label="Sustain Pedal MIDI Channel"
          @change="handleSustainPedalChannelChange"
        >
          <option v-for="channel in midiChannelOptions" :key="channel" :value="channel">
            {{ channel + 1 }}
          </option>
        </select>
      </label>
      <span
        v-if="previewMessage"
        class="project-piano-roll-track__preview-message"
        :data-blocked="
          placementPreview?.placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED
        "
      >
        {{ previewMessage }}
      </span>
    </header>

    <div class="project-piano-roll-track__left-stack">
      <div class="project-piano-roll-track__ruler-corner" aria-hidden="true">PITCH</div>
      <div class="project-piano-roll-track__keyboard" aria-label="Piano keyboard">
        <div v-for="key in pianoKeys" :key="key.pitch" class="project-piano-roll-track__key-row">
          <span :class="{ 'project-piano-roll-track__key--black': key.isBlack }">
            {{ key.label }}
          </span>
        </div>
      </div>
      <div class="project-piano-roll-track__lane-label" aria-hidden="true">
        <strong>CC64</strong>
        <span>127</span>
        <span>64</span>
        <span>0</span>
      </div>
    </div>

    <div
      ref="scrollViewport"
      class="project-piano-roll-track__scroll-viewport"
      @keydown.capture="handleTimelineKeydown"
      @pointerdown.capture="handleTimelinePointerDown"
      @scroll.passive="handleScroll"
      @wheel.passive="handleTimelineWheel"
    >
      <div class="project-piano-roll-track__timeline-content" :style="timelineContentStyle">
        <ol class="project-piano-roll-track__ruler" aria-label="Track timeline bars">
          <li v-for="bar in timelineBars" :key="bar.number" :style="bar.style">
            {{ bar.number }}
          </li>
        </ol>
        <div
          ref="canvasHost"
          class="project-piano-roll-track__canvas-host"
          @pointerleave="placementPreview = null"
          @pointermove="handleHover"
        >
          <canvas ref="gridCanvas" aria-hidden="true"></canvas>
          <div ref="noteHost" class="project-piano-roll-track__note-host"></div>
          <div class="project-piano-roll-track__clip-windows" aria-label="MIDI Clip windows">
            <button
              v-for="window in clipWindows"
              :key="window.clipReadModel.clip.clipId"
              type="button"
              :aria-label="`Use ${window.clipReadModel.clip.name} as the Active Clip`"
              :aria-pressed="activeClipId === window.clipReadModel.clip.clipId"
              :data-active="activeClipId === window.clipReadModel.clip.clipId"
              :data-status="window.clipReadModel.clip.status"
              :style="window.style"
              @click.stop="activateClip(window.clipReadModel.clip.clipId)"
            >
              <span>{{ window.clipReadModel.clip.name }}</span>
            </button>
          </div>
          <div
            v-if="previewClipStyle"
            class="project-piano-roll-track__clip-preview"
            :style="previewClipStyle"
            aria-hidden="true"
          ></div>
          <div
            v-if="previewNoteStyle"
            class="project-piano-roll-track__note-preview"
            :class="{
              'project-piano-roll-track__note-preview--blocked':
                placementPreview?.placement.status ===
                PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
            }"
            :style="previewNoteStyle"
            aria-hidden="true"
          ></div>
        </div>
        <PianoRollSustainPedalLane
          :grid="createDisplayGrid()"
          :label="`Sustain Pedal lane for ${props.presentation.name}`"
          :pencil-enabled="pianoRollPreferences.activeTool === PIANO_ROLL_TOOL.PENCIL"
          :read-model="sustainPedalLaneReadModel"
          :snap-enabled="pianoRollPreferences.snapEnabled"
          :visible-span-tick="props.timelineEndTick"
          :visible-start-tick="ZERO_TICK"
          @failure="reportSustainPedalFailure"
          @placement="handleSustainPedalPlacement"
          @request-focus="focusSurface"
        />
        <TrackPlayhead
          :bar-span-tick="props.barSpanTick"
          :project-id="props.presentation.projectId"
          :timeline-end-tick="props.timelineEndTick"
        />
      </div>
    </div>

    <p class="project-piano-roll-track__accessible-status" aria-live="polite">
      {{ accessibleStatus }}
    </p>
    <ul class="project-piano-roll-track__accessible-status">
      <li
        v-for="clipReadModel in props.presentation.readModel.clips"
        :key="clipReadModel.clip.clipId"
      >
        {{ clipReadModel.clip.name }}, starts at {{ clipReadModel.clip.startTick }} ticks, ends at
        {{ clipReadModel.clip.endTick }} ticks, {{ clipReadModel.notes.length }} visible notes
      </li>
    </ul>
  </section>
</template>

<style scoped>
.project-piano-roll-track {
  --project-piano-roll-track-keyboard-width: 4.5rem;
  --project-piano-roll-track-ruler-height: 1.625rem;
  --project-piano-roll-track-lane-height: 5.5rem;
  --project-piano-roll-track-toolbar-height: 2.25rem;
  position: relative;
  display: grid;
  min-inline-size: 0;
  min-block-size: 0;
  block-size: 100%;
  grid-template-columns: var(--project-piano-roll-track-keyboard-width) minmax(0, 1fr);
  grid-template-rows: var(--project-piano-roll-track-toolbar-height) minmax(0, 1fr);
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll-track:focus-visible {
  outline: 2px solid var(--sd-color-border-focus);
  outline-offset: -2px;
}

.project-piano-roll-track__toolbar {
  display: flex;
  min-inline-size: 0;
  align-items: center;
  grid-column: 1 / -1;
  gap: var(--sd-space-2);
  padding-inline: var(--sd-space-2);
  overflow: hidden;
  border-bottom: 1px solid var(--sd-color-border-default);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__tool-group,
.project-piano-roll-track__snap-control,
.project-piano-roll-track__active-clip,
.project-piano-roll-track__channel-control {
  display: flex;
  align-items: center;
  gap: var(--sd-space-1);
}

.project-piano-roll-track__toolbar-divider {
  inline-size: 1px;
  block-size: 1rem;
  background: var(--sd-color-border-default);
}

.project-piano-roll-track__snap-control > span,
.project-piano-roll-track__scope-label,
.project-piano-roll-track__active-clip > span,
.project-piano-roll-track__channel-control > span,
.project-piano-roll-track__preview-message {
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll-track__scope-label {
  padding: var(--sd-space-1) var(--sd-space-2);
  border: 1px solid var(--sd-color-border-subtle);
  border-radius: var(--sd-radius-pill);
  letter-spacing: 0.08em;
}

.project-piano-roll-track__active-clip select,
.project-piano-roll-track__channel-control select {
  max-inline-size: 10rem;
  block-size: var(--sd-control-height-sm);
  padding-inline: var(--sd-space-2);
  border: 1px solid var(--sd-color-border-default);
  border-radius: var(--sd-radius-sm);
  color: var(--sd-color-text-secondary);
  background: var(--sd-color-surface-sunken);
}

.project-piano-roll-track__preview-message {
  min-inline-size: 0;
  margin-inline-start: auto;
  overflow: hidden;
  color: var(--sd-color-text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-piano-roll-track__preview-message[data-blocked='true'] {
  color: var(--sd-color-state-danger);
}

.project-piano-roll-track__left-stack {
  display: grid;
  min-block-size: 0;
  grid-template-rows:
    var(--project-piano-roll-track-ruler-height)
    minmax(0, 1fr)
    var(--project-piano-roll-track-lane-height);
  border-inline-end: 1px solid var(--sd-color-border-default);
}

.project-piano-roll-track__ruler-corner {
  display: flex;
  align-items: center;
  padding-inline: var(--sd-space-2);
  border-bottom: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.08em;
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__keyboard {
  display: grid;
  min-block-size: 0;
  grid-template-rows: repeat(25, minmax(0, 1fr));
  overflow: hidden;
  background: var(--sd-editor-key-white);
}

.project-piano-roll-track__lane-label {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-block-size: 0;
  padding: var(--sd-space-1) var(--sd-space-2);
  border-block-start: 1px solid var(--sd-color-border-default);
  color: var(--sd-color-text-muted);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__lane-label strong {
  color: var(--sd-color-text-secondary);
  font-size: var(--sd-font-size-xs);
  letter-spacing: 0.06em;
}

.project-piano-roll-track__lane-label span {
  align-self: flex-end;
}

.project-piano-roll-track__key-row {
  position: relative;
  min-block-size: 0;
  border-bottom: 1px solid var(--sd-color-border-strong);
  color: var(--sd-color-text-inverse);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll-track__key-row > span {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-inline-end: var(--sd-space-2);
}

.project-piano-roll-track__key-row > .project-piano-roll-track__key--black {
  z-index: 1;
  inline-size: 68%;
  justify-content: flex-start;
  border-radius: 0 var(--sd-radius-xs) var(--sd-radius-xs) 0;
  color: var(--sd-color-text-secondary);
  background: var(--sd-editor-key-black);
}

.project-piano-roll-track__scroll-viewport {
  min-inline-size: 0;
  min-block-size: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-inline: contain;
  scrollbar-gutter: stable;
}

.project-piano-roll-track__timeline-content {
  position: relative;
  display: grid;
  min-inline-size: 100%;
  block-size: 100%;
  grid-template-rows:
    var(--project-piano-roll-track-ruler-height)
    minmax(0, 1fr)
    var(--project-piano-roll-track-lane-height);
}

.project-piano-roll-track__ruler {
  display: flex;
  min-inline-size: 0;
  block-size: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--sd-color-border-default);
  list-style: none;
  background: var(--sd-color-surface-panel);
}

.project-piano-roll-track__ruler li {
  box-sizing: border-box;
  flex: 0 0 auto;
  padding: var(--sd-space-1) var(--sd-space-2);
  border-inline-start: 1px solid var(--sd-editor-grid-bar);
  color: var(--sd-color-text-secondary);
  font-family: var(--sd-font-family-numeric);
  font-size: var(--sd-font-size-xs);
}

.project-piano-roll-track__canvas-host {
  position: relative;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  background: var(--sd-color-surface-canvas);
}

.project-piano-roll-track[data-tool='pencil'] .project-piano-roll-track__canvas-host {
  cursor: crosshair;
}

.project-piano-roll-track[data-tool='cursor']
  .project-piano-roll-track__note-host
  :deep(.sd-piano-roll-dom-note) {
  cursor: pointer;
}

.project-piano-roll-track__canvas-host > canvas,
.project-piano-roll-track__note-host {
  position: absolute;
  inset: 0;
  inline-size: 100%;
  block-size: 100%;
}

.project-piano-roll-track__canvas-host > canvas {
  display: block;
}

.project-piano-roll-track__note-host {
  z-index: 1;
  overflow: hidden;
}

.project-piano-roll-track__note-host :deep(.sd-piano-roll-dom-note) {
  border-radius: var(--sd-radius-xs);
  will-change: transform;
}

.project-piano-roll-track__note-host :deep(.sd-piano-roll-dom-note__resize-handle) {
  display: none;
}

.project-piano-roll-track__clip-windows,
.project-piano-roll-track__clip-preview {
  position: absolute;
  z-index: 2;
  inset-block-start: var(--sd-space-1);
  inset-inline: 0;
  block-size: 1.25rem;
  pointer-events: none;
}

.project-piano-roll-track__clip-windows > button {
  position: absolute;
  inset-block: 0;
  min-inline-size: 2px;
  padding-inline: var(--sd-space-1);
  overflow: hidden;
  border: 1px solid var(--project-piano-roll-track-clip-color);
  border-radius: var(--sd-radius-xs);
  color: var(--sd-color-text-primary);
  font-size: var(--sd-font-size-xs);
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: color-mix(
    in srgb,
    var(--project-piano-roll-track-clip-color) 32%,
    var(--sd-color-surface-panel)
  );
  opacity: 0.78;
}

.project-piano-roll-track[data-tool='cursor'] .project-piano-roll-track__clip-windows > button {
  pointer-events: auto;
  cursor: pointer;
}

.project-piano-roll-track__clip-windows > button[data-active='true'] {
  z-index: 1;
  border-width: 2px;
  opacity: 1;
  box-shadow: 0 0 0 1px var(--sd-color-surface-canvas);
}

.project-piano-roll-track__clip-windows > button[data-status='unsupported'] {
  border-style: dashed;
  opacity: 0.58;
}

.project-piano-roll-track__clip-preview {
  border: 1px dashed var(--sd-color-border-focus);
  background: color-mix(in srgb, var(--sd-color-border-focus) 18%, transparent);
}

.project-piano-roll-track__note-preview {
  position: absolute;
  z-index: 3;
  inset-block-start: 0;
  inset-inline-start: 0;
  box-sizing: border-box;
  pointer-events: none;
  border: 1px dashed var(--sd-color-border-focus);
  border-radius: var(--sd-radius-xs);
  background: color-mix(in srgb, var(--sd-color-border-focus) 45%, transparent);
}

.project-piano-roll-track__note-preview--blocked {
  border-color: var(--sd-color-state-danger);
  background: color-mix(in srgb, var(--sd-color-state-danger) 35%, transparent);
}

.project-piano-roll-track__accessible-status {
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
