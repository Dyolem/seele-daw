import {
  createAddTempoEventCommand,
  createInitialProjectSession,
  createMoveTempoEventCommand,
  createReplaceTempoEventBpmCommand,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  type TempoEventRecord,
} from '@seele-daw/project-core'
import { shallowRef } from 'vue'
import { vi } from 'vitest'
import type { TempoEventActionContext } from '@/features/project-workspace/tempo-track/types/tempo-event-actions'
import { STUDIO_ACTION_COMPLETED } from '@/workbench/actions/studio-action'

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

export function createTempoTrackTestActions(
  events: readonly TempoEventRecord[],
  projectId?: string,
) {
  const session = shallowRef(createTempoTrackTestSession(events, projectId))
  const projectedRevision = shallowRef(session.value.modelRevision)
  const commitDrag = vi.fn<TempoEventActionContext['commitDrag']>((intent) => {
    if (session.value !== intent.target.expectedSession) throw new Error('Stale Tempo target')
    return session.value.execute(
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
  })
  const remove = vi.fn<TempoEventActionContext['removeTempoEvent']>(() => STUDIO_ACTION_COMPLETED)
  const context: TempoEventActionContext = {
    get session() {
      return session.value
    },
    get projectedRevision() {
      return projectedRevision.value
    },
    commitDrag,
    removeTempoEvent: remove,
  }
  return { context, session, projectedRevision, commitDrag, remove }
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
