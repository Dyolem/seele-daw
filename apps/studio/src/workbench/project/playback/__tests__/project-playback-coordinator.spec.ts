import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
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
  type NoteId,
  type ProjectCommand,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
} from '@seele-daw/project-core'
import {
  createStudioGrandDeviceDescriptor,
  parsePlaybackClockSecond,
  parseSoundbankId,
} from '@seele-daw/playback'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  ActiveProjectCommitListener,
  ActiveProjectService,
} from '@/workbench/project/active-project-service'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
  type ActiveProjectStateListener,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  FakeProjectPlaybackRuntime,
  ManualProjectPlaybackTimer,
} from '@/workbench/project/playback/__tests__/project-playback-test-support'
import { createProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'

// The engine's behaviour is tested in packages/playback; these tests cover what the coordinator
// adds: following the Active Project, the Project identity, and the user-facing feedback.

const TRACK_ID = parseTrackId('track-playback-coordinator')
const SOURCE_ID = parseMidiSourceId('source-playback-coordinator')
const NOTE_ID = parseNoteId('note-playback-coordinator')
const SECOND_NOTE_ID = parseNoteId('note-playback-coordinator-second')
const THIRD_NOTE_ID = parseNoteId('note-playback-coordinator-third')
const MISSING_SOUNDBANK_ID = parseSoundbankId('missing-piano')

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

class ActiveProjectHarness {
  readonly commitListeners = new Set<ActiveProjectCommitListener>()
  readonly listeners = new Set<ActiveProjectStateListener>()
  readonly service: Pick<ActiveProjectService, 'state' | 'subscribe' | 'subscribeCommits'>

  constructor(public state: ActiveProjectState) {
    const getState = () => this.state
    this.service = {
      get state() {
        return getState()
      },
      subscribe: (listener) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      subscribeCommits: (listener) => {
        this.commitListeners.add(listener)
        return () => this.commitListeners.delete(listener)
      },
    }
  }

  publish(state: ActiveProjectState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }

  /** Publishes the ready state of the current session, then its commit, as the service does. */
  publishCommit(commit: ProjectCommit): void {
    const current = this.state
    if (current.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new Error('Active Project Harness requires a Ready state to publish a Commit')
    }
    this.publish(createReadyState(current.projectId, current.session))
    this.deliverCommit(commit, current.session)
  }

  deliverCommit(commit: ProjectCommit, session: ProjectSession): void {
    const current = this.state
    if (current.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new Error('Active Project Harness requires a Ready state to deliver a Commit')
    }
    const event = Object.freeze({
      commit,
      projectId: current.projectId,
      session,
      state: createReadyState(current.projectId, session),
    })
    for (const listener of this.commitListeners) listener(event)
  }
}

function requireCommitted(session: ProjectSession, command: ProjectCommand): ProjectCommit {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected Project Command to commit')
  }
  return result.commit
}

function addNote(session: ProjectSession, noteId: NoteId, startTick = 480): ProjectCommit {
  return requireCommitted(
    session,
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(240),
      noteId,
      pitch: parseMidiPitch(60),
      sourceId: SOURCE_ID,
      startTick: parseTick(startTick),
      velocity: parseMidiVelocity(100),
    }),
  )
}

function createPlayableSession(projectId: ProjectId): ProjectSession {
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Audible Project',
    tempoEventId: parseTempoEventId('tempo-playback-coordinator'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-coordinator'),
  })
  requireCommitted(
    session,
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
      instrumentDevice: createStudioGrandDeviceDescriptor(
        parseDeviceId('device-playback-coordinator'),
      ),
      name: 'Piano',
      trackId: TRACK_ID,
    }),
  )
  requireCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId: parseClipId('clip-playback-coordinator'),
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
  addNote(session, NOTE_ID, 0)
  return session
}

function createCoordinator(
  activeProject: ActiveProjectHarness,
  runtime = new FakeProjectPlaybackRuntime(),
) {
  return createProjectPlaybackCoordinator({
    activeProject: activeProject.service,
    runtime,
    timer: new ManualProjectPlaybackTimer(),
  })
}

