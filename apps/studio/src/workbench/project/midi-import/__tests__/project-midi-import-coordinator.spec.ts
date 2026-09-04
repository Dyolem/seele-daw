import {
  createStandardMidiFileSourceEnvelope,
  type MidiFileDecoder,
  type MidiFileDocument,
} from '@seele-daw/midi-file'
import {
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
} from '@seele-daw/project-core'
import type { LocalFileByteReader } from '@seele-daw/platform-browser'
import {
  createStudioGrandDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
} from '@seele-daw/playback'
import {
  PROJECT_MIDI_INSTRUMENT_MAPPING_KIND,
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  type ProjectMidiImportIdFactory,
  type ProjectMidiInstrumentDeviceFactory,
} from '@seele-daw/project-midi'
import { describe, expect, it, vi } from 'vitest'

import {
  createProjectMidiImportCoordinator,
  type ProjectMidiImportCoordinatorDependencies,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  ControlledProjectCheckpointStore,
  createCheckpointIdFactory,
} from '@/workbench/project/__tests__/active-project-test-support'
import { createActiveProjectService } from '@/workbench/project/active-project-service'
import {
  createStudioMidiImportInstrumentDevice,
  decodeMidiProgramPlaceholderDeviceState,
} from '@/workbench/instrument/midi-import-instrument-policy'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectState,
} from '@/workbench/project/active-project-state'
import {
  PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION,
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_INTENT_KIND,
  PROJECT_NAVIGATION_PROCEED_REASON,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { PROJECT_TRACK_PALETTE } from '@/workbench/project/track/project-track-palette'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

function createMidiDocument(overrides: Partial<MidiFileDocument> = {}): MidiFileDocument {
  return {
    format: 1,
    sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
    name: '',
    ppq: 960,
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    textEvents: [],
    tracks: [
      {
        name: 'Piano',
        channel: 0,
        programNumber: 0,
        notes: [{ tick: 0, durationTicks: 960, pitch: 60, velocity: 100, releaseVelocity: 0 }],
        controlChanges: [],
        pitchBends: [],
      },
    ],
    ...overrides,
  }
}

function createFixture(document: MidiFileDocument = createMidiDocument()) {
  const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64])
  const read = vi.fn<LocalFileByteReader['read']>(async () => bytes)
  const decode = vi.fn<MidiFileDecoder['decode']>(() => document)
  const createId = vi.fn<ProjectMidiImportIdFactory>(({ kind, ordinal }) => `${kind}-${ordinal}`)
  const createInstrumentDevice = vi.fn<ProjectMidiInstrumentDeviceFactory>(({ id }) => ({
    device: createStudioGrandDeviceDescriptor(id),
    mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
  }))
  const createRandomValue = vi.fn<() => number>(() => 0)
  const createFromSession = vi.fn<
    ProjectMidiImportCoordinatorDependencies['activeProject']['createFromSession']
  >(async (session) => session.getSnapshot().project.id)
  const activeSession = createInitialProjectSession({
    projectId: parseProjectId('current-project'),
    projectName: 'Current Project',
    tempoEventId: parseTempoEventId('current-tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('current-meter'),
  })
  let activeState: ActiveProjectState = Object.freeze({
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId: activeSession.getSnapshot().project.id,
    session: activeSession,
    modelRevision: activeSession.modelRevision,
    contentStateId: activeSession.contentStateId,
    savedRevision: activeSession.modelRevision,
    savedContentStateId: activeSession.contentStateId,
    isDirty: false,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    saveFailure: null,
    recoveryFailures: Object.freeze([]),
  })
  const confirm = vi.fn<ProjectNavigationConfirmationCoordinator['confirm']>(async () =>
    Object.freeze({
      activeProjectId: null,
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.NOT_READY,
    }),
  )
  const coordinator = createProjectMidiImportCoordinator({
    activeProject: {
      get state() {
        return activeState
      },
      createFromSession,
    },
    createId,
    createInstrumentDevice,
    createRandomValue,
    decoder: { decode },
    fileReader: { read },
    navigationConfirmation: { confirm },
  })

  return {
    activeSession,
    bytes,
    confirm,
    coordinator,
    createFromSession,
    createId,
    createInstrumentDevice,
    createRandomValue,
    decode,
    read,
    setActiveState(nextState: ActiveProjectState) {
      activeState = nextState
    },
  }
}

