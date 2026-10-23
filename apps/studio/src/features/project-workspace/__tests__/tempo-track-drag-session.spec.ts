import {
  createMoveTempoEventCommand,
  createRemoveTempoEventCommand,
  createReplaceTempoEventBpmCommand,
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type ProjectSubscriptionObserver,
} from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createTempoTrackDragSession,
  type TempoTrackDragSession,
} from '@/features/project-workspace/tempo-track/interaction/tempo-track-drag-session'
import type {
  TempoTrackDragConfiguration,
  TempoTrackDragState,
  TempoTrackPointerInput,
} from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import { createTempoTrackTestSession } from './support/tempo-track-test-support'

const INITIAL = createTempoEventRecord({
  id: parseTempoEventId('tempo-initial'),
  tick: parseTick(0),
  bpm: parseTempoBpm(120),
})
const LATER = createTempoEventRecord({
  id: parseTempoEventId('tempo-later'),
  tick: parseTick(960),
  bpm: parseTempoBpm(100),
})
const MODIFIERS = Object.freeze({ alt: false, control: false, meta: false, shift: false })

/** Feeds one input; a failure the session reports is rethrown, as the drag hook reports it. */
function pointer(
  drag: TempoTrackDragSession,
  event: TempoTrackPointerInput,
  configuration?: TempoTrackDragConfiguration,
) {
  const { failure, intent } = drag.handlePointerInput(event, configuration)
  if (failure !== null) throw failure
  return intent
}

function fixture(bpm = LATER.bpm, observer = vi.fn<(state: TempoTrackDragState) => void>()) {
  const project = createTempoTrackTestSession([INITIAL, { ...LATER, bpm }])
  const drag = createTempoTrackDragSession()
  drag.subscribe(observer)
  const configuration: TempoTrackDragConfiguration = {
    session: project,
    projectedRevision: project.modelRevision,
    mapping: {
      width: 1_000,
      height: 100,
      scale: { minimumBpm: 40, maximumBpm: 240 },
      timelineEndTick: parseTick(3_840),
    },
  }
  const captureId = Symbol('capture')
  function input(
    phase: TempoTrackPointerInput['phase'],
    x = 250,
    y = 60,
    overrides: Partial<TempoTrackPointerInput> = {},
  ): TempoTrackPointerInput {
    return {
      captureId,
      phase,
      pointerId: 7,
      pointerType: 'mouse',
      hit: { tempoEventId: LATER.id },
      originPosition: { xCssPixel: 250, yCssPixel: 60 },
      position: { xCssPixel: x, yCssPixel: y },
      originModifiers: MODIFIERS,
      modifiers: MODIFIERS,
      hasExceededDragThreshold: Math.hypot(x - 250, y - 60) >= 4,
      ...overrides,
    }
  }
  return { project, drag, configuration, input, observer }
}

