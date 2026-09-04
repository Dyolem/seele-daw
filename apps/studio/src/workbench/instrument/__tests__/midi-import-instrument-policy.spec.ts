import type { MidiFileTrack } from '@seele-daw/midi-file'
import {
  createDeviceDescriptor,
  parseDeviceId,
  type DeviceDescriptor,
} from '@seele-daw/project-core'
import { decodeSampleInstrumentDeviceState } from '@seele-daw/playback'
import { PROJECT_MIDI_INSTRUMENT_MAPPING_KIND } from '@seele-daw/project-midi'
import { describe, expect, it } from 'vitest'

import {
  BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND,
  GENERAL_MIDI_PROGRAM_ROUTES,
} from '@/workbench/instrument/built-in-instrument-catalogue'
import {
  MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION,
  createMidiProgramPlaceholderDeviceDescriptor,
  createStudioMidiImportInstrumentDevice,
  decodeMidiProgramPlaceholderDeviceState,
} from '@/workbench/instrument/midi-import-instrument-policy'

function createSourceTrack(channel: number, programNumber: number): MidiFileTrack {
  return {
    name: 'Imported Track',
    channel,
    programNumber,
    notes: [],
    controlChanges: [],
    pitchBends: [],
  }
}

function createPolicyResult(channel: number, programNumber: number) {
  return createStudioMidiImportInstrumentDevice({
    id: parseDeviceId(`device-${channel}-${programNumber}`),
    importedTrackIndex: 0,
    sourceTrack: createSourceTrack(channel, programNumber),
    sourceTrackIndex: 0,
  })
}

describe('Studio MIDI import Instrument policy', () => {
  it('maps every playable melodic GM Program to its reviewed sample route', () => {
    const availableRoutes = GENERAL_MIDI_PROGRAM_ROUTES.filter(
      (route) => route.availability === 'available',
    )
    const exactRoutes = availableRoutes.filter(
      (route) => route.mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.EXACT,
    )

    for (const route of exactRoutes) {
      const result = createPolicyResult(0, route.programNumber)

      expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT)
      expect(decodeSampleInstrumentDeviceState(result.device)).toEqual({
        soundbankId: route.soundbankId,
      })
      expect(result).not.toHaveProperty('appliedInstrumentName')
      expect(Object.isFrozen(result)).toBe(true)
    }

    const approximateRoutes = availableRoutes.filter(
      (route) => route.mappingKind === BUILT_IN_INSTRUMENT_PROGRAM_MAPPING_KIND.APPROXIMATE,
    )

    for (const route of approximateRoutes) {
      const result = createPolicyResult(0, route.programNumber)

      expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE)
      expect(decodeSampleInstrumentDeviceState(result.device)).toEqual({
        soundbankId: route.soundbankId,
      })
      expect(result).toMatchObject({ appliedInstrumentName: route.sourceDisplayName })
      expect(Object.isFrozen(result)).toBe(true)
    }
  })

  it.each([0, 47, 127])(
    'routes Channel 10 Program %s to General MIDI Percussion before melodic Program lookup',
    (programNumber) => {
      const result = createPolicyResult(9, programNumber)

      expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT)
      expect(decodeSampleInstrumentDeviceState(result.device)).toEqual({
        soundbankId: 'general-midi-percussion',
      })
    },
  )

  it('persists every synth-runtime Program as a strict silent placeholder', () => {
    const unavailableRoutes = GENERAL_MIDI_PROGRAM_ROUTES.filter(
      (route) => route.availability === 'runtime-unavailable',
    )

    for (const route of unavailableRoutes) {
      const result = createPolicyResult(2, route.programNumber)

      expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.UNAVAILABLE)
      expect(result.device).toMatchObject({
        typeId: MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.typeId,
        enabled: true,
        opaqueState: { channel: 2, programNumber: route.programNumber },
      })
      expect(decodeSampleInstrumentDeviceState(result.device)).toBeNull()
      expect(decodeMidiProgramPlaceholderDeviceState(result.device)).toEqual({
        channel: 2,
        programNumber: route.programNumber,
      })
    }
  })

  it('rejects malformed or future placeholder shapes without guessing', () => {
    const descriptor = createMidiProgramPlaceholderDeviceDescriptor(
      parseDeviceId('placeholder-device'),
      0,
      80,
    )
    const replace = (overrides: Partial<DeviceDescriptor>) =>
      createDeviceDescriptor({ ...descriptor, ...overrides })

    expect(
      decodeMidiProgramPlaceholderDeviceState(
        replace({ definitionVersion: descriptor.definitionVersion + 1 }),
      ),
    ).toBeNull()
    expect(
      decodeMidiProgramPlaceholderDeviceState(
        replace({ opaqueState: { channel: 0, programNumber: 80, future: true } }),
      ),
    ).toBeNull()
    expect(
      decodeMidiProgramPlaceholderDeviceState(
        replace({ opaqueState: { channel: 16, programNumber: 80 } }),
      ),
    ).toBeNull()
  })
})
