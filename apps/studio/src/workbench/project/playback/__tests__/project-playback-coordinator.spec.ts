import {
  createInitialProjectSession,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTrackId,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { createStudioGrandDeviceDescriptor } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateObserver,
} from '@/workbench/project/active-project-state'
import {
  ControlledProjectPlaybackRuntime,
  ManualPreparedPlaybackRuntime,
  ManualProjectPlaybackTimer,
} from '@/workbench/project/playback/__tests__/project-playback-test-support'
import { createProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'

class ActiveProjectHarness {
  readonly observers = new Set<ActiveProjectStateObserver>()
  readonly service: Pick<ActiveProjectService, 'state' | 'subscribe'>

  constructor(public state: ActiveProjectState) {
    const getState = () => this.state
    this.service = {
      get state() {
        return getState()
      },
      subscribe: (observer) => {
        this.observers.add(observer)
        return () => this.observers.delete(observer)
      },
    }
  }

  publish(state: ActiveProjectState): void {
    this.state = state
    for (const observer of this.observers) observer.onStateChange(state)
  }
}

function createActiveProjectHarness(initial: ActiveProjectState): ActiveProjectHarness {
  return new ActiveProjectHarness(initial)
}

function createPlayableSession(projectId: ProjectId): ProjectSession {
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Audible Project',
    tempoEventId: parseTempoEventId('tempo-playback-coordinator'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-coordinator'),
  })
  const trackId = parseTrackId('track-playback-coordinator')
  const deviceId = parseDeviceId('device-playback-coordinator')
  session.execute(
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      channel: {
        gain: parseLinearGain(1),
        muted: false,
        pan: parseBipolarValue(0),
        soloed: false,
      },
      color: null,
      insertAt: 0,
      instrumentDevice: createStudioGrandDeviceDescriptor(deviceId),
      name: 'Piano',
      trackId,
    }),
  )
  const clipId = parseClipId('clip-playback-coordinator')
  const sourceId = parseMidiSourceId('source-playback-coordinator')
  session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      color: null,
      loop: null,
      muted: false,
      name: 'Phrase',
      sourceId,
      sourceLengthTick: parsePositiveTick(1_920),
      sourceOffsetTick: parseTick(0),
      spanTick: parsePositiveTick(1_920),
      startTick: parseTick(0),
      trackId,
    }),
  )
  session.execute(
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(960),
      noteId: parseNoteId('note-playback-coordinator'),
      pitch: parseMidiPitch(60),
      sourceId,
      startTick: parseTick(0),
      velocity: parseMidiVelocity(100),
    }),
  )
  return session
}

function createReadyState(projectId: ProjectId, session: ProjectSession): ActiveProjectState {
  return Object.freeze({
    contentStateId: session.contentStateId,
    isDirty: true,
    modelRevision: session.modelRevision,
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId,
    recoveryFailures: Object.freeze([]),
    savedContentStateId: null,
    savedRevision: null,
    saveFailure: null,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    session,
  })
}

