import type { MidiFileDecoder, MidiFileDocument } from '@seele-daw/midi-file'
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
  const coordinator = createProjectMidiImportCoordinator({
    activeProject: { createFromSession },
    createId,
    createInstrumentDevice,
    decoder: { decode },
    fileReader: { read },
  })

  return { bytes, coordinator, createFromSession, createId, createInstrumentDevice, decode, read }
}

describe('ProjectMidiImportCoordinator', () => {
  it('validates every upstream boundary before creating one durable active Project', async () => {
    const fixture = createFixture()
    const file = new File([fixture.bytes], 'Long Song.mid', { type: 'audio/midi' })

    const result = await fixture.coordinator.importLocalFile(file)

    expect(fixture.read).toHaveBeenCalledExactlyOnceWith(file)
    expect(fixture.decode).toHaveBeenCalledExactlyOnceWith(fixture.bytes)
    expect(fixture.createFromSession).toHaveBeenCalledOnce()
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
