import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
  createInitialProjectSession,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  parseTrackId,
  type NoteId,
  type ProjectCommand,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'
import { createStudioGrandDeviceDescriptor, type AudibleMidiProjectPlan } from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import type {
  ActiveProjectCommitObserver,
  ActiveProjectService,
} from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateObserver,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  ControlledProjectPlaybackRuntime,
  ManualPreparedPlaybackRuntime,
  ManualProjectPlaybackTimer,
  type ManualProjectPlaybackVoiceHandle,
} from '@/workbench/project/playback/__tests__/project-playback-test-support'
import { createProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'

class ActiveProjectHarness {
  readonly commitObservers = new Set<ActiveProjectCommitObserver>()
  readonly observers = new Set<ActiveProjectStateObserver>()
  readonly service: Pick<ActiveProjectService, 'state' | 'subscribe' | 'subscribeCommits'>

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
      subscribeCommits: (observer) => {
        this.commitObservers.add(observer)
        return () => this.commitObservers.delete(observer)
      },
    }
  }

  publish(state: ActiveProjectState): void {
    this.state = state
    for (const observer of this.observers) observer.onStateChange(state)
  }

  publishCommit(commit: ProjectCommit): void {
    const current = this.state
    if (current.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new Error('Active Project Harness requires a Ready state to publish a Commit')
    }

    const state = createReadyState(current.projectId, current.session)
    this.publish(state)
    const event = Object.freeze({
      commit,
      projectId: state.projectId,
      session: state.session,
      state,
    })
    for (const observer of this.commitObservers) observer.onCommit(event)
  }
}

function createActiveProjectHarness(initial: ActiveProjectState): ActiveProjectHarness {
  return new ActiveProjectHarness(initial)
}

const TRACK_ID = parseTrackId('track-playback-coordinator')
const DEVICE_ID = parseDeviceId('device-playback-coordinator')
const CLIP_ID = parseClipId('clip-playback-coordinator')
const SOURCE_ID = parseMidiSourceId('source-playback-coordinator')
const NOTE_ID = parseNoteId('note-playback-coordinator')
const SECOND_NOTE_ID = parseNoteId('note-playback-coordinator-second')
const FAR_NOTE_ID = parseNoteId('note-playback-coordinator-far')
const MOVED_NOTE_ID = parseNoteId('note-playback-coordinator-moved')

function requireCommitted(session: ProjectSession, command: ProjectCommand): ProjectCommit {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected Project Command to commit')
  }
  return result.commit
}

function createPlayableSession(projectId: ProjectId): ProjectSession {
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Audible Project',
    tempoEventId: parseTempoEventId('tempo-playback-coordinator'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-coordinator'),
  })
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
      instrumentDevice: createStudioGrandDeviceDescriptor(DEVICE_ID),
      name: 'Piano',
      trackId: TRACK_ID,
    }),
  )
  session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId: CLIP_ID,
      color: null,
      loop: null,
      muted: false,
      name: 'Phrase',
      sourceId: SOURCE_ID,
      sourceLengthTick: parsePositiveTick(1_920),
      sourceOffsetTick: parseTick(0),
      spanTick: parsePositiveTick(1_920),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    }),
  )
  session.execute(
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(960),
      noteId: NOTE_ID,
      pitch: parseMidiPitch(60),
      sourceId: SOURCE_ID,
      startTick: parseTick(0),
      velocity: parseMidiVelocity(100),
    }),
  )
  return session
}