describe('TempoTrackDragSession', () => {
  it('keeps click tolerance, freezes the dominant axis and samples the final Pointer position', () => {
    const { drag, configuration, input, project } = fixture()
    pointer(drag, input('begin'), configuration)
    pointer(drag, input('update', 253, 63))
    expect(drag.state.preview?.axis).toBeNull()
    pointer(drag, input('update', 300, 61))
    pointer(drag, input('update', 400, 10))
    expect(drag.state.preview).toMatchObject({ axis: 'tick', tick: 1_536, bpm: 100 })
    const intent = pointer(drag, input('end', 500, 10))!
    expect(intent).toMatchObject({
      axis: 'tick',
      tick: 1_920,
      target: { expectedSession: project, baseRevision: project.modelRevision },
    })
    expect(drag.claimCompletion(intent.interactionId)).toBe(true)
    expect(drag.claimCompletion(intent.interactionId)).toBe(false)
    expect(pointer(drag, input('end', 800, 10))).toBeNull()
    drag.finish(intent.interactionId)
    expect(drag.state.preview).toBeNull()
  })

  it('does not let a blocked initial-point horizontal drag turn into BPM editing', () => {
    const { drag, configuration, input } = fixture()
    const hit = { tempoEventId: INITIAL.id }
    pointer(drag, input('begin', 250, 60, { hit }), configuration)
    pointer(drag, input('update', 350, 61, { hit }))
    pointer(drag, input('update', 250, 20, { hit }))
    expect(drag.state.preview).toMatchObject({ axis: 'blocked-tick', tick: 0, bpm: 120 })
    expect(pointer(drag, input('end', 250, 20, { hit }))).toBeNull()
    expect(drag.state.preview).toBeNull()
  })

  it('allows BPM editing of the initial point without changing its Tick', () => {
    const { drag, configuration, input } = fixture()
    const hit = { tempoEventId: INITIAL.id }
    pointer(drag, input('begin', 250, 60, { hit }), configuration)
    expect(pointer(drag, input('end', 251, 50, { hit }))).toMatchObject({
      axis: 'bpm',
      bpm: 140,
    })
    expect(drag.state.preview?.tick).toBe(0)
  })

  it.each(['tick', 'bpm'] as const)(
    'ends %s drags returning to the origin without rounding imported precision or committing',
    (axis) => {
      const preciseBpm = parseTempoBpm(143.999_884_800_092_16)
      const { drag, configuration, input, project } = fixture(preciseBpm)
      const revision = project.modelRevision
      pointer(drag, input('begin'), configuration)
      pointer(drag, input('update', axis === 'tick' ? 500 : 250, axis === 'bpm' ? 40 : 60))
      expect(pointer(drag, input('end'))).toBeNull()
      expect(drag.state.preview).toBeNull()
      expect(project.modelRevision).toBe(revision)
      expect(project.getSnapshot().tempoEvents[1]?.bpm).toBe(preciseBpm)
    },
  )

  it('freezes the original coordinate mapping and grab offset', () => {
    const { drag, configuration, input } = fixture()
    const mapping = {
      width: 1_000,
      height: 100,
      scale: { minimumBpm: 40, maximumBpm: 240 },
      timelineEndTick: parseTick(3_840),
    }
    const origin = { xCssPixel: 260, yCssPixel: 65 }
    pointer(drag, input('begin', 260, 65, { originPosition: origin }), {
      ...configuration,
      mapping,
    })
    mapping.width = 2_000
    mapping.scale.maximumBpm = 1_000
    origin.xCssPixel = 500
    const intent = pointer(drag, input('end', 510, 66))
    expect(intent).toMatchObject({ axis: 'tick', tick: 1_920 })
  })

  it.each(['update', 'end', 'claim'] as const)(
    'rejects external edits before their microtask notification at %s',
    (boundary) => {
      const { drag, configuration, input, project } = fixture()
      pointer(drag, input('begin'), configuration)
      const intent = boundary === 'claim' ? pointer(drag, input('end', 500)) : null
      project.execute(
        createReplaceTempoEventBpmCommand({
          baseRevision: project.modelRevision,
          tempoEventId: INITIAL.id,
          bpm: parseTempoBpm(130),
        }),
      )
      const refused =
        intent !== null
          ? !drag.claimCompletion(intent.interactionId)
          : pointer(drag, input(boundary === 'update' ? 'update' : 'end', 500)) === null
      expect(refused).toBe(true)
      expect(drag.state.preview).toBeNull()
      expect(project.getSnapshot().tempoEvents[1]?.tick).toBe(960)
    },
  )

  it('cancels on external commit delivery even without another Pointer input', async () => {
    const { drag, configuration, input, project } = fixture()
    pointer(drag, input('begin'), configuration)
    project.execute(
      createRemoveTempoEventCommand({
        baseRevision: project.modelRevision,
        tempoEventId: LATER.id,
      }),
    )
    await Promise.resolve()
    expect(drag.state.preview).toBeNull()
    expect(pointer(drag, input('end', 500))).toBeNull()
  })

  it.each(['commit-first', 'projection-first'] as const)(
    'hands the preview to facts with %s delivery',
    async (order) => {
      const { drag, configuration, input, project } = fixture()
      pointer(drag, input('begin'), configuration)
      const intent = pointer(drag, input('end', 500))!
      expect(drag.claimCompletion(intent.interactionId)).toBe(true)
      project.execute(
        createMoveTempoEventCommand({
          baseRevision: intent.target.baseRevision,
          tempoEventId: LATER.id,
          tick: parseTick(1_920),
        }),
      )
      await Promise.resolve()
      expect(drag.state.preview?.tick).toBe(1_920)
      if (order === 'projection-first') drag.notifyAuthorityRevision(project.modelRevision)
      drag.resolveCommit({
        interactionId: intent.interactionId,
        commitRevision: project.modelRevision,
        authorityRevision: configuration.projectedRevision,
      })
      drag.finish(intent.interactionId)
      expect(drag.state.preview?.tick ?? null).toBe(order === 'commit-first' ? 1_920 : null)
      if (order === 'commit-first') drag.notifyAuthorityRevision(project.modelRevision)
      expect(drag.state.preview).toBeNull()
      expect(project.undo()?.modelRevision).toBe(project.modelRevision)
      expect(project.getSnapshot().tempoEvents[1]?.tick).toBe(960)
    },
  )

  it('isolates old captures, completions and subscription callbacks', () => {
    const { drag, configuration, input, project } = fixture()
    const delivery: ProjectSubscriptionObserver[] = []
    const subscribe = project.subscribe.bind(project)
    vi.spyOn(project, 'subscribe').mockImplementation((subscription, observer) => {
      delivery.push(observer)
      return subscribe(subscription, observer)
    })
    pointer(drag, input('begin'), configuration)
    const old = pointer(drag, input('end', 500))!
    drag.cancel()
    const captureId = Symbol('replacement-capture')
    pointer(drag, input('begin', 250, 60, { captureId }), configuration)
    const current = drag.state.interactionId
    delivery[0]!.onError({} as Parameters<ProjectSubscriptionObserver['onError']>[0])
    pointer(drag, input('end', 800))
    drag.resolveCommit({
      interactionId: old.interactionId,
      commitRevision: project.modelRevision,
      authorityRevision: project.modelRevision,
    })
    drag.finish(old.interactionId)
    expect(drag.claimCompletion(old.interactionId)).toBe(false)
    expect(drag.state.interactionId).toBe(current)
    expect(drag.state.preview?.tick).toBe(960)
    drag.dispose()
    expect(pointer(drag, input('end', 800, 60, { captureId }))).toBeNull()
    expect(drag.state.preview).toBeNull()
    drag.dispose()
  })

  it('replaces a pending handoff without letting its late acknowledgement close the new drag', () => {
    const { drag, configuration, input, project } = fixture()
    pointer(drag, input('begin'), configuration)
    const old = pointer(drag, input('end', 500))!
    drag.claimCompletion(old.interactionId)
    project.execute(
      createMoveTempoEventCommand({
        baseRevision: old.target.baseRevision,
        tempoEventId: LATER.id,
        tick: parseTick(1_920),
      }),
    )
    drag.resolveCommit({
      interactionId: old.interactionId,
      commitRevision: project.modelRevision,
      authorityRevision: configuration.projectedRevision,
    })
    const captureId = Symbol('next')
    pointer(drag, input('begin', 250, 60, { captureId }), {
      ...configuration,
      projectedRevision: project.modelRevision,
    })
    const current = drag.state.interactionId
    drag.resolveCommit({
      interactionId: old.interactionId,
      commitRevision: project.modelRevision,
      authorityRevision: project.modelRevision,
    })
    drag.finish(old.interactionId)
    expect(current).not.toBe(old.interactionId)
    expect(drag.state.interactionId).toBe(current)
    expect(drag.state.pointerId).toBe(7)
    drag.dispose()
  })

  it('refuses a Begin whose displayed facts have not caught up to the Session', () => {
    const { drag, configuration, input, project } = fixture()
    project.execute(
      createMoveTempoEventCommand({
        baseRevision: project.modelRevision,
        tempoEventId: LATER.id,
        tick: parseTick(1_920),
      }),
    )
    pointer(drag, input('begin'), configuration)
    expect(drag.state.preview).toBeNull()
  })

  it('closes unclaimed results when projection fails and can begin again', () => {
    const { drag, configuration, input, observer } = fixture()
    pointer(drag, input('begin'), configuration)
    observer.mockImplementationOnce(() => {
      throw new Error('Preview failed')
    })
    expect(() => pointer(drag, input('end', 500))).toThrow('Preview failed')
    expect(drag.state.preview).toBeNull()
    expect(pointer(drag, input('end', 500))).toBeNull()
    pointer(drag, input('begin'), configuration)
    expect(drag.state.pointerId).toBe(7)
    drag.dispose()
  })
})
