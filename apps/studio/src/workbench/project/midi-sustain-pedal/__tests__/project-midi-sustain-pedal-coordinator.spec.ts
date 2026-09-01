import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  createAddMidiClipCommand,
  createInitialProjectSession,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiSourceId,
  parsePositiveTick,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type ClipId,
  type ProjectSession,
  type TrackId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  createProjectMidiSustainPedalCoordinator,
  type ProjectMidiSustainPedalCoordinator,
} from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import { ProjectMidiSustainPedalError } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-error'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

function createReadyState(session: ProjectSession): ReadyActiveProjectState {
  const snapshot = session.getSnapshot()
  return Object.freeze({
    contentStateId: session.contentStateId,
    isDirty: false,
    modelRevision: session.modelRevision,
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: snapshot.project.id,
    recoveryFailures: Object.freeze([]),
    savedContentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    saveFailure: null,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    session,
  })
}

function createIdentitySource(...identities: string[]): () => string {
  let index = 0
  return () => {
    const identity = identities[index]
    if (identity === undefined) throw new Error('Test identity source exhausted')
    index += 1
    return identity
  }
}

interface SustainPedalFixture {
  readonly clipId: ClipId
  readonly coordinator: ProjectMidiSustainPedalCoordinator
  readonly session: ProjectSession
  readonly trackId: TrackId
}

function createFixture(identity: string, looped = false): SustainPedalFixture {
  const session = createInitialProjectSession({
    projectId: parseProjectId(`${identity}-project`),
    projectName: 'Sustain Pedal Coordinator',
    tempoEventId: parseTempoEventId(`${identity}-tempo`),
    timeSignatureEventId: parseTimeSignatureEventId(`${identity}-meter`),
  })
  const readyState = createReadyState(session)
  const track = createProjectTrackCoordinator({
    activeProject: { state: readyState },
    createRandomValue: () => 0,
    createUniqueId: createIdentitySource(`${identity}-track`, `${identity}-device`),
  }).addInstrumentTrack()
  const clipId = parseClipId(`${identity}-clip`)
  const sourceId = parseMidiSourceId(`${identity}-source`)
  const result = session.execute(
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId,
      color: null,
      loop: looped
        ? { sourceSpanTick: parsePositiveTick(960), sourceStartTick: parseTick(0) }
        : null,
      muted: false,
      name: 'Pedal Clip',
      sourceId,
      sourceLengthTick: parsePositiveTick(looped ? 960 : 1_440),
      sourceOffsetTick: parseTick(looped ? 0 : 480),
      spanTick: parsePositiveTick(960),
      startTick: parseTick(1_920),
      trackId: track.trackId,
    }),
  )
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Fixture Clip creation unexpectedly produced no change')
  }

  return Object.freeze({
    clipId,
    coordinator: createProjectMidiSustainPedalCoordinator({
      activeProject: { state: readyState },
      createUniqueId: createIdentitySource(
        `${identity}-event-1`,
        `${identity}-event-2`,
        `${identity}-event-3`,
      ),
    }),
    session,
    trackId: track.trackId,
  })
}

function sustainPedalEvents(session: ProjectSession) {
  return session.getSnapshot().midiSustainPedalEventPartitions.flatMap(({ events }) => events)
}

describe('ProjectMidiSustainPedalCoordinator', () => {
  it('maps Clip-local placement into Source time and commits exactly one undoable CC64 event', () => {
    const fixture = createFixture('clip-placement')
    const revision = fixture.session.modelRevision
    const result = fixture.coordinator.placeInClip({
      baseRevision: revision,
      channel: parseMidiChannel(2),
      clipId: fixture.clipId,
      clipTick: parseTick(120),
      value: parseMidiControlValue(64),
    })

    expect(Object.isFrozen(fixture.coordinator)).toBe(true)
    expect(result).toMatchObject({ clipId: fixture.clipId, eventId: 'clip-placement-event-1' })
    expect(result.commit.origin).toEqual({
      commandType: PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD,
      kind: 'command',
    })
    expect(result.commit.baseRevision).toBe(revision)
    expect(result.commit.modelRevision).toBe(revision + 1)
    expect(sustainPedalEvents(fixture.session)).toEqual([
      {
        channel: 2,
        id: 'clip-placement-event-1',
        tick: 600,
        value: 64,
      },
    ])

    fixture.session.undo()
    expect(sustainPedalEvents(fixture.session)).toEqual([])
    fixture.session.redo()
    expect(sustainPedalEvents(fixture.session)).toHaveLength(1)
  })

  it('accepts the Clip endpoint as an explicit terminal event', () => {
    const fixture = createFixture('clip-endpoint')

    fixture.coordinator.placeInClip({
      baseRevision: fixture.session.modelRevision,
      channel: parseMidiChannel(0),
      clipId: fixture.clipId,
      clipTick: parseTick(960),
      value: parseMidiControlValue(0),
    })

    expect(sustainPedalEvents(fixture.session)[0]).toMatchObject({ tick: 1_440, value: 0 })
  })

  it('maps global Track time only through the explicit Active Clip', () => {
    const fixture = createFixture('track-placement')

    fixture.coordinator.placeOnTrack({
      activeClipId: fixture.clipId,
      baseRevision: fixture.session.modelRevision,
      channel: parseMidiChannel(0),
      projectTick: parseTick(2_160),
      trackId: fixture.trackId,
      value: parseMidiControlValue(127),
    })

    expect(sustainPedalEvents(fixture.session)[0]).toMatchObject({ tick: 720, value: 127 })
  })

  it('reports missing Active Clip, outside placement, stale authority and looped targets', () => {
    const fixture = createFixture('blocked')
    const input = {
      activeClipId: fixture.clipId,
      baseRevision: fixture.session.modelRevision,
      channel: parseMidiChannel(0),
      projectTick: parseTick(2_160),
      trackId: fixture.trackId,
      value: parseMidiControlValue(64),
    } as const

    expect(() => fixture.coordinator.placeOnTrack({ ...input, activeClipId: null })).toThrowError(
      expect.objectContaining<Partial<ProjectMidiSustainPedalError>>({
        code: 'track-active-clip-required',
      }),
    )
    expect(() =>
      fixture.coordinator.placeOnTrack({ ...input, projectTick: parseTick(3_000) }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectMidiSustainPedalError>>({
        code: 'timeline-tick-outside-clip',
      }),
    )

    fixture.coordinator.placeOnTrack(input)
    expect(() => fixture.coordinator.placeOnTrack(input)).toThrowError(
      expect.objectContaining<Partial<ProjectMidiSustainPedalError>>({
        code: 'track-placement-stale',
      }),
    )

    const looped = createFixture('looped', true)
    expect(() =>
      looped.coordinator.placeInClip({
        baseRevision: looped.session.modelRevision,
        channel: parseMidiChannel(0),
        clipId: looped.clipId,
        clipTick: parseTick(0),
        value: parseMidiControlValue(127),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectMidiSustainPedalError>>({
        code: 'target-clip-looped',
      }),
    )
  })
})