function createReadyState(projectId: ProjectId, session: ProjectSession): ReadyActiveProjectState {
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

function requireVoiceHandle(
  runtime: ManualPreparedPlaybackRuntime,
  plan: AudibleMidiProjectPlan,
  noteId: NoteId,
): ManualProjectPlaybackVoiceHandle {
  const occurrenceKey = plan.midiNoteSpans.find((span) => span.noteId === noteId)?.occurrenceKey
  const handle = runtime.handles.find((candidate) => candidate.occurrenceKey === occurrenceKey)
  if (handle === undefined) throw new Error(`Expected scheduled Voice for Note ${noteId}`)
  return handle
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

  it('hands off a far-future Note addition without interrupting the active Voice', async () => {
    const projectId = parseProjectId('project-playback-live-add')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    await coordinator.play()
    const firstRuntime = runtime.prepared[0]!
    const activeHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    firstRuntime.currentTime = 0.1 as typeof firstRuntime.currentTime

    const commit = requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(240),
        noteId: FAR_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_440),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(coordinator.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
      positionProjectSecond: 0.1,
    })
    expect(activeHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(firstRuntime.disposeCount).toBe(0)
    expect(runtime.prepared[1]?.generations).toEqual([2])
    coordinator.dispose()
  })

  it('releases only the deleted active Note Voice while an unaffected Voice continues', async () => {
    const projectId = parseProjectId('project-playback-live-remove')
    const session = createPlayableSession(projectId)
    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(960),
        noteId: SECOND_NOTE_ID,
        pitch: parseMidiPitch(64),
        sourceId: SOURCE_ID,
        startTick: parseTick(0),
        velocity: parseMidiVelocity(100),
      }),
    )
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    await coordinator.play()
    const firstRuntime = runtime.prepared[0]!
    const removedHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    const continuingHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, SECOND_NOTE_ID)
    firstRuntime.currentTime = 0.1 as typeof firstRuntime.currentTime

    const commit = requireCommitted(
      session,
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        noteIds: [NOTE_ID],
        sourceId: SOURCE_ID,
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(removedHandle.isActive()).toBe(false)
    expect(removedHandle.cancelCalls).toEqual([0.1])
    expect(continuingHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('cancels a queued moved Note and schedules its replacement only at the new future time', async () => {
    const projectId = parseProjectId('project-playback-live-move')
    const session = createPlayableSession(projectId)
    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(240),
        noteId: MOVED_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(240),
        velocity: parseMidiVelocity(100),
      }),
    )
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const timer = new ManualProjectPlaybackTimer()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer,
    })
    await coordinator.play()
    const firstRuntime = runtime.prepared[0]!
    const activeHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    const queuedHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, MOVED_NOTE_ID)
    firstRuntime.currentTime = 0.05 as typeof firstRuntime.currentTime

    const commit = requireCommitted(
      session,
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        deltaPitch: parseMidiPitchDelta(1),
        deltaTick: parseTickDelta(480),
        noteIds: [MOVED_NOTE_ID],
        sourceId: SOURCE_ID,
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(queuedHandle.isActive()).toBe(false)
    expect(queuedHandle.cancelCalls).toEqual([0.05])
    expect(activeHandle.isActive()).toBe(true)
    expect(runtime.prepared[1]?.scheduled).toEqual([])

    const nextRuntime = runtime.prepared[1]!
    nextRuntime.currentTime = 0.2 as typeof nextRuntime.currentTime
    timer.fire()
    expect(nextRuntime.scheduled).toEqual([
      expect.objectContaining({ pitch: 68, startPlaybackClockSecond: 0.375 }),
    ])
    coordinator.dispose()
  })

  it('retimes the release of an active resized Note without restarting its Voice', async () => {
    const projectId = parseProjectId('project-playback-live-resize')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    await coordinator.play()
    const firstRuntime = runtime.prepared[0]!
    const activeHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    firstRuntime.currentTime = 0.1 as typeof firstRuntime.currentTime

    const commit = requireCommitted(
      session,
      createResizeNoteCommand({
        baseRevision: session.modelRevision,
        durationTick: parsePositiveTick(1_440),
        noteId: NOTE_ID,
        sourceId: SOURCE_ID,
        startTick: parseTick(0),
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(activeHandle.isActive()).toBe(true)
    expect(activeHandle.releaseUpdates).toEqual([0.75])
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
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