describe('ProjectPlaybackCoordinator', () => {
  it('keeps Playback unavailable before any Active Project is ready', () => {
    const activeProject = createActiveProjectHarness(
      Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
    )
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    expect(coordinator.state.phase).toBe('unavailable')
    expect(runtime.plans).toEqual([])
    coordinator.dispose()
  })

  it('prepares before Playing, schedules the first window, pauses and returns safely', async () => {
    const projectId = parseProjectId('project-playback-coordinator')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const timer = new ManualProjectPlaybackTimer()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer,
    })

    expect(coordinator.state.phase).toBe('stopped')
    const play = coordinator.play()
    expect(coordinator.state.phase).toBe('loading')
    await expect(play).resolves.toBe(true)

    const prepared = runtime.prepared[0]!
    expect(coordinator.state.phase).toBe('playing')
    expect(prepared.generations).toEqual([1])
    expect(prepared.scheduled).toHaveLength(1)
    expect(timer.intervals).toEqual([25])

    prepared.currentTime = 0.5 as typeof prepared.currentTime
    timer.fire()
    expect(coordinator.state.positionProjectSecond).toBe(0.5)
    expect(coordinator.pause()).toBe(true)
    expect(coordinator.state.phase).toBe('paused')
    expect(prepared.generations).toEqual([1, 2])
    expect(prepared.allNotesOffCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    expect(coordinator.returnToStart()).toBe(true)
    expect(coordinator.state).toMatchObject({ phase: 'stopped', positionProjectSecond: 0 })
    expect(prepared.generations).toEqual([1, 2, 3])
    expect(prepared.allNotesOffCount).toBe(2)
    coordinator.dispose()
    expect(runtime.disposeCount).toBe(1)
  })

  it('publishes the retained end position and stops waking after natural end', async () => {
    const projectId = parseProjectId('project-playback-natural-end')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const timer = new ManualProjectPlaybackTimer()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer,
    })
    await coordinator.play()
    const prepared = runtime.prepared[0]!

    prepared.currentTime = 10 as typeof prepared.currentTime
    timer.fire()

    expect(coordinator.state).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 1,
    })
    expect(timer.callbacks.size).toBe(0)
    expect(prepared.allNotesOffCount).toBe(0)
    coordinator.dispose()
  })

  it('publishes empty-plan feedback without activating browser audio', async () => {
    const projectId = parseProjectId('project-playback-empty')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Empty Project',
      tempoEventId: parseTempoEventId('tempo-playback-empty'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-playback-empty'),
    })
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    expect(coordinator.state).toMatchObject({
      feedback: { kind: 'info', message: 'No audible MIDI notes to play.' },
      phase: 'stopped',
      planStatus: 'empty',
    })
    await expect(coordinator.play()).rejects.toMatchObject({ code: 'playback-unavailable' })
    expect(runtime.plans).toEqual([])
    coordinator.dispose()
  })

  it('aborts and disposes the old runtime when the Active Project changes', async () => {
    const firstProjectId = parseProjectId('project-playback-first')
    const firstSession = createPlayableSession(firstProjectId)
    const activeProject = createActiveProjectHarness(createReadyState(firstProjectId, firstSession))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    await coordinator.play()
    const prepared = runtime.prepared[0]!

    activeProject.publish(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))

    expect(coordinator.state.phase).toBe('unavailable')
    expect(prepared.allNotesOffCount).toBe(1)
    expect(prepared.disposeCount).toBe(1)
    coordinator.dispose()
  })

  it('reports runtime failures without changing Project facts and allows retry', async () => {
    const projectId = parseProjectId('project-playback-retry')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const failure = new Error('Manifest request failed')
    runtime.failure = failure
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    const revisionBefore = session.modelRevision

    await expect(coordinator.play()).resolves.toBe(false)
    expect(coordinator.state).toMatchObject({
      failureCause: failure,
      phase: 'failed',
    })
    expect(session.modelRevision).toBe(revisionBefore)

    runtime.failure = null
    await expect(coordinator.play()).resolves.toBe(true)
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('aborts a pending load when Return to Start wins the request race', async () => {
    const projectId = parseProjectId('project-playback-loading-return')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const pendingPreparation: {
      resolve: ((runtime: ManualPreparedPlaybackRuntime) => void) | null
    } = { resolve: null }
    const baseRuntime = new ControlledProjectPlaybackRuntime()
    const runtime = {
      ...baseRuntime,
      dispose: () => baseRuntime.dispose(),
      prepare: (
        plan: Parameters<ControlledProjectPlaybackRuntime['prepare']>[0],
        signal: AbortSignal,
      ) => {
        baseRuntime.plans.push(plan)
        baseRuntime.signals.push(signal)
        return new Promise<ManualPreparedPlaybackRuntime>((resolve) => {
          pendingPreparation.resolve = resolve
        })
      },
    }
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    const play = coordinator.play()
    expect(coordinator.state.phase).toBe('loading')
    expect(coordinator.returnToStart()).toBe(true)
    expect(baseRuntime.signals[0]?.aborted).toBe(true)
    const staleRuntime = new ManualPreparedPlaybackRuntime(session.modelRevision)
    const resolvePending = pendingPreparation.resolve
    if (resolvePending === null) throw new Error('Expected pending preparation resolver')
    resolvePending(staleRuntime)
    await expect(play).resolves.toBe(false)
    expect(staleRuntime.disposeCount).toBe(1)
    expect(coordinator.state.phase).toBe('stopped')
    coordinator.dispose()
  })
})