function createPlayableHarness(name: string) {
  const projectId = parseProjectId(`project-playback-${name}`)
  const session = createPlayableSession(projectId)
  const activeProject = new ActiveProjectHarness(createReadyState(projectId, session))
  return { activeProject, projectId, session }
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve))
}

describe('ProjectPlaybackCoordinator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps Playback unavailable before any Active Project is ready', () => {
    const activeProject = new ActiveProjectHarness(
      Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }),
    )
    const runtime = new FakeProjectPlaybackRuntime()
    const coordinator = createCoordinator(activeProject, runtime)

    expect(coordinator.state).toMatchObject({ phase: 'unavailable', projectId: null })
    expect(runtime.plans).toEqual([])
    coordinator.dispose()
  })

  it('publishes the engine state with the loaded Project identity', async () => {
    const { activeProject, projectId, session } = createPlayableHarness('identity')
    const runtime = new FakeProjectPlaybackRuntime()
    const coordinator = createCoordinator(activeProject, runtime)

    expect(coordinator.state).toMatchObject({
      feedback: null,
      modelRevision: session.modelRevision,
      phase: 'stopped',
      planStatus: 'playable',
      projectId,
    })
    await expect(coordinator.play()).resolves.toBe(true)
    expect(coordinator.state).toMatchObject({ phase: 'playing', projectId })

    // The service republishes the ready state before each commit; the same session stays loaded.
    activeProject.publish(createReadyState(projectId, session))
    expect(coordinator.state.phase).toBe('playing')
    expect(runtime.allNotesOffCount).toBe(0)
    coordinator.dispose()
  })

  it('forwards commits of the loaded session only', async () => {
    const { activeProject, projectId, session } = createPlayableHarness('commit-owner')
    const coordinator = createCoordinator(activeProject)

    activeProject.publishCommit(addNote(session, SECOND_NOTE_ID))
    await settle()
    expect(coordinator.state.modelRevision).toBe(session.modelRevision)

    const otherSession = createPlayableSession(projectId)
    addNote(otherSession, SECOND_NOTE_ID)
    activeProject.deliverCommit(addNote(otherSession, THIRD_NOTE_ID), otherSession)
    await settle()
    expect(coordinator.state.modelRevision).toBe(session.modelRevision)
    coordinator.dispose()
  })

  it('warns about Notes that no instrument Zone covers', async () => {
    const { activeProject } = createPlayableHarness('uncovered')
    const runtime = new FakeProjectPlaybackRuntime()
    runtime.unsupportedNotePitches = [60]
    const coordinator = createCoordinator(activeProject, runtime)

    await expect(coordinator.play()).resolves.toBe(false)
    expect(coordinator.state).toMatchObject({
      failureCause: null,
      feedback: {
        kind: 'warning',
        message:
          '1 MIDI note event was skipped because the selected instrument control files do not cover those pitches: studio-grand MIDI 60.',
      },
      phase: 'stopped',
    })
    coordinator.dispose()
  })

  it('reports instruments that could not load as the cause of silent Tracks', async () => {
    const { activeProject } = createPlayableHarness('missing-instrument')
    const runtime = new FakeProjectPlaybackRuntime()
    const failures = Object.freeze([
      Object.freeze({
        cause: new Error('Manifest request failed'),
        soundbankId: MISSING_SOUNDBANK_ID,
      }),
    ])
    runtime.preparationFailures = failures
    const coordinator = createCoordinator(activeProject, runtime)

    await expect(coordinator.play()).resolves.toBe(true)
    expect(coordinator.state).toMatchObject({
      failureCause: failures,
      feedback: {
        kind: 'warning',
        message:
          'Instrument resources could not be loaded for missing-piano; affected tracks are silent.',
      },
      phase: 'playing',
    })
    coordinator.dispose()
  })

  it('shows a runtime failure and allows retry', async () => {
    const { activeProject, session } = createPlayableHarness('retry')
    const runtime = new FakeProjectPlaybackRuntime()
    const failure = new Error('Manifest request failed')
    runtime.failure = failure
    const coordinator = createCoordinator(activeProject, runtime)
    const revisionBefore = session.modelRevision

    await expect(coordinator.play()).resolves.toBe(false)
    expect(coordinator.state).toMatchObject({
      failureCause: failure,
      feedback: { kind: 'error', message: 'Manifest request failed' },
      phase: 'failed',
    })
    expect(session.modelRevision).toBe(revisionBefore)

    runtime.failure = null
    await expect(coordinator.play()).resolves.toBe(true)
    expect(coordinator.state).toMatchObject({
      failureCause: null,
      feedback: null,
      phase: 'playing',
    })
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
    const activeProject = new ActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new FakeProjectPlaybackRuntime()
    const coordinator = createCoordinator(activeProject, runtime)

    expect(coordinator.state).toMatchObject({
      feedback: { kind: 'info', message: 'No audible MIDI notes to play.' },
      phase: 'stopped',
      planStatus: 'empty',
    })
    await expect(coordinator.play()).rejects.toThrowError('no playable plan')
    expect(runtime.plans).toEqual([])
    coordinator.dispose()
  })

  it('fails playback when it cannot follow the Active Project', () => {
    const { activeProject } = createPlayableHarness('follow-failure')
    const coordinator = createCoordinator(activeProject)
    const projectId = parseProjectId('project-playback-unreadable')
    const session = createPlayableSession(projectId)
    const cause = new Error('Snapshot unavailable')
    vi.spyOn(session, 'getSnapshot').mockImplementation(() => {
      throw cause
    })

    activeProject.publish(createReadyState(projectId, session))

    expect(coordinator.state).toMatchObject({
      failureCause: cause,
      feedback: { kind: 'error', message: 'Snapshot unavailable' },
      phase: 'failed',
    })
    coordinator.dispose()
  })

  it('reports a state listener that throws and keeps delivering to it', async () => {
    const { activeProject } = createPlayableHarness('observer-failure')
    const coordinator = createCoordinator(activeProject)
    const reportError = vi.fn<(error: unknown) => void>()
    vi.stubGlobal('reportError', reportError)
    const viewFailure = new Error('View update failed')
    const deliveredPhases: string[] = []
    coordinator.subscribe((state) => {
      deliveredPhases.push(state.phase)
      throw viewFailure
    })

    await expect(coordinator.play()).resolves.toBe(true)
    expect(deliveredPhases).toEqual(['loading', 'playing'])
    expect(reportError.mock.calls).toEqual([[viewFailure], [viewFailure]])
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('resets visual position while Active Project ownership changes', async () => {
    const { activeProject, projectId: firstProjectId } = createPlayableHarness('first')
    const runtime = new FakeProjectPlaybackRuntime()
    const coordinator = createCoordinator(activeProject, runtime)
    await coordinator.play()
    runtime.currentTime = parsePlaybackClockSecond(0.5)
    expect(coordinator.readVisualPosition()).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.5,
      positionTick: 960,
      projectId: firstProjectId,
    })

    activeProject.publish(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))

    expect(coordinator.state.phase).toBe('unavailable')
    expect(coordinator.readVisualPosition()).toMatchObject({
      phase: 'unavailable',
      positionProjectSecond: 0,
      positionTick: 0,
      projectId: null,
    })
    expect(runtime.allNotesOffCount).toBe(1)

    const secondProjectId = parseProjectId('project-playback-second')
    const secondSession = createPlayableSession(secondProjectId)
    activeProject.publish(createReadyState(secondProjectId, secondSession))
    expect(coordinator.readVisualPosition()).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 0,
      positionTick: 0,
      projectId: secondProjectId,
    })

    coordinator.dispose()
    expect(runtime.disposeCount).toBe(1)
    expect(activeProject.listeners.size).toBe(0)
    expect(activeProject.commitListeners.size).toBe(0)
    expect(() => coordinator.readVisualPosition()).toThrowError('Project Playback is disposed')
  })
})
