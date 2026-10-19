import {
  createInitialProjectSession,
  createAllProjectCommitsSubscription,
  createReplaceTempoEventBpmCommand,
  parseProjectId,
  parseTempoBpm,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTick,
  parsePositiveTick,
  parseMidiPitch,
  parseTrackId,
  type ModelRevision,
  type ProjectSubscriptionObserver,
} from '@seele-daw/project-core'
import {
  createPianoRollGrid,
  createPianoRollTimelineViewport,
  type PianoRollPointerInput,
} from '@seele-daw/editor'
import { describe, expect, it, vi } from 'vitest'
import { TrackPlacementSession } from '@/features/piano-roll/components/track-surface/interaction/track-placement-session'
import type {
  TrackPlacementConfiguration,
  TrackPlacementState,
} from '@/features/piano-roll/components/track-surface/types/track-placement'

function fixture() {
  const project = createInitialProjectSession({
    projectId: parseProjectId('placement-project'),
    projectName: 'Track Placement',
    tempoEventId: parseTempoEventId('tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('meter'),
  })
  const observer = vi.fn<(state: TrackPlacementState) => void>()
  const session = new TrackPlacementSession(observer)
  const configuration: TrackPlacementConfiguration = {
    session: project,
    readModel: {
      activeClipId: null,
      clips: [],
      modelRevision: project.modelRevision,
      projectId: parseProjectId('placement-project'),
      trackId: parseTrackId('track'),
    },
    viewport: createPianoRollTimelineViewport({
      widthCssPixel: 960,
      heightCssPixel: 120,
      visibleStartTick: parseTick(0),
      visibleSpanTick: parsePositiveTick(3840),
      minimumPitch: parseMidiPitch(60),
      maximumPitch: parseMidiPitch(71),
    }),
    grid: createPianoRollGrid({
      originTick: parseTick(0),
      subdivisionSpanTick: parsePositiveTick(240),
      beatSpanTick: parsePositiveTick(960),
      barSpanTick: parsePositiveTick(3840),
    }),
    tool: 'pencil',
    snapEnabled: true,
    barSpanTick: parseTick(3840),
    timelineEndTick: parseTick(3840),
    noteDurationTick: parseTick(240),
  }
  const begin: PianoRollPointerInput = {
    phase: 'begin',
    captureId: Symbol('capture'),
    pointerId: 3,
    pointerType: 'mouse',
    hit: null,
    position: { xCssPixel: 125, yCssPixel: 60 },
    originPosition: { xCssPixel: 125, yCssPixel: 60 },
    originModifiers: { alt: false, control: false, meta: false, shift: false },
    modifiers: { alt: false, control: false, meta: false, shift: false },
    hasExceededDragThreshold: false,
  }
  const end: PianoRollPointerInput = { ...begin, phase: 'end' }
  function edit() {
    project.execute(
      createReplaceTempoEventBpmCommand({
        baseRevision: project.modelRevision,
        tempoEventId: parseTempoEventId('tempo'),
        bpm: parseTempoBpm(130),
      }),
    )
  }
  return { project, session, configuration, observer, begin, end, edit }
}

describe('TrackPlacementSession', () => {
  it('freezes tool, grid, target and original point, and claims completion once', () => {
    const { session, configuration, begin, end } = fixture()
    const mutable = { ...configuration, grid: { ...configuration.grid } }
    session.handlePointerInput(begin, mutable)
    mutable.tool = 'cursor'
    mutable.snapEnabled = false
    mutable.grid.subdivisionSpanTick = parsePositiveTick(960)
    const intent = session.handlePointerInput({
      ...end,
      originPosition: { xCssPixel: 750, yCssPixel: 0 },
    })
    expect(intent).toMatchObject({
      type: 'place-note',
      preview: {
        pitch: 65,
        placement: { action: 'create-clip', projectStartTick: 480, noteDurationTick: 240 },
      },
    })
    if (intent === null) throw new Error('Expected placement')
    expect(session.claimCompletion(intent.interactionId)).toBe(true)
    expect(session.claimCompletion(intent.interactionId)).toBe(false)
    expect(session.handlePointerInput(end)).toBeNull()
    session.finish(intent.interactionId)
    session.dispose()
  })
  it.each([false, true])(
    'rejects authority changes before notification (completed: %s)',
    async (completed) => {
      const { session, configuration, begin, end, edit } = fixture()
      session.handlePointerInput(begin, configuration)
      const id = session.state.interactionId
      if (id === null) throw new Error('Expected interaction')
      if (completed) session.handlePointerInput(end)
      edit()
      expect(session.handlePointerInput(end)).toBeNull()
      expect(session.claimCompletion(id)).toBe(false)
      await Promise.resolve()
      expect(session.state.interactionId).toBeNull()
    },
  )
  it('keeps preview until projection and rejects old captures and replies during the next gesture', () => {
    const { session, configuration, begin, end } = fixture()
    session.handlePointerInput(begin, configuration)
    const intent = session.handlePointerInput(end)
    if (intent === null) throw new Error('Expected placement')
    session.claimCompletion(intent.interactionId)
    session.resolveCommit(intent.interactionId, 1 as ModelRevision, 0 as ModelRevision)
    expect(session.state.awaitingAuthority).toBe(true)
    expect(session.state.preview).not.toBeNull()
    const next = { ...begin, captureId: Symbol('next') }
    session.handlePointerInput(next, configuration)
    const id = session.state.interactionId
    expect(session.handlePointerInput(end)).toBeNull()
    session.resolveCommit(intent.interactionId, 1 as ModelRevision, 1 as ModelRevision)
    session.finish(intent.interactionId)
    expect(session.state.interactionId).toBe(id)
    const current = session.handlePointerInput({ ...end, captureId: next.captureId })
    if (current === null) throw new Error('Expected new placement')
    session.claimCompletion(current.interactionId)
    session.notifyAuthorityRevision(1 as ModelRevision)
    session.resolveCommit(current.interactionId, 1 as ModelRevision, 0 as ModelRevision)
    expect(session.state.preview).toBeNull()
  })
  it('cancels dragged clicks and ignores input after disposal', () => {
    const { session, configuration, begin, end } = fixture()
    session.handlePointerInput(begin, configuration)
    expect(session.handlePointerInput({ ...end, hasExceededDragThreshold: true })).toBeNull()
    expect(session.state.interactionId).toBeNull()
    session.handlePointerInput(begin, configuration)
    session.dispose()
    session.dispose()
    expect(session.handlePointerInput(end)).toBeNull()
  })
  it('closes failed projections and ignores a retired subscription callback', () => {
    const { session, configuration, begin, end, observer } = fixture()
    let oldObserver: ProjectSubscriptionObserver | undefined
    const unsubscribe = vi.fn<() => void>()
    const authority = {
      modelRevision: configuration.session.modelRevision,
      query: configuration.session.query.bind(configuration.session),
      subscribe: vi.fn<typeof configuration.session.subscribe>((_query, recipient) => {
        oldObserver = recipient
        return unsubscribe
      }),
    }
    session.handlePointerInput(begin, { ...configuration, session: authority })
    session.cancel()
    expect(unsubscribe).toHaveBeenCalledOnce()
    const retired = oldObserver
    session.handlePointerInput({ ...begin, captureId: Symbol('next') }, configuration)
    const id = session.state.interactionId
    const committed = fixture().project.execute(
      createReplaceTempoEventBpmCommand({
        baseRevision: 0 as ModelRevision,
        tempoEventId: parseTempoEventId('tempo'),
        bpm: parseTempoBpm(130),
      }),
    )
    if (committed.status !== 'committed') throw new Error('Expected fixture commit')
    retired?.onError({
      subscription: createAllProjectCommitsSubscription(),
      commit: committed.commit,
      cause: new Error('Retired subscriber'),
    })
    expect(session.state.interactionId).toBe(id)
    session.cancel()
    observer.mockImplementationOnce(() => {
      throw new Error('Broken projection')
    })
    expect(() => session.handlePointerInput(begin, configuration)).toThrow('Broken projection')
    expect(session.state.interactionId).toBeNull()
    expect(session.handlePointerInput(end)).toBeNull()
    session.dispose()
  })
})
