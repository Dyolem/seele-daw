import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
  createDeviceDescriptor,
  createExtendMidiClipWithNoteCommand,
  createInitialProjectSession,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createReplaceInstrumentDeviceCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
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
  type ClipId,
  type DeviceId,
  type MidiPitch,
  type MidiSourceId,
  type NoteId,
  type ProjectCommand,
  type ProjectCommit,
  type ProjectId,
  type ProjectSession,
  type TrackId,
} from '@seele-daw/project-core'
import {
  createStudioGrandDeviceDescriptor,
  parsePlaybackClockSecond,
  parseSoundbankId,
  type AudibleMidiProjectPlan,
  type SoundbankId,
} from '@seele-daw/playback'
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
  DeferredProjectPlaybackRuntime,
  ManualPreparedPlaybackRuntime,
  ManualProjectPlaybackTimer,
  type ManualProjectPlaybackVoiceHandle,
} from '@/workbench/project/playback/__tests__/project-playback-test-support'
import {
  PROJECT_PLAYBACK_INSTRUMENT_FAILURE_MODE,
  createProjectPlaybackCoordinator,
} from '@/workbench/project/playback/project-playback-coordinator'

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
const SECOND_TRACK_ID = parseTrackId('track-playback-coordinator-second')
const SECOND_DEVICE_ID = parseDeviceId('device-playback-coordinator-second')
const SECOND_CLIP_ID = parseClipId('clip-playback-coordinator-second')
const SECOND_SOURCE_ID = parseMidiSourceId('source-playback-coordinator-second')
const SECOND_TRACK_NOTE_ID = parseNoteId('note-playback-coordinator-second-track')
const REPLACEMENT_SOUNDBANK_ID = parseSoundbankId('replacement-piano')
const MISSING_SOUNDBANK_ID = parseSoundbankId('missing-piano')
const LIFECYCLE_CLIP_ID = parseClipId('clip-playback-coordinator-lifecycle')
const LIFECYCLE_SOURCE_ID = parseMidiSourceId('source-playback-coordinator-lifecycle')
const REPLACEMENT_FUTURE_NOTE_ID = parseNoteId('note-playback-coordinator-replacement')
const RAPID_NOTE_ID = parseNoteId('note-playback-coordinator-rapid')
const LATEST_NOTE_ID = parseNoteId('note-playback-coordinator-latest')

interface PlayableTrackFixture {
  readonly clipId: ClipId
  readonly deviceId: DeviceId
  readonly insertAt: number
  readonly noteId: NoteId
  readonly pitch: MidiPitch
  readonly sourceId: MidiSourceId
  readonly trackId: TrackId
}

function requireCommitted(session: ProjectSession, command: ProjectCommand): ProjectCommit {
  const result = session.execute(command)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected Project Command to commit')
  }
  return result.commit
}

function requireUndo(session: ProjectSession): ProjectCommit {
  const commit = session.undo()
  if (commit === null) throw new Error('Expected Project History to produce an Undo Commit')
  return commit
}

function createSampleInstrumentDescriptor(deviceId: DeviceId, soundbankId: SoundbankId) {
  return createDeviceDescriptor({
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    id: deviceId,
    opaqueState: { soundbankId },
    parameters: {},
    typeId: parseDeviceTypeId('seele.sample-instrument'),
  })
}

function addPlayableTrack(session: ProjectSession, fixture: PlayableTrackFixture): void {
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
      insertAt: fixture.insertAt,
      instrumentDevice: createStudioGrandDeviceDescriptor(fixture.deviceId),
      name: 'Piano',
      trackId: fixture.trackId,
    }),
  )
  requireCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId: fixture.clipId,
      color: null,
      loop: null,
      muted: false,
      name: 'Phrase',
      sourceId: fixture.sourceId,
      sourceLengthTick: parsePositiveTick(1_920),
      sourceOffsetTick: parseTick(0),
      spanTick: parsePositiveTick(1_920),
      startTick: parseTick(0),
      trackId: fixture.trackId,
    }),
  )
  requireCommitted(
    session,
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(960),
      noteId: fixture.noteId,
      pitch: fixture.pitch,
      sourceId: fixture.sourceId,
      startTick: parseTick(0),
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
  addPlayableTrack(session, {
    clipId: CLIP_ID,
    deviceId: DEVICE_ID,
    insertAt: 0,
    noteId: NOTE_ID,
    pitch: parseMidiPitch(60),
    sourceId: SOURCE_ID,
    trackId: TRACK_ID,
  })
  return session
}