describe('ProjectMidiImportCoordinator', () => {
  it('validates every upstream boundary before creating one durable active Project', async () => {
    const fixture = createFixture()
    const file = new File([fixture.bytes], 'Long Song.mid', { type: 'audio/midi' })

    const result = await fixture.coordinator.importLocalFile(file)

    expect(fixture.read).toHaveBeenCalledExactlyOnceWith(file)
    expect(fixture.decode).toHaveBeenCalledExactlyOnceWith(fixture.bytes)
    expect(fixture.createFromSession).toHaveBeenCalledOnce()
    expect(fixture.confirm).not.toHaveBeenCalled()
    const session = fixture.createFromSession.mock.calls[0]?.[0]
    expect(session?.getSnapshot().project).toMatchObject({ id: 'project-0', name: 'Long Song' })
    expect(session?.getSnapshot().tracks[0]?.color).toBe(PROJECT_TRACK_PALETTE[0])
    expect(session?.getSnapshot().clips[0]?.color).toBeNull()
    expect(session?.modelRevision).toBe(0)
    expect(result).toEqual({
      projectId: 'project-0',
      diagnostics: [],
      summary: {
        sourceFormat: 1,
        sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
        sourcePpq: 960,
        sourceTrackCount: 1,
        importedTrackCount: 1,
        importedNoteCount: 1,
      },
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(fixture.read.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.decode.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(fixture.decode.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.createFromSession.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('validates the file before confirming the latest active Project and replacing it', async () => {
    const fixture = createFixture()
    const file = new File([fixture.bytes], 'Workbench Song.mid', { type: 'audio/midi' })

    const result = await fixture.coordinator.importLocalFileReplacingActiveProject(file)

    expect(fixture.confirm).toHaveBeenCalledExactlyOnceWith({
      kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
    })
    expect(result?.projectId).toBe('project-0')
    expect(fixture.decode.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.confirm.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(fixture.confirm.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.createFromSession.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('appends imported Tracks to the ready Session without replacing its timeline or lifecycle', async () => {
    const fixture = createFixture()
    const before = fixture.activeSession.getSnapshot()
    const file = new File([fixture.bytes], 'Current Tracks.mid', { type: 'audio/midi' })

    const result = await fixture.coordinator.importLocalFileAsNewTracks(file, parseTick(7_680))
    const after = fixture.activeSession.getSnapshot()

    expect(fixture.read).toHaveBeenCalledExactlyOnceWith(file)
    expect(fixture.decode).toHaveBeenCalledExactlyOnceWith(fixture.bytes)
    expect(fixture.createFromSession).not.toHaveBeenCalled()
    expect(fixture.confirm).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      projectId: before.project.id,
      importedTrackIds: ['track-0'],
      summary: {
        importedTrackCount: 1,
        importedNoteCount: 1,
        sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
      },
    })
    expect(after.project).toBe(before.project)
    expect(after.tempoEvents).toEqual(before.tempoEvents)
    expect(after.timeSignatureEvents).toEqual(before.timeSignatureEvents)
    expect(after.trackOrder).toEqual(['track-0'])
    expect(after.clips).toEqual([expect.objectContaining({ startTick: 7_680, trackId: 'track-0' })])
    expect(after.modelRevision).toBe(before.modelRevision + 1)
    expect(fixture.activeSession.canUndo).toBe(true)

    fixture.activeSession.undo()
    expect(fixture.activeSession.getSnapshot().trackOrder).toEqual([])
  })

  it('uses the Studio Program and Channel 10 policy for current-Project Track import', async () => {
    const baseTrack = createMidiDocument().tracks[0]!
    const fixture = createFixture(
      createMidiDocument({
        tracks: [
          {
            ...baseTrack,
            name: 'Violin',
            channel: 0,
            programNumber: 40,
            controlChanges: [
              { tick: 0, controller: 7, value: 64 },
              { tick: 0, controller: 10, value: 127 },
            ],
          },
          { ...baseTrack, name: 'Drums', channel: 9, programNumber: 47 },
          { ...baseTrack, name: 'Unsupported Synth', channel: 2, programNumber: 80 },
        ],
      }),
    )
    fixture.createInstrumentDevice.mockImplementation(createStudioMidiImportInstrumentDevice)

    const result = await fixture.coordinator.importLocalFileAsNewTracks(
      new File([], 'score.mid'),
      parseTick(0),
    )
    const devices = fixture.activeSession.getSnapshot().devices
    const tracks = fixture.activeSession.getSnapshot().tracks

    expect(devices.slice(0, 2).map(decodeSampleInstrumentDeviceState)).toEqual([
      { soundbankId: 'solo-violin' },
      { soundbankId: 'general-midi-percussion' },
    ])
    expect(decodeMidiProgramPlaceholderDeviceState(devices[2]!)).toEqual({
      channel: 2,
      programNumber: 80,
    })
    expect(tracks[0]?.channel.gain).toBeCloseTo(64 / 127, 12)
    expect(tracks[0]?.channel.pan).toBe(1)
    expect(tracks.slice(1).map(({ channel }) => channel)).toEqual([
      { gain: 1, pan: 0, muted: false, soloed: false },
      { gain: 1, pan: 0, muted: false, soloed: false },
    ])
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_UNAVAILABLE,
        sourceProgramNumber: 80,
        sourceTrackIndex: 2,
      }),
    )
  })

  it('lets ActiveProject derive dirty and return to its save point after one Undo', async () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('active-current-project'),
      projectName: 'Active Current Project',
      tempoEventId: parseTempoEventId('active-current-tempo'),
      timeSignatureEventId: parseTimeSignatureEventId('active-current-meter'),
    })
    const activeProject = createActiveProjectService({
      checkpointStore: new ControlledProjectCheckpointStore(),
      createCheckpointId: createCheckpointIdFactory('midi-track-import-checkpoint'),
      createNewSession: () => session,
      createProjectId: () => parseProjectId('unused-created-project'),
    })
    await activeProject.createFromSession(session)
    const document = createMidiDocument()
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64])
    const coordinator = createProjectMidiImportCoordinator({
      activeProject,
      createId: ({ kind, ordinal }) => `active-import-${kind}-${ordinal}`,
      createInstrumentDevice: ({ id }) => ({
        device: createStudioGrandDeviceDescriptor(id),
        mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
      }),
      createRandomValue: () => 0,
      decoder: { decode: () => document },
      fileReader: { read: async () => bytes },
      navigationConfirmation: {
        confirm: vi.fn<ProjectNavigationConfirmationCoordinator['confirm']>(),
      },
    })

    await coordinator.importLocalFileAsNewTracks(
      new File([bytes], 'active-tracks.mid'),
      parseTick(0),
    )
    await Promise.resolve()

    expect(activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.READY,
      isDirty: true,
      modelRevision: 1,
    })
    expect(session.canUndo).toBe(true)

    session.undo()
    await Promise.resolve()
    expect(activeProject.state).toMatchObject({
      phase: ACTIVE_PROJECT_PHASE.READY,
      isDirty: false,
      modelRevision: 2,
    })
    activeProject.dispose()
  })

  it('uses the Studio palette for a batch while avoiding each adjacent Track color', async () => {
    const fixture = createFixture(
      createMidiDocument({
        tracks: [
          createMidiDocument().tracks[0]!,
          { ...createMidiDocument().tracks[0]!, name: 'Strings', channel: 1 },
        ],
      }),
    )
    const existingTrack = createProjectTrackCoordinator({
      activeProject: {
        get state() {
          return {
            phase: ACTIVE_PROJECT_PHASE.READY,
            projectId: fixture.activeSession.getSnapshot().project.id,
            session: fixture.activeSession,
            modelRevision: fixture.activeSession.modelRevision,
            contentStateId: fixture.activeSession.contentStateId,
            savedRevision: fixture.activeSession.modelRevision,
            savedContentStateId: fixture.activeSession.contentStateId,
            isDirty: false,
            saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
            saveFailure: null,
            recoveryFailures: Object.freeze([]),
          }
        },
      },
      createRandomValue: () => 0,
      createUniqueId: (() => {
        const ids = ['existing-track', 'existing-device']
        return () => ids.shift() ?? 'unused-existing-id'
      })(),
    }).addInstrumentTrack()

    await fixture.coordinator.importLocalFileAsNewTracks(new File([], 'palette.mid'), parseTick(0))

    const snapshot = fixture.activeSession.getSnapshot()
    expect(existingTrack.trackId).toBe('existing-track')
    expect(snapshot.trackOrder).toEqual(['existing-track', 'track-0', 'track-1'])
    expect(snapshot.tracks.map((track) => track.color)).toEqual([
      PROJECT_TRACK_PALETTE[0],
      PROJECT_TRACK_PALETTE[1],
      PROJECT_TRACK_PALETTE[0],
    ])
    expect(snapshot.clips.map((clip) => clip.color)).toEqual([null, null])
  })

  it('rechecks the latest Active Project after file decoding before appending Tracks', async () => {
    const fixture = createFixture()
    fixture.read.mockImplementationOnce(async () => {
      fixture.setActiveState(Object.freeze({ phase: ACTIVE_PROJECT_PHASE.IDLE }))
      return fixture.bytes
    })

    await expect(
      fixture.coordinator.importLocalFileAsNewTracks(
        new File([], 'stale-target.mid'),
        parseTick(0),
      ),
    ).rejects.toThrow('only be imported while a Project is ready')
    expect(fixture.decode).toHaveBeenCalledOnce()
    expect(fixture.activeSession.getSnapshot().trackOrder).toEqual([])
  })

  it('does not create a Project when validated Workbench replacement is cancelled', async () => {
    const fixture = createFixture()
    fixture.confirm.mockResolvedValueOnce(
      Object.freeze({
        activeProjectId: parseProjectId('current-project'),
        kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED,
      }),
    )

    await expect(
      fixture.coordinator.importLocalFileReplacingActiveProject(new File([], 'cancelled.mid')),
    ).resolves.toBeNull()
    expect(fixture.read).toHaveBeenCalledOnce()
    expect(fixture.decode).toHaveBeenCalledOnce()
    expect(fixture.createFromSession).not.toHaveBeenCalled()
  })

  it('propagates a failed Workbench navigation decision without creating a Project', async () => {
    const fixture = createFixture()
    const failureCause = new Error('current Project could not be saved')
    fixture.confirm.mockResolvedValueOnce(
      Object.freeze({
        activeProjectId: parseProjectId('current-project'),
        failureCause,
        kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED,
        operation: PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION.SAVE_PROJECT,
      }),
    )

    await expect(
      fixture.coordinator.importLocalFileReplacingActiveProject(new File([], 'failed.mid')),
    ).rejects.toBe(failureCause)
    expect(fixture.read).toHaveBeenCalledOnce()
    expect(fixture.decode).toHaveBeenCalledOnce()
    expect(fixture.createFromSession).not.toHaveBeenCalled()
  })

  it('does not request abandonment permission for an invalid Workbench MIDI file', async () => {
    const fixture = createFixture()
    const decodeFailure = new Error('malformed SMF')
    fixture.decode.mockImplementationOnce(() => {
      throw decodeFailure
    })

    await expect(
      fixture.coordinator.importLocalFileReplacingActiveProject(new File([], 'broken.mid')),
    ).rejects.toBe(decodeFailure)
    expect(fixture.confirm).not.toHaveBeenCalled()
    expect(fixture.createFromSession).not.toHaveBeenCalled()
  })

  it('prefers an embedded MIDI project name over the local file name', async () => {
    const fixture = createFixture(createMidiDocument({ name: 'Embedded Composition' }))

    await fixture.coordinator.importLocalFile(new File([], 'Fallback Name.midi'))

    expect(fixture.createFromSession.mock.calls[0]?.[0].getSnapshot().project.name).toBe(
      'Embedded Composition',
    )
  })

  it('does not enter the Project lifecycle when reading or decoding fails', async () => {
    const readFailure = new Error('local file permission revoked')
    const readFixture = createFixture()
    readFixture.read.mockRejectedValueOnce(readFailure)

    await expect(
      readFixture.coordinator.importLocalFile(new File([], 'unreadable.mid')),
    ).rejects.toBe(readFailure)
    expect(readFixture.decode).not.toHaveBeenCalled()
    expect(readFixture.createFromSession).not.toHaveBeenCalled()

    const decodeFailure = new Error('malformed SMF')
    const decodeFixture = createFixture()
    decodeFixture.decode.mockImplementationOnce(() => {
      throw decodeFailure
    })

    await expect(
      decodeFixture.coordinator.importLocalFile(new File([], 'broken.mid')),
    ).rejects.toBe(decodeFailure)
    expect(decodeFixture.createFromSession).not.toHaveBeenCalled()
  })

  it('does not enter the Project lifecycle when the imported Session cannot be built', async () => {
    const fixture = createFixture()
    const mappingFailure = new Error('default instrument unavailable')
    fixture.createInstrumentDevice.mockImplementationOnce(() => {
      throw mappingFailure
    })

    await expect(
      fixture.coordinator.importLocalFile(new File([], 'mapping.mid')),
    ).rejects.toMatchObject({
      code: 'instrument-device-factory-failed',
      cause: mappingFailure,
    })
    expect(fixture.createFromSession).not.toHaveBeenCalled()
  })

  it('propagates initial persistence failure without reporting an import result', async () => {
    const fixture = createFixture()
    const persistenceFailure = new Error('initial checkpoint transaction aborted')
    fixture.createFromSession.mockRejectedValueOnce(persistenceFailure)

    await expect(fixture.coordinator.importLocalFile(new File([], 'song.mid'))).rejects.toBe(
      persistenceFailure,
    )
    expect(fixture.createFromSession).toHaveBeenCalledOnce()
  })
})
