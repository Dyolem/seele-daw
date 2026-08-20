import type { MidiFileDocument, MidiFileNote, MidiFileTrack } from '@seele-daw/midi-file'
import { createDeviceDescriptor, parseDeviceTypeId, type DeviceId } from '@seele-daw/project-core'
import type {
  CreateProjectMidiImportDraftInput,
  ProjectMidiImportIdFactory,
  ProjectMidiInstrumentDeviceFactory,
} from '#internal/index'

export function createMidiNote(overrides: Partial<MidiFileNote> = {}): MidiFileNote {
  return {
    tick: 0,
    durationTicks: 480,
    pitch: 60,
    velocity: 100,
    releaseVelocity: 0,
    ...overrides,
  }
}

export function createMidiTrack(overrides: Partial<MidiFileTrack> = {}): MidiFileTrack {
  return {
    name: 'Piano',
    channel: 0,
    programNumber: 0,
    notes: [createMidiNote()],
    controlChanges: [],
    pitchBends: [],
    ...overrides,
  }
}

export function createMidiDocument(overrides: Partial<MidiFileDocument> = {}): MidiFileDocument {
  return {
    format: 1,
    name: 'Imported Song',
    ppq: 480,
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    textEvents: [],
    tracks: [createMidiTrack()],
    ...overrides,
  }
}

export const createDeterministicImportId: ProjectMidiImportIdFactory = ({ kind, ordinal }) =>
  `${kind}-${ordinal}`

export const createTestInstrumentDevice: ProjectMidiInstrumentDeviceFactory = ({ id }) =>
  createDeviceDescriptor({
    id,
    typeId: parseDeviceTypeId('test.default-instrument'),
    definitionVersion: 1,
    enabled: true,
    parameters: {},
    opaqueState: { presetId: 'test-default' },
  })

export function createInstrumentDeviceWithId(
  id: DeviceId,
): ReturnType<typeof createDeviceDescriptor> {
  return createDeviceDescriptor({
    id,
    typeId: parseDeviceTypeId('test.default-instrument'),
    definitionVersion: 1,
    enabled: true,
    parameters: {},
    opaqueState: null,
  })
}

export function createImportInput(
  document: MidiFileDocument,
  overrides: Partial<Omit<CreateProjectMidiImportDraftInput, 'document'>> = {},
): CreateProjectMidiImportDraftInput {
  return {
    document,
    createId: createDeterministicImportId,
    createInstrumentDevice: createTestInstrumentDevice,
    ...overrides,
  }
}
