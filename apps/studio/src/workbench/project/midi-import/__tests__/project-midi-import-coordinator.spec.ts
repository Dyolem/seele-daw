import type { MidiFileDecoder, MidiFileDocument } from '@seele-daw/midi-file'
import { parseProjectId } from '@seele-daw/project-core'
import type { LocalFileByteReader } from '@seele-daw/platform-browser'
import { createStudioGrandDeviceDescriptor } from '@seele-daw/playback'
import type {
  ProjectMidiImportIdFactory,
  ProjectMidiInstrumentDeviceFactory,
} from '@seele-daw/project-midi'
import { describe, expect, it, vi } from 'vitest'

import {
  createProjectMidiImportCoordinator,
  type ProjectMidiImportCoordinatorDependencies,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  PROJECT_NAVIGATION_CONFIRMATION_FAILURE_OPERATION,
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_INTENT_KIND,
  PROJECT_NAVIGATION_PROCEED_REASON,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'

function createMidiDocument(overrides: Partial<MidiFileDocument> = {}): MidiFileDocument {
  return {
    format: 1,
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
  const createInstrumentDevice = vi.fn<ProjectMidiInstrumentDeviceFactory>(({ id }) =>
    createStudioGrandDeviceDescriptor(id),
  )
  const createFromSession = vi.fn<
    ProjectMidiImportCoordinatorDependencies['activeProject']['createFromSession']
  >(async (session) => session.getSnapshot().project.id)
  const confirm = vi.fn<ProjectNavigationConfirmationCoordinator['confirm']>(async () =>
    Object.freeze({
      activeProjectId: null,
      kind: PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.PROCEED,
      reason: PROJECT_NAVIGATION_PROCEED_REASON.NOT_READY,
    }),
  )
  const coordinator = createProjectMidiImportCoordinator({
    activeProject: { createFromSession },
    createId,
    createInstrumentDevice,
    decoder: { decode },
    fileReader: { read },
    navigationConfirmation: { confirm },
  })

  return {
    bytes,
    confirm,
    coordinator,
    createFromSession,
    createId,
    createInstrumentDevice,
    decode,
    read,
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
    expect(session?.modelRevision).toBe(0)
    expect(result).toEqual({
      projectId: 'project-0',
      diagnostics: [],
      summary: {
        sourceFormat: 1,
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
