import { parseTick } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'
import { TimelineLocateSession } from '@/features/project-workspace/workbench-shell/arrangement/interaction/timeline-locate-session'
import type {
  TimelineLocateInput,
  TimelineLocateCompletion,
  TimelineLocateState,
} from '@/features/project-workspace/workbench-shell/arrangement/types/timeline-locate'

function fixture() {
  const onState = vi.fn<(state: TimelineLocateState) => void>()
  const onComplete = vi.fn<(completion: TimelineLocateCompletion) => void>()
  const playback = {
    startedWhilePlaying: true,
    commit: vi.fn<(tick: ReturnType<typeof parseTick>) => boolean>(() => true),
    cancel: vi.fn<() => boolean>(() => true),
  }
  const session = new TimelineLocateSession(onState, onComplete)
  const begin: TimelineLocateInput = {
    phase: 'begin',
    captureId: Symbol('locate'),
    pointerId: 9,
    pointerType: 'mouse',
    hit: null,
    position: { xCssPixel: 0, yCssPixel: 0 },
    originPosition: { xCssPixel: 0, yCssPixel: 0 },
    originModifiers: { alt: false, control: false, meta: false, shift: false },
    modifiers: { alt: false, control: false, meta: false, shift: false },
    hasExceededDragThreshold: false,
  }
  const configuration = { beginPlayback: () => playback, wasFollowSuspended: true }
  return { onState, onComplete, playback, session, begin, configuration }
}

describe('TimelineLocateSession', () => {
  it('updates before the drag threshold and commits only the final mapped tick once', () => {
    const { session, playback, onComplete, begin, configuration } = fixture()
    session.handlePointerInput(begin, parseTick(10), configuration)
    expect(session.state.previewTick).toBe(10)
    session.handlePointerInput({ ...begin, phase: 'update' }, parseTick(11))
    expect(session.state.previewTick).toBe(11)
    session.handlePointerInput({ ...begin, phase: 'end' }, parseTick(13))
    session.handlePointerInput({ ...begin, phase: 'end' }, parseTick(15))
    expect(playback.commit).toHaveBeenCalledExactlyOnceWith(13)
    expect(playback.cancel).not.toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledExactlyOnceWith({
      committed: true,
      accepted: true,
      startedWhilePlaying: true,
      wasFollowSuspended: true,
    })
    expect(session.state.previewTick).toBeNull()
  })
  it('isolates late Pointer and scroll updates after cancellation and Pointer ID reuse', () => {
    const { session, playback, begin, configuration } = fixture()
    session.handlePointerInput(begin, parseTick(10), configuration)
    const oldId = session.state.interactionId
    if (oldId === null) throw new Error('Expected locate')
    session.cancel()
    const next = { ...begin, captureId: Symbol('next') }
    session.handlePointerInput(next, parseTick(20), configuration)
    session.handlePointerInput({ ...begin, phase: 'end' }, parseTick(100))
    session.update(oldId, parseTick(200))
    expect(session.state.previewTick).toBe(20)
    expect(playback.cancel).toHaveBeenCalledOnce()
    session.dispose()
    session.dispose()
    session.handlePointerInput({ ...next, phase: 'end' }, parseTick(30))
    expect(playback.cancel).toHaveBeenCalledTimes(2)
    expect(playback.commit).not.toHaveBeenCalled()
  })
  it('restores Playback and closes the gesture when preview delivery fails', () => {
    const { session, playback, onState, begin, configuration } = fixture()
    onState.mockImplementationOnce(() => {
      throw new Error('Preview failure')
    })
    expect(() => session.handlePointerInput(begin, parseTick(10), configuration)).toThrow(
      'Preview failure',
    )
    expect(playback.cancel).toHaveBeenCalledOnce()
    expect(session.state.interactionId).toBeNull()
    session.handlePointerInput({ ...begin, phase: 'end' }, parseTick(20))
    expect(playback.commit).not.toHaveBeenCalled()
  })
  it('reports a rejected Playback completion without a second cancel attempt', () => {
    const { session, playback, onComplete, begin, configuration } = fixture()
    playback.commit.mockReturnValue(false)
    session.handlePointerInput(begin, parseTick(10), configuration)
    session.handlePointerInput({ ...begin, phase: 'end' }, parseTick(20))
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ committed: true, accepted: false }),
    )
    session.cancel()
    expect(playback.cancel).not.toHaveBeenCalled()
  })
})
