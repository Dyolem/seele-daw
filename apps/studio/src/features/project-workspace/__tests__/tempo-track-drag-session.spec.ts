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
import { TempoTrackDragSession } from '@/features/project-workspace/tempo-track/interaction/tempo-track-drag-session'
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

function fixture(bpm = LATER.bpm, observer = vi.fn<(state: TempoTrackDragState) => void>()) {
  const project = createTempoTrackTestSession([INITIAL, { ...LATER, bpm }])
  const drag = new TempoTrackDragSession(observer)
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
    drag.handlePointerInput(input('begin'), configuration)
    drag.handlePointerInput(input('update', 253, 63))
    expect(drag.state.preview?.axis).toBeNull()
    drag.handlePointerInput(input('update', 300, 61))
    drag.handlePointerInput(input('update', 400, 10))
    expect(drag.state.preview).toMatchObject({ axis: 'tick', tick: 1_536, bpm: 100 })
    const intent = drag.handlePointerInput(input('end', 500, 10))!
    expect(intent).toMatchObject({
      axis: 'tick',
      tick: 1_920,
      target: { expectedSession: project, baseRevision: project.modelRevision },
    })
    expect(drag.claimCompletion(intent.interactionId)).toBe(true)
    expect(drag.claimCompletion(intent.interactionId)).toBe(false)
    expect(drag.handlePointerInput(input('end', 800, 10))).toBeNull()
    drag.finish(intent.interactionId)
    expect(drag.state.preview).toBeNull()
  })

  it('does not let a blocked initial-point horizontal drag turn into BPM editing', () => {
    const { drag, configuration, input } = fixture()
    const hit = { tempoEventId: INITIAL.id }
    drag.handlePointerInput(input('begin', 250, 60, { hit }), configuration)
    drag.handlePointerInput(input('update', 350, 61, { hit }))
    drag.handlePointerInput(input('update', 250, 20, { hit }))
    expect(drag.state.preview).toMatchObject({ axis: 'blocked-tick', tick: 0, bpm: 120 })
    expect(drag.handlePointerInput(input('end', 250, 20, { hit }))).toBeNull()
    expect(drag.state.preview).toBeNull()
  })

  it('allows BPM editing of the initial point without changing its Tick', () => {
    const { drag, configuration, input } = fixture()
    const hit = { tempoEventId: INITIAL.id }
    drag.handlePointerInput(input('begin', 250, 60, { hit }), configuration)
    expect(drag.handlePointerInput(input('end', 251, 50, { hit }))).toMatchObject({
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
      drag.handlePointerInput(input('begin'), configuration)
      drag.handlePointerInput(
        input('update', axis === 'tick' ? 500 : 250, axis === 'bpm' ? 40 : 60),
      )
      expect(drag.handlePointerInput(input('end'))).toBeNull()
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
    drag.handlePointerInput(input('begin', 260, 65, { originPosition: origin }), {
      ...configuration,
      mapping,
    })
    mapping.width = 2_000
    mapping.scale.maximumBpm = 1_000
    origin.xCssPixel = 500
    const intent = drag.handlePointerInput(input('end', 510, 66))
    expect(intent).toMatchObject({ axis: 'tick', tick: 1_920 })
  })

  it.each(['update', 'end', 'claim'] as const)(
    'rejects external edits before their microtask notification at %s',
    (boundary) => {
      const { drag, configuration, input, project } = fixture()
      drag.handlePointerInput(input('begin'), configuration)
      const intent = boundary === 'claim' ? drag.handlePointerInput(input('end', 500)) : null
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
          : drag.handlePointerInput(input(boundary === 'update' ? 'update' : 'end', 500)) === null
      expect(refused).toBe(true)
      expect(drag.state.preview).toBeNull()
      expect(project.getSnapshot().tempoEvents[1]?.tick).toBe(960)
    },
  )

  it('cancels on external commit delivery even without another Pointer input', async () => {
    const { drag, configuration, input, project } = fixture()
    drag.handlePointerInput(input('begin'), configuration)
    project.execute(
      createRemoveTempoEventCommand({
        baseRevision: project.modelRevision,
        tempoEventId: LATER.id,
      }),
    )
    await Promise.resolve()
    expect(drag.state.preview).toBeNull()
    expect(drag.handlePointerInput(input('end', 500))).toBeNull()
  })

  it.each(['commit-first', 'projection-first'] as const)(
    'hands the preview to facts with %s delivery',
    async (order) => {
      const { drag, configuration, input, project } = fixture()
      drag.handlePointerInput(input('begin'), configuration)
      const intent = drag.handlePointerInput(input('end', 500))!
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
      drag.resolveCommit(
        intent.interactionId,
        project.modelRevision,
        configuration.projectedRevision,
      )
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
    drag.handlePointerInput(input('begin'), configuration)
    const old = drag.handlePointerInput(input('end', 500))!
    drag.cancel()
    const captureId = Symbol('replacement-capture')
    drag.handlePointerInput(input('begin', 250, 60, { captureId }), configuration)
    const current = drag.state.interactionId
    delivery[0]!.onError({} as Parameters<ProjectSubscriptionObserver['onError']>[0])
    drag.handlePointerInput(input('end', 800))
    drag.resolveCommit(old.interactionId, project.modelRevision, project.modelRevision)
    drag.finish(old.interactionId)
    expect(drag.claimCompletion(old.interactionId)).toBe(false)
    expect(drag.state.interactionId).toBe(current)
    expect(drag.state.preview?.tick).toBe(960)
    drag.dispose()
    expect(drag.handlePointerInput(input('end', 800, 60, { captureId }))).toBeNull()
    expect(drag.state.preview).toBeNull()
    drag.dispose()
  })

  it('replaces a pending handoff without letting its late acknowledgement close the new drag', () => {
    const { drag, configuration, input, project } = fixture()
    drag.handlePointerInput(input('begin'), configuration)
    const old = drag.handlePointerInput(input('end', 500))!
    drag.claimCompletion(old.interactionId)
    project.execute(
      createMoveTempoEventCommand({
        baseRevision: old.target.baseRevision,
        tempoEventId: LATER.id,
        tick: parseTick(1_920),
      }),
    )
    drag.resolveCommit(old.interactionId, project.modelRevision, configuration.projectedRevision)
    const captureId = Symbol('next')
    drag.handlePointerInput(input('begin', 250, 60, { captureId }), {
      ...configuration,
      projectedRevision: project.modelRevision,
    })
    const current = drag.state.interactionId
    drag.resolveCommit(old.interactionId, project.modelRevision, project.modelRevision)
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
    drag.handlePointerInput(input('begin'), configuration)
    expect(drag.state.preview).toBeNull()
  })

  it('closes unclaimed results when projection fails and can begin again', () => {
    const { drag, configuration, input, observer } = fixture()
    drag.handlePointerInput(input('begin'), configuration)
    observer.mockImplementationOnce(() => {
      throw new Error('Preview failed')
    })
    expect(() => drag.handlePointerInput(input('end', 500))).toThrow('Preview failed')
    expect(drag.state.preview).toBeNull()
    expect(drag.handlePointerInput(input('end', 500))).toBeNull()
    drag.handlePointerInput(input('begin'), configuration)
    expect(drag.state.pointerId).toBe(7)
    drag.dispose()
  })
})
