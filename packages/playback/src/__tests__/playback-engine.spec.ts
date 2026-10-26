import {
  DEVICE_DEFINITION_VERSION_MIN,
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddMidiSustainPedalEventCommand,
  createAddNoteCommand,
  createAddTempoEventCommand,
  createDeviceDescriptor,
  createExtendMidiClipWithNoteCommand,
  createInitialProjectSession,
  createMoveTempoEventCommand,
  createMoveNotesCommand,
  createRemoveTempoEventCommand,
  createRemoveNotesCommand,
  createReplaceInstrumentDeviceCommand,
  createReplaceTempoEventBpmCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseProjectId,
  parseTempoBpm,
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
import { describe, expect, it, vi } from 'vitest'

import type { AudibleMidiProjectPlan } from '#internal/compiler/audible-midi-plan'
import { createPlaybackEngine, type PlaybackEngine } from '#internal/engine/playback-engine'
import {
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
  type PlaybackRuntimePort,
  type PlaybackTimerPort,
} from '#internal/engine/playback-runtime'
import { parseSoundbankId, type SoundbankId } from '#internal/sample-instrument-device'
import { createStudioGrandDeviceDescriptor } from '#internal/studio-grand-device'
import { parsePlaybackClockSecond } from '#internal/time/project-time'
import {
  ControlledPlaybackRuntime,
  DeferredPlaybackRuntime,
  ManualPlaybackTimer,
  type ManualPlaybackVoice,
  type ManualPreparedPlaybackPlan,
} from '#internal/__tests__/support/fake-playback-runtime'
import { planSpans } from '#internal/__tests__/support/plan-spans'

const TRACK_ID = parseTrackId('track-playback-engine')
const DEVICE_ID = parseDeviceId('device-playback-engine')
const CLIP_ID = parseClipId('clip-playback-engine')
const SOURCE_ID = parseMidiSourceId('source-playback-engine')
const NOTE_ID = parseNoteId('note-playback-engine')
const SUSTAIN_PEDAL_DOWN_EVENT_ID = parseMidiSustainPedalEventId('pedal-down-playback-engine')
const SUSTAIN_PEDAL_UP_EVENT_ID = parseMidiSustainPedalEventId('pedal-up-playback-engine')
const SECOND_NOTE_ID = parseNoteId('note-playback-engine-second')
const FAR_NOTE_ID = parseNoteId('note-playback-engine-far')
const MOVED_NOTE_ID = parseNoteId('note-playback-engine-moved')
const SECOND_TRACK_ID = parseTrackId('track-playback-engine-second')
const SECOND_DEVICE_ID = parseDeviceId('device-playback-engine-second')
const SECOND_CLIP_ID = parseClipId('clip-playback-engine-second')
const SECOND_SOURCE_ID = parseMidiSourceId('source-playback-engine-second')
const SECOND_TRACK_NOTE_ID = parseNoteId('note-playback-engine-second-track')
const REPLACEMENT_SOUNDBANK_ID = parseSoundbankId('replacement-piano')
const MISSING_SOUNDBANK_ID = parseSoundbankId('missing-piano')
const LIFECYCLE_CLIP_ID = parseClipId('clip-playback-engine-lifecycle')
const LIFECYCLE_SOURCE_ID = parseMidiSourceId('source-playback-engine-lifecycle')
const REPLACEMENT_FUTURE_NOTE_ID = parseNoteId('note-playback-engine-replacement')
const RAPID_NOTE_ID = parseNoteId('note-playback-engine-rapid')
const LATEST_NOTE_ID = parseNoteId('note-playback-engine-latest')
const TEMPO_EVENT_ID = parseTempoEventId('tempo-playback-engine')
const SECOND_TEMPO_EVENT_ID = parseTempoEventId('tempo-playback-engine-second')
const SECOND_TEMPO_EVENT_TICK = parseTick(960)
const MOVED_TEMPO_EVENT_TICK = parseTick(1_440)
const SECOND_TEMPO_EVENT_BPM = parseTempoBpm(60)

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
    tempoEventId: TEMPO_EVENT_ID,
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-engine'),
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

function addSecondTempoEvent(session: ProjectSession): void {
  requireCommitted(
    session,
    createAddTempoEventCommand({
      baseRevision: session.modelRevision,
      bpm: SECOND_TEMPO_EVENT_BPM,
      tempoEventId: SECOND_TEMPO_EVENT_ID,
      tick: SECOND_TEMPO_EVENT_TICK,
    }),
  )
}

interface TempoEventLifecycleHandoffCase {
  readonly label: string
  readonly playbackClockSecondAtTargetTick: number
  readonly expectedProjectSecondAtTargetTick: number
  prepareSession(session: ProjectSession): void
  createCommand(session: ProjectSession): ProjectCommand
}

const TEMPO_EVENT_LIFECYCLE_HANDOFF_CASES = Object.freeze<
  readonly TempoEventLifecycleHandoffCase[]
>([
  {
    label: 'Add',
    playbackClockSecondAtTargetTick: 0.75,
    expectedProjectSecondAtTargetTick: 1,
    prepareSession: () => undefined,
    createCommand: (session) =>
      createAddTempoEventCommand({
        baseRevision: session.modelRevision,
        bpm: SECOND_TEMPO_EVENT_BPM,
        tempoEventId: SECOND_TEMPO_EVENT_ID,
        tick: SECOND_TEMPO_EVENT_TICK,
      }),
  },
  {
    label: 'Move',
    playbackClockSecondAtTargetTick: 1,
    expectedProjectSecondAtTargetTick: 0.75,
    prepareSession: addSecondTempoEvent,
    createCommand: (session) =>
      createMoveTempoEventCommand({
        baseRevision: session.modelRevision,
        tempoEventId: SECOND_TEMPO_EVENT_ID,
        tick: MOVED_TEMPO_EVENT_TICK,
      }),
  },
  {
    label: 'Remove',
    playbackClockSecondAtTargetTick: 1,
    expectedProjectSecondAtTargetTick: 0.75,
    prepareSession: addSecondTempoEvent,
    createCommand: (session) =>
      createRemoveTempoEventCommand({
        baseRevision: session.modelRevision,
        tempoEventId: SECOND_TEMPO_EVENT_ID,
      }),
  },
])

function createEdgeClippedPlayableSession(projectId: ProjectId): ProjectSession {
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Edge-clipped Audible Project',
    tempoEventId: parseTempoEventId('tempo-playback-engine-edge-clipped'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-playback-engine-edge-clipped'),
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

function requireVoice(
  prepared: ManualPreparedPlaybackPlan,
  plan: AudibleMidiProjectPlan,
  noteId: NoteId,
): ManualPlaybackVoice {
  const occurrenceKey = planSpans(plan).find((span) => span.noteId === noteId)?.occurrenceKey
  const voice = prepared.voices.find((candidate) => candidate.occurrenceKey === occurrenceKey)
  if (voice === undefined) throw new Error(`Expected scheduled Voice for Note ${noteId}`)
  return voice
}

function createLoadedEngine(
  session: ProjectSession,
  runtime: PlaybackRuntimePort,
  timer: PlaybackTimerPort = new ManualPlaybackTimer(),
): PlaybackEngine {
  const engine = createPlaybackEngine({ onStateChange: () => undefined, runtime, timer })
  engine.load(session.getSnapshot())
  return engine
}

describe('PlaybackEngine', () => {
  it('prepares before Playing, schedules the first window, pauses and returns safely', async () => {
    const projectId = parseProjectId('project-playback-engine')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)

    expect(engine.state.phase).toBe('stopped')
    expect(engine.canReturnToLastStartPosition()).toBe(false)
    const play = engine.play()
    expect(engine.state.phase).toBe('loading')
    await expect(play).resolves.toBe(true)

    const prepared = runtime.prepared[0]!
    expect(engine.state.phase).toBe('playing')
    expect(engine.canReturnToLastStartPosition()).toBe(true)
    expect(prepared.scheduled).toHaveLength(1)
    expect(timer.intervals).toEqual([25])

    runtime.currentTime = 0.5 as typeof runtime.currentTime
    timer.fire()
    expect(engine.state.positionProjectSecond).toBe(0)
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.5,
      positionTick: 960,
    })
    expect(engine.pause()).toBe(true)
    expect(engine.state.phase).toBe('paused')
    expect(runtime.allNotesOffCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    expect(engine.returnToLastStartPosition()).toBe(true)
    expect(engine.state).toMatchObject({ phase: 'stopped', positionProjectSecond: 0 })
    // Pause already faded every Voice, so Return has nothing left to silence.
    expect(runtime.allNotesOffCount).toBe(1)
    expect(engine.canReturnToLastStartPosition()).toBe(false)
    engine.dispose()
    expect(runtime.disposeCount).toBe(1)
  })

  it('keeps covered Notes playing and reports uncovered occurrences without a failure state', async () => {
    const projectId = parseProjectId('project-playback-note-coverage-partial')
    const session = createPlayableSession(projectId)
    requireCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parsePositiveTick(240),
        noteId: SECOND_NOTE_ID,
        pitch: parseMidiPitch(64),
        sourceId: SOURCE_ID,
        startTick: parseTick(480),
        velocity: parseMidiVelocity(100),
      }),
    )
    const runtime = new ControlledPlaybackRuntime()
    runtime.unsupportedNotePitches = [64]
    const engine = createLoadedEngine(session, runtime)

    await expect(engine.play()).resolves.toBe(true)

    expect(runtime.prepared[0]?.scheduled).toEqual([expect.objectContaining({ pitch: 60 })])
    expect(engine.state).toMatchObject({
      failureCause: null,
      phase: 'playing',
      unsupportedNoteOccurrences: [
        expect.objectContaining({ pitch: 64, reason: 'no-matching-zone' }),
      ],
    })
    engine.dispose()
  })

  it('stays stopped when every Note occurrence lacks a matching Sample Zone', async () => {
    const projectId = parseProjectId('project-playback-note-coverage-empty')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    runtime.unsupportedNotePitches = [60]
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)

    await expect(engine.play()).resolves.toBe(false)

    expect(engine.state).toMatchObject({
      failureCause: null,
      phase: 'stopped',
      unsupportedNoteOccurrences: [expect.objectContaining({ pitch: 60 })],
    })
    expect(runtime.prepared[0]?.scheduled).toEqual([])
    expect(timer.callbacks.size).toBe(0)

    await expect(engine.play()).resolves.toBe(false)
    expect(runtime.prepared).toHaveLength(1)
    engine.dispose()
  })

  it('silently previews a Playing locate and resumes from the committed target', async () => {
    const projectId = parseProjectId('project-playback-locate-playing')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)

    await engine.play()
    const prepared = runtime.prepared[0]!
    runtime.currentTime = parsePlaybackClockSecond(0.25)
    const locate = engine.beginTimelineLocate()

    expect(locate?.startedWhilePlaying).toBe(true)
    expect(engine.state.phase).toBe('paused')
    expect(runtime.allNotesOffCount).toBe(1)
    expect(timer.callbacks.size).toBe(0)

    expect(locate?.commit(parseTick(1_920))).toBe(true)
    expect(runtime.plans).toHaveLength(1)
    expect(engine.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 1,
    })
    expect(engine.readVisualPosition().positionTick).toBe(1_920)
    expect(prepared.scheduled).toHaveLength(1)

    expect(engine.returnToLastStartPosition()).toBe(true)
    expect(engine.state).toMatchObject({ phase: 'stopped', positionProjectSecond: 1 })
    engine.dispose()
  })

  it('cancels a Playing locate preview at its frozen position without changing the return anchor', async () => {
    const projectId = parseProjectId('project-playback-locate-cancel')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)

    await engine.play()
    runtime.currentTime = parsePlaybackClockSecond(0.25)
    const locate = engine.beginTimelineLocate()

    expect(locate?.cancel()).toBe(true)
    expect(locate?.cancel()).toBe(false)
    expect(runtime.plans).toHaveLength(1)
    expect(engine.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.25,
    })
    expect(engine.returnToLastStartPosition()).toBe(true)
    expect(engine.state.positionProjectSecond).toBe(0)
    engine.dispose()
  })

  it('updates a pending Loading start and does not chase a Note active before the target', async () => {
    const projectId = parseProjectId('project-playback-locate-loading')
    const session = createPlayableSession(projectId)
    const runtime = new DeferredPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)

    const play = engine.play()
    expect(engine.state.phase).toBe('loading')
    expect(engine.locateAtTick(parseTick(480))).toBe(true)
    expect(engine.state).toMatchObject({
      phase: 'loading',
      positionProjectSecond: 0.25,
    })

    const prepared = runtime.resolve(0, parsePlaybackClockSecond(10))
    await expect(play).resolves.toBe(true)
    expect(engine.state).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.25,
    })
    expect(prepared.scheduled).toHaveLength(0)
    engine.dispose()
  })

  it('locates an Empty Plan without preparing the audio runtime', () => {
    const projectId = parseProjectId('project-playback-locate-empty')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Empty locate Project',
      tempoEventId: parseTempoEventId('tempo-playback-locate-empty'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-playback-locate-empty'),
    })
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)

    expect(engine.state.plan?.status).toBe('empty')
    expect(engine.locateAtTick(parseTick(1_920))).toBe(true)
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 1,
      positionTick: 1_920,
    })
    expect(runtime.plans).toEqual([])
    engine.dispose()
  })

  it('hands off a far-future Note addition without interrupting the active Voice', async () => {
    const projectId = parseProjectId('project-playback-live-add')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(engine.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
      positionProjectSecond: 0.1,
    })
    expect(activeVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    engine.dispose()
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
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const removedVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    const continuingVoice = requireVoice(firstPrepared, runtime.plans[0]!, SECOND_NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

    const commit = requireCommitted(
      session,
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        noteIds: [NOTE_ID],
        sourceId: SOURCE_ID,
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(removedVoice.isActive()).toBe(false)
    expect(removedVoice.cancelCalls).toEqual([0.1])
    expect(continuingVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
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
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    const queuedVoice = requireVoice(firstPrepared, runtime.plans[0]!, MOVED_NOTE_ID)
    runtime.currentTime = 0.05 as typeof runtime.currentTime

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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(queuedVoice.isActive()).toBe(false)
    expect(queuedVoice.cancelCalls).toEqual([0.05])
    expect(activeVoice.isActive()).toBe(true)
    expect(runtime.prepared[1]?.scheduled).toEqual([])

    const nextPrepared = runtime.prepared[1]!
    runtime.currentTime = 0.2 as typeof runtime.currentTime
    timer.fire()
    expect(nextPrepared.scheduled).toEqual([
      expect.objectContaining({ pitch: 68, startPlaybackClockSecond: 0.375 }),
    ])
    engine.dispose()
  })

  it('retimes the release of an active resized Note without restarting its Voice', async () => {
    const projectId = parseProjectId('project-playback-live-resize')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(activeVoice.isActive()).toBe(true)
    expect(activeVoice.releaseUpdates).toEqual([0.75])
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('retimes an active Voice to Pedal Up without restarting playback', async () => {
    const projectId = parseProjectId('project-playback-live-sustain-pedal')
    const session = createPlayableSession(projectId)
    requireCommitted(
      session,
      createAddMidiSustainPedalEventCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        eventId: SUSTAIN_PEDAL_UP_EVENT_ID,
        sourceId: SOURCE_ID,
        tick: parseTick(1_440),
        value: parseMidiControlValue(0),
      }),
    )
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

    const commit = requireCommitted(
      session,
      createAddMidiSustainPedalEventCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        eventId: SUSTAIN_PEDAL_DOWN_EVENT_ID,
        sourceId: SOURCE_ID,
        tick: parseTick(0),
        value: parseMidiControlValue(127),
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(activeVoice.isActive()).toBe(true)
    expect(activeVoice.releaseUpdates).toEqual([0.75])
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('retimes an active edge-clipped Voice when atomic Clip extension exposes its tail', async () => {
    const projectId = parseProjectId('project-playback-live-clip-extension')
    const session = createEdgeClippedPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

    const commit = requireCommitted(
      session,
      createExtendMidiClipWithNoteCommand({
        baseRevision: session.modelRevision,
        clipId: CLIP_ID,
        noteChannel: parseMidiChannel(0),
        noteDurationTick: parsePositiveTick(240),
        noteId: parseNoteId('note-playback-engine-clip-extension'),
        notePitch: parseMidiPitch(67),
        noteStartTick: parseTick(2_160),
        noteVelocity: parseMidiVelocity(100),
        spanTick: parsePositiveTick(2_880),
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))

    expect(activeVoice.isActive()).toBe(true)
    expect(activeVoice.releaseUpdates).toEqual([1.25])
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
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
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const replacedTrackVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    const continuingTrackVoice = requireVoice(
      firstPrepared,
      runtime.plans[0]!,
      SECOND_TRACK_NOTE_ID,
    )
    runtime.currentTime = 0.1 as typeof runtime.currentTime

    const commit = requireCommitted(
      session,
      createReplaceInstrumentDeviceCommand({
        baseRevision: session.modelRevision,
        instrumentDevice: createSampleInstrumentDescriptor(DEVICE_ID, REPLACEMENT_SOUNDBANK_ID),
        trackId: TRACK_ID,
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(replacedTrackVoice.isActive()).toBe(false)
    expect(replacedTrackVoice.cancelCalls).toEqual([0.1])
    expect(continuingTrackVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(
      runtime.preparationOptions.map(({ instrumentFailureMode }) => instrumentFailureMode),
    ).toEqual([
      PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
      PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
    ])

    const nextPrepared = runtime.prepared[1]!
    expect(nextPrepared.scheduled).toEqual([])
    runtime.currentTime = 0.2 as typeof runtime.currentTime
    timer.fire()
    expect(nextPrepared.scheduled).toEqual([
      expect.objectContaining({
        pitch: 67,
        soundbankId: REPLACEMENT_SOUNDBANK_ID,
        startPlaybackClockSecond: 0.375,
        trackId: TRACK_ID,
      }),
    ])
    engine.dispose()
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
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const replacedTrackVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    const continuingTrackVoice = requireVoice(
      firstPrepared,
      runtime.plans[0]!,
      SECOND_TRACK_NOTE_ID,
    )
    runtime.currentTime = 0.1 as typeof runtime.currentTime
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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(replacedTrackVoice.isActive()).toBe(false)
    expect(continuingTrackVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state).toMatchObject({
      failureCause: null,
      phase: 'playing',
      preparationFailures: [{ cause, soundbankId: MISSING_SOUNDBANK_ID }],
    })
    const nextPrepared = runtime.prepared[1]!
    runtime.currentTime = 0.2 as typeof runtime.currentTime
    timer.fire()
    expect(nextPrepared.scheduled).toEqual([])
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('hands off an empty Track addition and its Undo without interrupting existing Voices', async () => {
    const projectId = parseProjectId('project-playback-track-lifecycle')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

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
    engine.commit(addCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))
    expect(activeVoice.isActive()).toBe(true)

    engine.commit(requireUndo(session), () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(3))

    expect(activeVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
    })
    engine.dispose()
  })

  it('hands off an empty Clip addition and its Undo without interrupting existing Voices', async () => {
    const projectId = parseProjectId('project-playback-clip-lifecycle')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const activeVoice = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = 0.1 as typeof runtime.currentTime

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
    engine.commit(addCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(2))
    expect(activeVoice.isActive()).toBe(true)

    engine.commit(requireUndo(session), () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.prepared).toHaveLength(3))

    expect(activeVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state).toMatchObject({
      modelRevision: session.modelRevision,
      phase: 'playing',
    })
    engine.dispose()
  })

  it('aborts stale preparation and installs only the latest continuous Commit revision', async () => {
    const projectId = parseProjectId('project-playback-latest-revision')
    const session = createPlayableSession(projectId)
    const runtime = new DeferredPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    const initialPlay = engine.play()
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(1))
    const firstPrepared = runtime.resolve(0, parsePlaybackClockSecond(0))
    await expect(initialPlay).resolves.toBe(true)
    const activeVoice = requireVoice(firstPrepared, runtime.requests[0]!.plan, NOTE_ID)
    runtime.currentTime = parsePlaybackClockSecond(0.1)

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
    engine.commit(firstCommit, () => session.getSnapshot())
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
    engine.commit(latestCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(3))
    expect(runtime.requests[1]?.signal.aborted).toBe(true)

    const stale = runtime.resolve(1, parsePlaybackClockSecond(0.1))
    const latest = runtime.resolve(2, parsePlaybackClockSecond(0.1))
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(activeVoice.isActive()).toBe(true)
    expect(runtime.allNotesOffCount).toBe(0)
    expect(engine.state.phase).toBe('playing')

    runtime.currentTime = parsePlaybackClockSecond(0.6)
    timer.fire()
    expect(stale.scheduled).toEqual([])
    expect(latest.scheduled.map(({ pitch }) => pitch)).toEqual([67, 69])
    engine.dispose()
  })

  it('falls back to a stopped full Snapshot when the observed Commit chain has a gap', async () => {
    const projectId = parseProjectId('project-playback-commit-gap')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()

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
    engine.commit(latestCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.phase).toBe('stopped'))

    expect(engine.state.modelRevision).toBe(session.modelRevision)
    expect(runtime.allNotesOffCount).toBe(1)
    expect(runtime.prepared).toHaveLength(1)
    await expect(engine.play()).resolves.toBe(true)
    expect(runtime.plans.at(-1)?.modelRevision).toBe(session.modelRevision)
    engine.dispose()
  })

  it('fails on the latest Project revision when selective preparation cannot continue safely', async () => {
    const projectId = parseProjectId('project-playback-reconciliation-failure')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.phase).toBe('failed'))

    expect(engine.state).toMatchObject({
      failureCause: cause,
      modelRevision: session.modelRevision,
    })
    expect(runtime.allNotesOffCount).toBe(1)
    runtime.failure = null
    await expect(engine.play()).resolves.toBe(true)
    expect(runtime.plans.at(-1)?.modelRevision).toBe(session.modelRevision)
    engine.dispose()
  })

  it('reports an all-notes-off failure instead of leaving Transport and UI state divergent', async () => {
    const projectId = parseProjectId('project-playback-pause-failure')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    await engine.play()
    const cause = new Error('Voice release failed')
    runtime.allNotesOffFailure = cause
    const revisionBefore = session.modelRevision

    expect(engine.pause()).toBe(false)

    expect(engine.state).toMatchObject({
      failureCause: cause,
      modelRevision: revisionBefore,
      phase: 'failed',
    })
    expect(session.modelRevision).toBe(revisionBefore)
    engine.dispose()
  })

  it('leaves fading Voices alone across a paused edit and resumes the handed-off Plan', async () => {
    const projectId = parseProjectId('project-playback-paused-edit')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    runtime.voicesRemainActiveDuringRelease = true
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const firstPrepared = runtime.prepared[0]!
    const fading = requireVoice(firstPrepared, runtime.plans[0]!, NOTE_ID)
    runtime.currentTime = parsePlaybackClockSecond(0.1)
    expect(engine.pause()).toBe(true)
    expect(fading.cancelCalls).toEqual([undefined])
    expect(fading.isActive()).toBe(true)
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
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(engine.state.phase).toBe('paused')
    expect(fading.releaseUpdates).toEqual([])

    const handedOff = runtime.prepared.at(-1)
    await expect(engine.play()).resolves.toBe(true)
    expect(runtime.prepared).toHaveLength(2)
    expect(runtime.prepared.at(-1)).toBe(handedOff)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('keeps a stopped musical position when a Tempo commit changes its Project time', async () => {
    const projectId = parseProjectId('project-playback-tempo-stopped')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)
    expect(engine.locateAtTick(parseTick(1_920))).toBe(true)

    const commit = requireCommitted(
      session,
      createReplaceTempoEventBpmCommand({
        baseRevision: session.modelRevision,
        bpm: parseTempoBpm(60),
        tempoEventId: TEMPO_EVENT_ID,
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(engine.state).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 2,
    })
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 2,
      positionTick: 1_920,
    })
    expect(runtime.plans).toEqual([])
    engine.dispose()
  })

  it('pauses a Playing Tempo commit at the same Tick and waits for an explicit resume', async () => {
    const projectId = parseProjectId('project-playback-tempo-playing')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    runtime.currentTime = parsePlaybackClockSecond(0.25)

    const commit = requireCommitted(
      session,
      createReplaceTempoEventBpmCommand({
        baseRevision: session.modelRevision,
        bpm: parseTempoBpm(60),
        tempoEventId: TEMPO_EVENT_ID,
      }),
    )
    engine.commit(commit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

    expect(engine.state).toMatchObject({
      phase: 'paused',
      positionProjectSecond: 0.5,
    })
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'paused',
      positionProjectSecond: 0.5,
      positionTick: 480,
    })
    expect(runtime.allNotesOffCount).toBe(1)
    expect(runtime.plans).toHaveLength(1)
    expect(timer.callbacks.size).toBe(0)

    await expect(engine.play()).resolves.toBe(true)
    expect(runtime.plans).toHaveLength(2)
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.5,
      positionTick: 480,
    })
    engine.dispose()
  })

  it.each(TEMPO_EVENT_LIFECYCLE_HANDOFF_CASES)(
    'keeps a stopped musical position across a Tempo Event $label commit',
    async (testCase) => {
      const projectId = parseProjectId(
        `project-playback-tempo-${testCase.label.toLowerCase()}-stopped`,
      )
      const session = createPlayableSession(projectId)
      testCase.prepareSession(session)
      const runtime = new ControlledPlaybackRuntime()
      const engine = createLoadedEngine(session, runtime)
      expect(engine.locateAtTick(MOVED_TEMPO_EVENT_TICK)).toBe(true)

      const commit = requireCommitted(session, testCase.createCommand(session))
      engine.commit(commit, () => session.getSnapshot())
      await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

      expect(engine.state).toMatchObject({
        phase: 'stopped',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
      })
      expect(engine.readVisualPosition()).toMatchObject({
        phase: 'stopped',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
        positionTick: MOVED_TEMPO_EVENT_TICK,
      })
      expect(runtime.plans).toEqual([])
      engine.dispose()
    },
  )

  it('recognizes Tempo Map changes in Undo and Redo commits', async () => {
    const projectId = parseProjectId('project-playback-tempo-history-handoff')
    const session = createPlayableSession(projectId)
    const engine = createLoadedEngine(session, new ControlledPlaybackRuntime())
    expect(engine.locateAtTick(MOVED_TEMPO_EVENT_TICK)).toBe(true)

    const addCommit = requireCommitted(
      session,
      createAddTempoEventCommand({
        baseRevision: session.modelRevision,
        bpm: SECOND_TEMPO_EVENT_BPM,
        tempoEventId: SECOND_TEMPO_EVENT_ID,
        tick: SECOND_TEMPO_EVENT_TICK,
      }),
    )
    engine.commit(addCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))
    expect(engine.readVisualPosition()).toMatchObject({
      positionProjectSecond: 1,
      positionTick: MOVED_TEMPO_EVENT_TICK,
    })

    const undoCommit = requireUndo(session)
    engine.commit(undoCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))
    expect(engine.readVisualPosition()).toMatchObject({
      positionProjectSecond: 0.75,
      positionTick: MOVED_TEMPO_EVENT_TICK,
    })

    const redoCommit = session.redo()
    if (redoCommit === null) throw new Error('Expected Tempo Event Redo to commit')
    engine.commit(redoCommit, () => session.getSnapshot())
    await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))
    expect(engine.readVisualPosition()).toMatchObject({
      positionProjectSecond: 1,
      positionTick: MOVED_TEMPO_EVENT_TICK,
    })
    engine.dispose()
  })

  it.each(TEMPO_EVENT_LIFECYCLE_HANDOFF_CASES)(
    'keeps a paused musical position across a Tempo Event $label commit',
    async (testCase) => {
      const projectId = parseProjectId(
        `project-playback-tempo-${testCase.label.toLowerCase()}-paused`,
      )
      const session = createPlayableSession(projectId)
      testCase.prepareSession(session)
      const runtime = new ControlledPlaybackRuntime()
      const timer = new ManualPlaybackTimer()
      const engine = createLoadedEngine(session, runtime, timer)
      await engine.play()
      const targetClockSecond = parsePlaybackClockSecond(testCase.playbackClockSecondAtTargetTick)
      runtime.currentTime = targetClockSecond
      expect(engine.pause()).toBe(true)
      expect(engine.readVisualPosition().positionTick).toBe(MOVED_TEMPO_EVENT_TICK)

      const commit = requireCommitted(session, testCase.createCommand(session))
      engine.commit(commit, () => session.getSnapshot())
      await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

      expect(engine.state).toMatchObject({
        phase: 'paused',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
      })
      expect(engine.readVisualPosition()).toMatchObject({
        phase: 'paused',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
        positionTick: MOVED_TEMPO_EVENT_TICK,
      })
      expect(runtime.allNotesOffCount).toBe(1)
      expect(runtime.plans).toHaveLength(1)
      expect(timer.callbacks.size).toBe(0)

      await expect(engine.play()).resolves.toBe(true)
      expect(runtime.plans).toHaveLength(2)
      expect(engine.readVisualPosition()).toMatchObject({
        phase: 'playing',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
        positionTick: MOVED_TEMPO_EVENT_TICK,
      })
      engine.dispose()
    },
  )

  it.each(TEMPO_EVENT_LIFECYCLE_HANDOFF_CASES)(
    'pauses at the same musical position for a Playing Tempo Event $label commit',
    async (testCase) => {
      const projectId = parseProjectId(
        `project-playback-tempo-${testCase.label.toLowerCase()}-playing`,
      )
      const session = createPlayableSession(projectId)
      testCase.prepareSession(session)
      const runtime = new ControlledPlaybackRuntime()
      const timer = new ManualPlaybackTimer()
      const engine = createLoadedEngine(session, runtime, timer)
      await engine.play()
      const targetClockSecond = parsePlaybackClockSecond(testCase.playbackClockSecondAtTargetTick)
      runtime.currentTime = targetClockSecond

      const commit = requireCommitted(session, testCase.createCommand(session))
      engine.commit(commit, () => session.getSnapshot())
      await vi.waitFor(() => expect(engine.state.modelRevision).toBe(session.modelRevision))

      expect(engine.state).toMatchObject({
        phase: 'paused',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
      })
      expect(engine.readVisualPosition()).toMatchObject({
        phase: 'paused',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
        positionTick: MOVED_TEMPO_EVENT_TICK,
      })
      expect(runtime.allNotesOffCount).toBe(1)
      expect(runtime.plans).toHaveLength(1)
      expect(timer.callbacks.size).toBe(0)

      await expect(engine.play()).resolves.toBe(true)
      expect(runtime.plans).toHaveLength(2)
      expect(engine.readVisualPosition()).toMatchObject({
        phase: 'playing',
        positionProjectSecond: testCase.expectedProjectSecondAtTargetTick,
        positionTick: MOVED_TEMPO_EVENT_TICK,
      })
      engine.dispose()
    },
  )

  it('aborts an in-flight handoff when another Project loads', async () => {
    const firstProjectId = parseProjectId('project-playback-pending-first')
    const firstSession = createPlayableSession(firstProjectId)
    const runtime = new DeferredPlaybackRuntime()
    const engine = createLoadedEngine(firstSession, runtime)
    const initialPlay = engine.play()
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(1))
    runtime.resolve(0, parsePlaybackClockSecond(0))
    await initialPlay
    runtime.currentTime = parsePlaybackClockSecond(0.1)

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
    engine.commit(commit, () => firstSession.getSnapshot())
    await vi.waitFor(() => expect(runtime.requests).toHaveLength(2))

    const secondProjectId = parseProjectId('project-playback-pending-second')
    const secondSession = createPlayableSession(secondProjectId)
    engine.load(secondSession.getSnapshot())
    expect(runtime.requests[1]?.signal.aborted).toBe(true)
    expect(runtime.allNotesOffCount).toBe(1)

    runtime.resolve(1, parsePlaybackClockSecond(0.1))
    expect(runtime.prepared[1]?.scheduled).toEqual([])
    expect(engine.state).toMatchObject({
      modelRevision: secondSession.modelRevision,
      phase: 'stopped',
    })
    engine.dispose()
  })

  it('drops the position when the Project unloads and starts the next one stopped', async () => {
    const firstSession = createPlayableSession(parseProjectId('project-playback-first'))
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(firstSession, runtime)
    await engine.play()
    runtime.currentTime = 0.5 as typeof runtime.currentTime
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'playing',
      positionProjectSecond: 0.5,
      positionTick: 960,
    })

    engine.unload()
    expect(engine.state.phase).toBe('unavailable')
    expect(engine.readVisualPosition()).toMatchObject({
      phase: 'unavailable',
      positionProjectSecond: 0,
      positionTick: 0,
    })
    expect(runtime.allNotesOffCount).toBe(1)

    const secondSession = createPlayableSession(parseProjectId('project-playback-second'))
    engine.load(secondSession.getSnapshot())
    expect(engine.readVisualPosition()).toMatchObject({
      modelRevision: secondSession.modelRevision,
      phase: 'stopped',
      positionProjectSecond: 0,
      positionTick: 0,
    })

    engine.dispose()
    expect(runtime.disposeCount).toBe(1)
    expect(() => engine.readVisualPosition()).toThrowError('Playback is disposed')
  })

  it('rejects Play for an Empty Plan without preparing the runtime', async () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('project-playback-empty'),
      projectName: 'Empty Project',
      tempoEventId: parseTempoEventId('tempo-playback-empty'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-playback-empty'),
    })
    const runtime = new ControlledPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)

    expect(engine.state).toMatchObject({ phase: 'stopped', plan: { status: 'empty' } })
    await expect(engine.play()).rejects.toThrowError('no playable plan')
    expect(runtime.plans).toEqual([])
    engine.dispose()
  })

  it('lets a visual sample publish retained natural end and stop Scheduler waking', async () => {
    const projectId = parseProjectId('project-playback-natural-end')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const prepared = runtime.prepared[0]!
    const completedVoice = requireVoice(prepared, runtime.plans[0]!, NOTE_ID)
    completedVoice.finish()

    runtime.currentTime = 300 as typeof runtime.currentTime
    const visualPosition = engine.readVisualPosition()

    expect(visualPosition).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 300,
      positionTick: 576_000,
    })
    expect(engine.state).toMatchObject({
      phase: 'stopped',
      positionProjectSecond: 300,
    })
    expect(timer.callbacks.size).toBe(0)
    expect(runtime.allNotesOffCount).toBe(0)
    engine.dispose()
  })

  it('lets a natural-end release tail ring out and replays the prepared Plan', async () => {
    const projectId = parseProjectId('project-playback-natural-end-release-tail')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const timer = new ManualPlaybackTimer()
    const engine = createLoadedEngine(session, runtime, timer)
    await engine.play()
    const prepared = runtime.prepared[0]!
    const releaseTail = requireVoice(prepared, runtime.plans[0]!, NOTE_ID)

    runtime.currentTime = 300 as typeof runtime.currentTime
    expect(engine.readVisualPosition().phase).toBe('stopped')
    expect(releaseTail.isActive()).toBe(true)
    expect(releaseTail.cancelCalls).toEqual([])
    expect(runtime.allNotesOffCount).toBe(0)
    expect(timer.callbacks.size).toBe(0)

    await expect(engine.play()).resolves.toBe(true)
    expect(runtime.prepared).toEqual([prepared])
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('reports runtime failures without changing Project facts and allows retry', async () => {
    const projectId = parseProjectId('project-playback-retry')
    const session = createPlayableSession(projectId)
    const runtime = new ControlledPlaybackRuntime()
    const failure = new Error('Manifest request failed')
    runtime.failure = failure
    const engine = createLoadedEngine(session, runtime)
    const revisionBefore = session.modelRevision

    await expect(engine.play()).resolves.toBe(false)
    expect(engine.state).toMatchObject({
      failureCause: failure,
      phase: 'failed',
    })
    expect(session.modelRevision).toBe(revisionBefore)

    runtime.failure = null
    await expect(engine.play()).resolves.toBe(true)
    expect(engine.state.phase).toBe('playing')
    engine.dispose()
  })

  it('aborts a pending load when Return to Last Start Position wins the request race', async () => {
    const projectId = parseProjectId('project-playback-loading-return')
    const session = createPlayableSession(projectId)
    const runtime = new DeferredPlaybackRuntime()
    const engine = createLoadedEngine(session, runtime)

    const play = engine.play()
    expect(engine.state.phase).toBe('loading')
    expect(engine.returnToLastStartPosition()).toBe(true)
    expect(runtime.requests[0]?.signal.aborted).toBe(true)
    runtime.resolve(0, parsePlaybackClockSecond(0))
    await expect(play).resolves.toBe(false)
    expect(runtime.prepared[0]?.scheduled).toEqual([])
    expect(engine.state.phase).toBe('stopped')
    engine.dispose()
  })
})
