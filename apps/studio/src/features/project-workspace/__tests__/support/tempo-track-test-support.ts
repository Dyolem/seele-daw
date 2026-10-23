import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddTempoEventCommand,
  createInitialProjectSession,
  createMoveTempoEventCommand,
  createReplaceTempoEventBpmCommand,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type TempoEventId,
  type TempoEventRecord,
} from '@seele-daw/project-core'
import { computed, shallowRef } from 'vue'
import { vi } from 'vitest'
import type { TempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import { createTempoTrackPreviewController } from '@/features/project-workspace/tempo-track/tempo-track-preview'
import {
  PROJECT_TEMPO_CONTROL_MODE,
  createProjectTempoControlPresentation,
} from '@/features/project-workspace/tempo/tempo-control'
import { STUDIO_ACTION_COMPLETED } from '@/workbench/actions/studio-action'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

export function createTempoTrackTestSession(
  events: readonly TempoEventRecord[],
  projectId = 'tempo-track-project',
) {
  const session = createInitialProjectSession({
    projectId: parseProjectId(projectId),
    projectName: 'Tempo interaction test',
    tempoEventId: events.find(({ tick }) => tick === 0)?.id ?? parseTempoEventId('initial-tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('initial-meter'),
  })
  for (const event of events) {
    session.execute(
      event.tick === 0
        ? createReplaceTempoEventBpmCommand({
            baseRevision: session.modelRevision,
            tempoEventId: event.id,
            bpm: event.bpm,
          })
        : createAddTempoEventCommand({
            baseRevision: session.modelRevision,
            tempoEventId: event.id,
            bpm: event.bpm,
            tick: event.tick,
          }),
    )
  }
  return session
}

/**
 * A tempo model whose state the test sets directly and whose commands only record calls, except
 * `commitDrag`, which executes on the test session.
 */
export function createTestTempoEditing(events: readonly TempoEventRecord[], projectId?: string) {
  const session = shallowRef(createTempoTrackTestSession(events, projectId))
  const projectedRevision = shallowRef(session.value.modelRevision)
  const shownEvents = shallowRef<readonly TempoEventRecord[]>(Object.freeze([...events]))
  const selectedEventId = shallowRef<TempoEventId | null>(null)
  const editingDisabled = shallowRef(false)
  const controller = createTempoTrackPreviewController()
  const preview = {
    ...controller,
    publishPreview: vi.fn<typeof controller.publishPreview>(controller.publishPreview),
  }
  const commitDrag = vi.fn<TempoEditing['commitDrag']>((intent) => {
    if (session.value !== intent.target.expectedSession) throw new Error('Stale Tempo target')
    const result = session.value.execute(
      intent.axis === 'tick'
        ? createMoveTempoEventCommand({
            baseRevision: intent.target.baseRevision,
            tempoEventId: intent.tempoEventId,
            tick: intent.tick,
          })
        : createReplaceTempoEventBpmCommand({
            baseRevision: intent.target.baseRevision,
            tempoEventId: intent.tempoEventId,
            bpm: intent.bpm,
          }),
    )
    return result.status === PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED ? result.commit : null
  })
  const spies = {
    beginEdit: vi.fn<TempoEditing['beginEdit']>(),
    commitFieldInput: vi.fn<TempoEditing['commitFieldInput']>(),
    select: vi.fn<TempoEditing['select']>(),
    add: vi.fn<TempoEditing['add']>(),
    move: vi.fn<TempoEditing['move']>(),
    commitBpmInput: vi.fn<TempoEditing['commitBpmInput']>(),
    remove: vi.fn<TempoEditing['remove']>(() => STUDIO_ACTION_COMPLETED),
    commitDrag,
  }
  const presentedEvents = computed(() => {
    const current = preview.preview.value
    if (current === null) return shownEvents.value
    return Object.freeze(
      shownEvents.value.map((tempoEvent) =>
        tempoEvent.id === current.tempoEventId
          ? Object.freeze({ ...tempoEvent, bpm: current.bpm, tick: current.tick })
          : tempoEvent,
      ),
    )
  })
  const field = computed(() =>
    shownEvents.value.length === 0
      ? Object.freeze({
          bpm: parseTempoBpm(120),
          displayBpm: '120',
          mode: PROJECT_TEMPO_CONTROL_MODE.SINGLE,
        })
      : createProjectTempoControlPresentation(
          shownEvents.value,
          0 as ProjectPlaybackVisualPosition['positionTick'],
        ),
  )
  const tempo: TempoEditing = {
    events: computed(() => shownEvents.value),
    presentedEvents,
    preview,
    selectedEventId,
    editingDisabled: computed(() => editingDisabled.value),
    field,
    fieldEditable: computed(
      () => field.value.mode === PROJECT_TEMPO_CONTROL_MODE.SINGLE && !editingDisabled.value,
    ),
    get session() {
      return session.value
    },
    get projectedRevision() {
      return projectedRevision.value
    },
    ...spies,
  }
  return {
    ...spies,
    tempo,
    preview,
    session,
    projectedRevision,
    events: shownEvents,
    selectedEventId,
    editingDisabled,
    /** Shows the session's current facts, as the page does after a commit. */
    project() {
      shownEvents.value = session.value.getSnapshot().tempoEvents
      projectedRevision.value = session.value.modelRevision
    },
  }
}

export function installTempoPointerCapture(surface: HTMLElement) {
  const captures = new Set<number>()
  const release = vi.fn<(pointerId: number) => void>((pointerId) => {
    captures.delete(pointerId)
  })
  Object.defineProperties(surface, {
    setPointerCapture: {
      configurable: true,
      value: vi.fn<(pointerId: number) => void>((pointerId) => {
        captures.add(pointerId)
      }),
    },
    releasePointerCapture: { configurable: true, value: release },
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => captures.has(pointerId),
    },
  })
  return { captures, release }
}

export function dispatchTempoPointer(
  target: Element,
  phase: string,
  { x = 350, y = 110, pointerId = 7 }: { x?: number; y?: number; pointerId?: number } = {},
) {
  const event = new MouseEvent(phase, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  })
  Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: pointerId } })
  target.dispatchEvent(event)
}

export function installTempoResizeObserver(failOnObserve = false) {
  const observers: TestResizeObserver[] = []
  class TestResizeObserver implements ResizeObserver {
    readonly disconnect = vi.fn<ResizeObserver['disconnect']>()
    readonly unobserve = vi.fn<ResizeObserver['unobserve']>()
    readonly observe = vi.fn<ResizeObserver['observe']>(() => {
      if (failOnObserve) throw new Error('Tempo viewport observation failed')
    })
    constructor(private readonly callback: ResizeObserverCallback) {
      observers.push(this)
    }
    deliver() {
      this.callback([], this)
    }
  }
  vi.stubGlobal('ResizeObserver', TestResizeObserver)
  return observers
}
