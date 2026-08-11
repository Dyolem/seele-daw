import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  parseDeviceId,
  parseDeviceTypeId,
  parseParameterId,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  SAMPLE_INSTRUMENT_DEVICE_DEFINITION,
  SOUNDBANK_ID_MAX_LENGTH,
  SoundbankIdError,
  createSampleInstrumentDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
  parseSoundbankId,
  type SampleInstrumentDeviceState,
  type SoundbankId,
} from '#internal/sample-instrument-device'

describe('Sample Instrument Device', () => {
  it('defines one engine family independently of any specific Soundbank', () => {
    expect(SAMPLE_INSTRUMENT_DEVICE_DEFINITION).toEqual({
      definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
      typeId: parseDeviceTypeId('seele.sample-instrument'),
    })
    expect(Object.isFrozen(SAMPLE_INSTRUMENT_DEVICE_DEFINITION)).toBe(true)
  })

  it('creates and decodes arbitrary valid MIDISampleSynth Soundbank identities', () => {
    const soundbankId = parseSoundbankId('12-string-guitar-v2-v4')
    const descriptor = createSampleInstrumentDeviceDescriptor(
      parseDeviceId('device-sample-guitar'),
      soundbankId,
    )
    const state = decodeSampleInstrumentDeviceState(descriptor)

    expect(descriptor).toEqual({
      id: 'device-sample-guitar',
      typeId: 'seele.sample-instrument',
      definitionVersion: 1,
      enabled: true,
      parameters: {},
      opaqueState: { soundbankId: '12-string-guitar-v2-v4' },
    })
    expect(state).toEqual({ soundbankId })
    expect(Object.isFrozen(state)).toBe(true)
    expectTypeOf(soundbankId).toEqualTypeOf<SoundbankId>()
    expectTypeOf(state).toEqualTypeOf<SampleInstrumentDeviceState | null>()
  })

  it('recognizes a disabled Sample Instrument without treating enabled as opaque state', () => {
    const descriptor = createSampleInstrumentDeviceDescriptor(
      parseDeviceId('device-sample-disabled'),
      parseSoundbankId('studio-grand'),
    )

    expect(decodeSampleInstrumentDeviceState({ ...descriptor, enabled: false })).toEqual({
      soundbankId: 'studio-grand',
    })
  })

  it.each(['', ' leading-space', 'trailing-space ', 'x'.repeat(SOUNDBANK_ID_MAX_LENGTH + 1), null])(
    'rejects invalid Soundbank identity %j',
    (value) => {
      expect(() => parseSoundbankId(value)).toThrow(SoundbankIdError)
    },
  )

  it('fails closed for unknown definitions, parameters, versions, and state shapes', () => {
    const descriptor = createSampleInstrumentDeviceDescriptor(
      parseDeviceId('device-sample-invalid'),
      parseSoundbankId('studio-grand'),
    )
    const invalidDescriptors = [
      createDeviceDescriptor({
        ...descriptor,
        typeId: parseDeviceTypeId('third-party.sample-instrument'),
      }),
      createDeviceDescriptor({
        ...descriptor,
        definitionVersion: descriptor.definitionVersion + 1,
      }),
      createDeviceDescriptor({
        ...descriptor,
        parameters: { [parseParameterId('future')]: true },
      }),
      createDeviceDescriptor({ ...descriptor, opaqueState: {} }),
      createDeviceDescriptor({
        ...descriptor,
        opaqueState: { soundbankId: 'studio-grand', future: true },
      }),
    ]

    for (const invalidDescriptor of invalidDescriptors) {
      expect(decodeSampleInstrumentDeviceState(invalidDescriptor)).toBeNull()
    }
  })
})
