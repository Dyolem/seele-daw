import type { MidiFileTrack } from '@seele-daw/midi-file'
import {
  createDeviceDescriptor,
  parseDeviceId,
  type DeviceDescriptor,
} from '@seele-daw/project-core'
import { decodeSampleInstrumentDeviceState } from '@seele-daw/playback'
import { PROJECT_MIDI_INSTRUMENT_MAPPING_KIND } from '@seele-daw/project-midi'
import { describe, expect, it } from 'vitest'

import { BUILT_IN_INSTRUMENT_CATALOGUE } from '@/workbench/instrument/built-in-instrument-catalogue'
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
  it('maps every reviewed melodic GM Program to its Catalogue Soundbank', () => {
    const programEntries = BUILT_IN_INSTRUMENT_CATALOGUE.filter(
      ({ midiImportRoute }) => midiImportRoute.kind === 'program',
    )

    for (const entry of programEntries) {
      if (entry.midiImportRoute.kind !== 'program') throw new Error('Expected a Program route')
      const result = createPolicyResult(0, entry.midiImportRoute.programNumber)

      expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT)
      expect(decodeSampleInstrumentDeviceState(result.device)).toEqual({
        soundbankId: entry.soundbankId,
      })
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

  it('persists an unsupported melodic Program as a strict silent placeholder', () => {
    const result = createPolicyResult(2, 80)

    expect(result.mappingKind).toBe(PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.UNAVAILABLE)
    expect(result.device).toMatchObject({
      typeId: MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.typeId,
      enabled: true,
      opaqueState: { channel: 2, programNumber: 80 },
    })
    expect(decodeSampleInstrumentDeviceState(result.device)).toBeNull()
    expect(decodeMidiProgramPlaceholderDeviceState(result.device)).toEqual({
      channel: 2,
      programNumber: 80,
    })
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