function createEdgeClippedPlayableSession(projectId: ProjectId): ProjectSession {
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Edge-clipped Audible Project',
    tempoEventId: parseTempoEventId('tempo-playback-coordinator-edge-clipped'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-coordinator-edge-clipped'),
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
      instrumentDevice: createStudioGrandDeviceDescriptor(DEVICE_ID),
      name: 'Piano',
      trackId: TRACK_ID,
    }),
  )
  requireCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId: CLIP_ID,
      color: null,
      loop: null,
      muted: false,
      name: 'Edge-clipped Phrase',
      sourceId: SOURCE_ID,
      sourceLengthTick: parsePositiveTick(2_880),
      sourceOffsetTick: parseTick(0),
      spanTick: parsePositiveTick(1_920),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    }),
  )
  requireCommitted(
    session,
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parsePositiveTick(2_400),
      noteId: NOTE_ID,
      pitch: parseMidiPitch(60),
      sourceId: SOURCE_ID,
      startTick: parseTick(0),
      velocity: parseMidiVelocity(100),
    }),
  )
  return session
}

function addSecondPlayableTrack(session: ProjectSession): void {
  addPlayableTrack(session, {
    clipId: SECOND_CLIP_ID,
    deviceId: SECOND_DEVICE_ID,
    insertAt: 1,
    noteId: SECOND_TRACK_NOTE_ID,
    pitch: parseMidiPitch(64),
    sourceId: SECOND_SOURCE_ID,
    trackId: SECOND_TRACK_ID,
  })
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
    expect(coordinator.state.positionProjectSecond).toBe(0)
    expect(coordinator.readVisualPosition()).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.5,
      positionTick: 960,
    })
    expect(coordinator.pause()).toBe(true)
    expect(coordinator.state.phase).toBe('paused')
    expect(prepared.generations).toEqual([1, 2])
    expect(prepared.allNotesOffCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    expect(coordinator.returnToLastStartPosition()).toBe(true)
    expect(coordinator.state).toMatchObject({ phase: 'stopped', positionProjectSecond: 0 })
    expect(prepared.generations).toEqual([1, 2, 3])
    expect(prepared.allNotesOffCount).toBe(2)
    coordinator.dispose()
    expect(runtime.disposeCount).toBe(1)
  })

  it('silently previews a Playing locate and resumes from the committed target', async () => {
    const projectId = parseProjectId('project-playback-locate-playing')
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
    prepared.currentTime = parsePlaybackClockSecond(0.25)
    const locate = coordinator.beginTimelineLocate()

    expect(locate?.startedWhilePlaying).toBe(true)
    expect(coordinator.state.phase).toBe('paused')
    expect(prepared.generations).toEqual([1, 2])
    expect(prepared.allNotesOffCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    expect(locate?.commit(parseTick(1_920))).toBe(true)
    expect(runtime.plans).toHaveLength(1)
    expect(coordinator.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 1,
    })
    expect(coordinator.readVisualPosition().positionTick).toBe(1_920)
    expect(prepared.generations).toEqual([1, 2, 4])
    expect(prepared.scheduled).toHaveLength(1)

    expect(coordinator.returnToLastStartPosition()).toBe(true)
    expect(coordinator.state).toMatchObject({ phase: 'stopped', positionProjectSecond: 1 })
    coordinator.dispose()
  })

  it('cancels a Playing locate preview at its frozen position without changing the return anchor', async () => {
    const projectId = parseProjectId('project-playback-locate-cancel')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    await coordinator.play()
    const prepared = runtime.prepared[0]!
    prepared.currentTime = parsePlaybackClockSecond(0.25)
    const locate = coordinator.beginTimelineLocate()

    expect(locate?.cancel()).toBe(true)
    expect(locate?.cancel()).toBe(false)
    expect(runtime.plans).toHaveLength(1)
    expect(coordinator.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.25,
    })
    expect(prepared.generations).toEqual([1, 2, 3])
    expect(coordinator.returnToLastStartPosition()).toBe(true)
    expect(coordinator.state.positionProjectSecond).toBe(0)
    coordinator.dispose()
  })

  it('updates a pending Loading start and does not chase a Note active before the target', async () => {
    const projectId = parseProjectId('project-playback-locate-loading')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new DeferredProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    const play = coordinator.play()
    expect(coordinator.state.phase).toBe('loading')
    expect(coordinator.locateAtTick(parseTick(480))).toBe(true)
    expect(coordinator.state).toMatchObject({
      phase: 'loading',
      positionProjectSecond: 0.25,
    })

    const prepared = runtime.resolve(0, parsePlaybackClockSecond(10))
    await expect(play).resolves.toBe(true)
    expect(coordinator.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.25,
    })
    expect(prepared.scheduled).toHaveLength(0)
    coordinator.dispose()
  })

  it('locates an Empty Plan without preparing the audio runtime', () => {
    const projectId = parseProjectId('project-playback-locate-empty')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Empty locate Project',
      tempoEventId: parseTempoEventId('tempo-playback-locate-empty'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-playback-locate-empty'),
    })
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })

    expect(coordinator.state.planStatus).toBe('empty')
    expect(coordinator.locateAtTick(parseTick(1_920))).toBe(true)
    expect(coordinator.readVisualPosition()).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 1,
      positionTick: 1_920,
    })
    expect(runtime.plans).toEqual([])
    coordinator.dispose()
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

  it('retimes an active edge-clipped Voice when atomic Clip extension exposes its tail', async () => {
    const projectId = parseProjectId('project-playback-live-clip-extension')
    const session = createEdgeClippedPlayableSession(projectId)
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
      createExtendMidiClipWithNoteCommand({
        baseRevision: session.modelRevision,
        clipId: CLIP_ID,
        noteChannel: parseMidiChannel(0),
        noteDurationTick: parsePositiveTick(240),
        noteId: parseNoteId('note-playback-coordinator-clip-extension'),
        notePitch: parseMidiPitch(67),
        noteStartTick: parseTick(2_160),
        noteVelocity: parseMidiVelocity(100),
        spanTick: parsePositiveTick(2_880),
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(activeHandle.isActive()).toBe(true)
    expect(activeHandle.releaseUpdates).toEqual([1.25])
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('releases only the replaced Instrument Track and schedules its future Notes with the new Soundbank', async () => {
    const projectId = parseProjectId('project-playback-instrument-replace')
    const session = createPlayableSession(projectId)
    addSecondPlayableTrack(session)
    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(240),
        noteId: REPLACEMENT_FUTURE_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(720),
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
    const replacedTrackHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    const continuingTrackHandle = requireVoiceHandle(
      firstRuntime,
      runtime.plans[0]!,
      SECOND_TRACK_NOTE_ID,
    )
    firstRuntime.currentTime = 0.1 as typeof firstRuntime.currentTime

    const commit = requireCommitted(
      session,
      createReplaceInstrumentDeviceCommand({
        baseRevision: session.modelRevision,
        instrumentDevice: createSampleInstrumentDescriptor(DEVICE_ID, REPLACEMENT_SOUNDBANK_ID),
        trackId: TRACK_ID,
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(coordinator.state.modelRevision).toBe(session.modelRevision))

    expect(replacedTrackHandle.isActive()).toBe(false)
    expect(replacedTrackHandle.cancelCalls).toEqual([0.1])
    expect(continuingTrackHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(
      runtime.preparationOptions.map(({ instrumentFailureMode }) => instrumentFailureMode),
    ).toEqual([
      PROJECT_PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
      PROJECT_PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
    ])

    const nextRuntime = runtime.prepared[1]!
    expect(nextRuntime.scheduled).toEqual([])
    nextRuntime.currentTime = 0.2 as typeof nextRuntime.currentTime
    timer.fire()
    expect(nextRuntime.scheduled).toEqual([
      expect.objectContaining({
        pitch: 67,
        soundbankId: REPLACEMENT_SOUNDBANK_ID,
        startPlaybackClockSecond: 0.375,
        trackId: TRACK_ID,
      }),
    ])
    coordinator.dispose()
  })

  it('keeps unrelated Tracks playing and reports a missing replacement Soundbank', async () => {
    const projectId = parseProjectId('project-playback-instrument-missing')
    const session = createPlayableSession(projectId)
    addSecondPlayableTrack(session)
    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(240),
        noteId: REPLACEMENT_FUTURE_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(720),
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
    const replacedTrackHandle = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    const continuingTrackHandle = requireVoiceHandle(
      firstRuntime,
      runtime.plans[0]!,
      SECOND_TRACK_NOTE_ID,
    )
    firstRuntime.currentTime = 0.1 as typeof firstRuntime.currentTime
    const cause = new Error('Replacement manifest is unavailable')
    runtime.preparationFailures = [Object.freeze({ cause, soundbankId: MISSING_SOUNDBANK_ID })]

    const commit = requireCommitted(
      session,
      createReplaceInstrumentDeviceCommand({
        baseRevision: session.modelRevision,
        instrumentDevice: createSampleInstrumentDescriptor(DEVICE_ID, MISSING_SOUNDBANK_ID),
        trackId: TRACK_ID,
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(coordinator.state.modelRevision).toBe(session.modelRevision))

    expect(replacedTrackHandle.isActive()).toBe(false)
    expect(continuingTrackHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state).toMatchObject({
      failureCause: [expect.objectContaining({ cause, soundbankId: MISSING_SOUNDBANK_ID })],
      feedback: {
        kind: 'warning',
        message: expect.stringContaining(MISSING_SOUNDBANK_ID),
      },
      phase: 'playing',
    })
    const nextRuntime = runtime.prepared[1]!
    nextRuntime.currentTime = 0.2 as typeof nextRuntime.currentTime
    timer.fire()
    expect(nextRuntime.scheduled).toEqual([])
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('hands off an empty Track addition and its Undo without interrupting existing Voices', async () => {
    const projectId = parseProjectId('project-playback-track-lifecycle')
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

    const addCommit = requireCommitted(
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
        insertAt: 1,
        instrumentDevice: createStudioGrandDeviceDescriptor(SECOND_DEVICE_ID),
        name: 'Empty Piano',
        trackId: SECOND_TRACK_ID,
      }),
    )
    activeProject.publishCommit(addCommit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))
    expect(activeHandle.isActive()).toBe(true)

    const addedTrackRuntime = runtime.prepared[1]!
    addedTrackRuntime.currentTime = 0.1 as typeof addedTrackRuntime.currentTime
    activeProject.publishCommit(requireUndo(session))
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(3))

    expect(activeHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
    })
    coordinator.dispose()
  })

  it('hands off an empty Clip addition and its Undo without interrupting existing Voices', async () => {
    const projectId = parseProjectId('project-playback-clip-lifecycle')
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

    const addCommit = requireCommitted(
      session,
      createAddMidiClipCommand({
        baseRevision: session.modelRevision,
        clipId: LIFECYCLE_CLIP_ID,
        color: null,
        loop: null,
        muted: false,
        name: 'Future Empty Clip',
        sourceId: LIFECYCLE_SOURCE_ID,
        sourceLengthTick: parsePositiveTick(960),
        sourceOffsetTick: parseTick(0),
        spanTick: parsePositiveTick(960),
        startTick: parseTick(1_920),
        trackId: TRACK_ID,
      }),
    )
    activeProject.publishCommit(addCommit)
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))
    expect(activeHandle.isActive()).toBe(true)

    const addedClipRuntime = runtime.prepared[1]!
    addedClipRuntime.currentTime = 0.1 as typeof addedClipRuntime.currentTime
    activeProject.publishCommit(requireUndo(session))
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(3))

    expect(activeHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(coordinator.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
    })
    coordinator.dispose()
  })

  it('aborts stale preparation and installs only the latest continuous Commit revision', async () => {
    const projectId = parseProjectId('project-playback-latest-revision')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new DeferredProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    const initialPlay = coordinator.play()
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(1))
    const firstRuntime = runtime.resolve(0, parsePlaybackClockSecond(0))
    await expect(initialPlay).resolves.toBe(true)
    const activeHandle = requireVoiceHandle(firstRuntime, runtime.requests[0]!.plan, NOTE_ID)
    firstRuntime.currentTime = parsePlaybackClockSecond(0.1)

    const firstCommit = requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: RAPID_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_200),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(firstCommit)
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(2))

    const latestCommit = requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: LATEST_NOTE_ID,
        pitch: parseMidiPitch(69),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_440),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(latestCommit)
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(3))
    expect(runtime.requests[1]?.signal.aborted).toBe(true)

    const staleRuntime = runtime.resolve(1, parsePlaybackClockSecond(0.1))
    await vi.waitFor(() => expect(staleRuntime.disposeCount).toBe(1))
    const latestRuntime = runtime.resolve(2, parsePlaybackClockSecond(0.1))
    await vi.waitFor(() => expect(coordinator.state.modelRevision).toBe(session.modelRevision))

    expect(activeHandle.isActive()).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(0)
    expect(latestRuntime.generations).toEqual([2])
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('falls back to a stopped full Snapshot when the observed Commit chain has a gap', async () => {
    const projectId = parseProjectId('project-playback-commit-gap')
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

    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: RAPID_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_200),
        velocity: parseMidiVelocity(100),
      }),
    )
    const latestCommit = requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: LATEST_NOTE_ID,
        pitch: parseMidiPitch(69),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_440),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(latestCommit)
    await vi.waitFor(() => expect(coordinator.state.phase).toBe('stopped'))

    expect(coordinator.state.modelRevision).toBe(session.modelRevision)
    expect(firstRuntime.allNotesOffCount).toBe(1)
    expect(firstRuntime.disposeCount).toBe(1)
    expect(runtime.prepared).toHaveLength(1)
    await expect(coordinator.play()).resolves.toBe(true)
    expect(runtime.plans.at(-1)?.modelRevision).toBe(session.modelRevision)
    coordinator.dispose()
  })

  it('fails on the latest Project revision when selective preparation cannot continue safely', async () => {
    const projectId = parseProjectId('project-playback-reconciliation-failure')
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
    const cause = new Error('AudioContext was interrupted during preparation')
    runtime.failure = cause

    const commit = requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: RAPID_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_200),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(coordinator.state.phase).toBe('failed'))

    expect(coordinator.state).toMatchObject({
      failureCause: cause,
      modelRevision: session.modelRevision,
    })
    expect(firstRuntime.allNotesOffCount).toBe(1)
    expect(firstRuntime.disposeCount).toBe(1)
    runtime.failure = null
    await expect(coordinator.play()).resolves.toBe(true)
    expect(runtime.plans.at(-1)?.modelRevision).toBe(session.modelRevision)
    coordinator.dispose()
  })

  it('reports an all-notes-off failure instead of leaving Transport and UI state divergent', async () => {
    const projectId = parseProjectId('project-playback-pause-failure')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    await coordinator.play()
    const prepared = runtime.prepared[0]!
    const cause = new Error('Voice release failed')
    prepared.allNotesOffFailure = cause
    const revisionBefore = session.modelRevision

    expect(coordinator.pause()).toBe(false)

    expect(coordinator.state).toMatchObject({
      failureCause: cause,
      modelRevision: revisionBefore,
      phase: 'failed',
    })
    expect(prepared.disposeCount).toBe(1)
    expect(session.modelRevision).toBe(revisionBefore)
    coordinator.dispose()
  })

  it('cleans a retired release tail after a paused edit and resumes the handed-off Plan', async () => {
    const projectId = parseProjectId('project-playback-paused-edit')
    const session = createPlayableSession(projectId)
    const activeProject = createActiveProjectHarness(createReadyState(projectId, session))
    const runtime = new ControlledProjectPlaybackRuntime()
    runtime.voicesRemainActiveDuringRelease = true
    const timer = new ManualProjectPlaybackTimer()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer,
    })
    await coordinator.play()
    const firstRuntime = runtime.prepared[0]!
    const releaseTail = requireVoiceHandle(firstRuntime, runtime.plans[0]!, NOTE_ID)
    firstRuntime.currentTime = parsePlaybackClockSecond(0.1)
    runtime.currentTime = parsePlaybackClockSecond(0.1)
    expect(coordinator.pause()).toBe(true)
    expect(releaseTail.isActive()).toBe(true)
    expect(timer.callbacks.size).toBe(0)

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
    await vi.waitFor(() => expect(coordinator.state.modelRevision).toBe(session.modelRevision))

    expect(coordinator.state.phase).toBe('paused')
    expect(releaseTail.releaseUpdates).toEqual([])
    expect(firstRuntime.disposeCount).toBe(0)
    expect(timer.callbacks.size).toBe(1)
    releaseTail.finish()
    timer.fire()
    expect(firstRuntime.disposeCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    const handedOffRuntime = runtime.prepared.at(-1)
    await expect(coordinator.play()).resolves.toBe(true)
    expect(runtime.prepared).toHaveLength(2)
    expect(runtime.prepared.at(-1)).toBe(handedOffRuntime)
    expect(handedOffRuntime?.generations).toEqual([3, 4])
    expect(coordinator.state.phase).toBe('playing')
    coordinator.dispose()
  })

  it('aborts an in-flight handoff when a different Active Project takes ownership', async () => {
    const firstProjectId = parseProjectId('project-playback-pending-first')
    const firstSession = createPlayableSession(firstProjectId)
    const activeProject = createActiveProjectHarness(createReadyState(firstProjectId, firstSession))
    const runtime = new DeferredProjectPlaybackRuntime()
    const coordinator = createProjectPlaybackCoordinator({
      activeProject: activeProject.service,
      runtime,
      timer: new ManualProjectPlaybackTimer(),
    })
    const initialPlay = coordinator.play()
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(1))
    const firstRuntime = runtime.resolve(0, parsePlaybackClockSecond(0))
    await initialPlay
    firstRuntime.currentTime = parsePlaybackClockSecond(0.1)

    const commit = requireCommitted(
      firstSession,
      createAddNoteCommand({
        baseRevision: firstSession.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(120),
        noteId: RAPID_NOTE_ID,
        pitch: parseMidiPitch(67),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_200),
        velocity: parseMidiVelocity(100),
      }),
    )
    activeProject.publishCommit(commit)
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(2))

    const secondProjectId = parseProjectId('project-playback-pending-second')
    const secondSession = createPlayableSession(secondProjectId)
    activeProject.publish(createReadyState(secondProjectId, secondSession))
    expect(runtime.requests[1]?.signal.aborted).toBe(true)
    expect(firstRuntime.allNotesOffCount).toBe(1)
    expect(firstRuntime.disposeCount).toBe(1)

    const staleRuntime = runtime.resolve(1, parsePlaybackClockSecond(0.1))
    await vi.waitFor(() => expect(staleRuntime.disposeCount).toBe(1))
    expect(coordinator.state).toMatchObject({
      modelRevision: secondSession.modelRevision,
      phase: 'stopped',
      projectId: secondProjectId,
    })
    coordinator.dispose()
    expect(activeProject.observers.size).toBe(0)
    expect(activeProject.commitObservers.size).toBe(0)
  })

  it('lets a visual sample publish retained natural end and stop Scheduler waking', async () => {
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

    prepared.currentTime = 300 as typeof prepared.currentTime
    const visualPosition = coordinator.readVisualPosition()

    expect(visualPosition).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 300,
      positionTick: 576_000,
    })
    expect(coordinator.state).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 300,
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

  it('resets visual position while Active Project ownership changes', async () => {
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
    prepared.currentTime = 0.5 as typeof prepared.currentTime
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
    expect(prepared.allNotesOffCount).toBe(1)
    expect(prepared.disposeCount).toBe(1)

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
    expect(() => coordinator.readVisualPosition()).toThrowError(
      expect.objectContaining({ code: 'coordinator-disposed' }),
    )
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
    expect(coordinator.returnToLastStartPosition()).toBe(true)
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
