import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  parseDeviceId,
  parseDeviceTypeId,
  parseMidiChannel,
  type DeviceDescriptor,
  type DeviceId,
} from '@seele-daw/project-core'
import { createSampleInstrumentDeviceDescriptor } from '@seele-daw/playback'
import {
  PROJECT_MIDI_INSTRUMENT_MAPPING_KIND,
  type ProjectMidiInstrumentDeviceFactory,
} from '@seele-daw/project-midi'

import {
  BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND,
  GENERAL_MIDI_PERCUSSION_INSTRUMENT,
  findGeneralMidiProgramRoute,
} from '@/workbench/instrument/built-in-instrument-catalogue'

const GENERAL_MIDI_PERCUSSION_CHANNEL = 9

export const MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION = Object.freeze({
  definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
  typeId: parseDeviceTypeId('seele.midi-program-placeholder'),
})

export interface MidiProgramPlaceholderDeviceState {
  readonly channel: number
  readonly programNumber: number
}

function parseProgramNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 127) {
    throw new RangeError('MIDI Program number must be an integer from 0 through 127')
  }
  return value
}

/** Persists an understood but unsupported Program without inventing a playable Soundbank. */
export function createMidiProgramPlaceholderDeviceDescriptor(
  id: DeviceId,
  channelInput: unknown,
  programNumberInput: unknown,
): DeviceDescriptor {
  const channel = parseMidiChannel(channelInput)
  const programNumber = parseProgramNumber(programNumberInput)
  return createDeviceDescriptor({
    id: parseDeviceId(id),
    typeId: MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.typeId,
    definitionVersion: MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.definitionVersion,
    enabled: true,
    parameters: {},
    opaqueState: { channel, programNumber },
  })
}

/** Decodes only the exact V1 placeholder so future schemas stay visibly unsupported. */
export function decodeMidiProgramPlaceholderDeviceState(
  device: DeviceDescriptor,
): MidiProgramPlaceholderDeviceState | null {
  if (
    device.typeId !== MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.typeId ||
    device.definitionVersion !== MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.definitionVersion ||
    Reflect.ownKeys(device.parameters).length !== 0
  ) {
    return null
  }

  const state = device.opaqueState
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null
  if (
    Reflect.ownKeys(state).length !== 2 ||
    !Object.prototype.hasOwnProperty.call(state, 'channel') ||
    !Object.prototype.hasOwnProperty.call(state, 'programNumber')
  ) {
    return null
  }

  try {
    return Object.freeze({
      channel: parseMidiChannel(Reflect.get(state, 'channel')),
      programNumber: parseProgramNumber(Reflect.get(state, 'programNumber')),
    })
  } catch {
    return null
  }
}

/** Applies the frozen Studio GM policy shared by both local MIDI import entry points. */
export const createStudioMidiImportInstrumentDevice: ProjectMidiInstrumentDeviceFactory = ({
  id,
  sourceTrack,
}) => {
  // General MIDI reserves zero-based Channel 9 for percussion; its Program value is irrelevant.
  if (sourceTrack.channel === GENERAL_MIDI_PERCUSSION_CHANNEL) {
    return Object.freeze({
      device: createSampleInstrumentDeviceDescriptor(
        id,
        GENERAL_MIDI_PERCUSSION_INSTRUMENT.soundbankId,
      ),
      mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
    })
  }

  const route = findGeneralMidiProgramRoute(sourceTrack.programNumber)
  if (route === null || route.availability === 'runtime-unavailable') {
    return Object.freeze({
      device: createMidiProgramPlaceholderDeviceDescriptor(
        id,
        sourceTrack.channel,
        sourceTrack.programNumber,
      ),
      mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.UNAVAILABLE,
    })
  }

  const device = createSampleInstrumentDeviceDescriptor(id, route.soundbankId)
  if (route.mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.APPROXIMATE) {
    return Object.freeze({
      appliedInstrumentName: route.sourceDisplayName,
      device,
      mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE,
    })
  }

  return Object.freeze({
    device,
    mappingKind: PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT,
  })
}
