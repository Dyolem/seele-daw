import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  parseDeviceId,
  parseDeviceTypeId,
  parseParameterId,
} from '@seele-daw/project-core'
import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  STUDIO_GRAND_DEVICE_DEFINITION,
  STUDIO_GRAND_SOUNDBANK_ID,
  createStudioGrandDeviceDescriptor,
  decodeStudioGrandDeviceState,
  type StudioGrandDeviceState,
} from '#internal/index'

describe('Studio Grand Device Definition', () => {
  it('exports one frozen browser-independent identity', () => {
    expect(STUDIO_GRAND_DEVICE_DEFINITION).toEqual({
      definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
      displayName: 'Studio Grand',
      typeId: parseDeviceTypeId('seele.sample-instrument'),
    })
    expect(STUDIO_GRAND_SOUNDBANK_ID).toBe('studio-grand')
    expect(Object.isFrozen(STUDIO_GRAND_DEVICE_DEFINITION)).toBe(true)
  })

  it('creates and decodes the exact persisted V1 Descriptor', () => {
    const deviceId = parseDeviceId('device-studio-grand-definition')
    const descriptor = createStudioGrandDeviceDescriptor(deviceId)
    const state = decodeStudioGrandDeviceState(descriptor)

    expect(descriptor).toEqual({
      id: deviceId,
      typeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
      definitionVersion: STUDIO_GRAND_DEVICE_DEFINITION.definitionVersion,
      enabled: true,
      parameters: {},
      opaqueState: { soundbankId: STUDIO_GRAND_SOUNDBANK_ID },
    })
    expect(state).toEqual({ soundbankId: STUDIO_GRAND_SOUNDBANK_ID })
    expect(Object.isFrozen(state)).toBe(true)
    expectTypeOf(state).toEqualTypeOf<StudioGrandDeviceState | null>()
  })

  it('recognizes a disabled known Device without treating enabled as persisted state', () => {
    const descriptor = createStudioGrandDeviceDescriptor(
      parseDeviceId('device-studio-grand-disabled'),
    )

    expect(decodeStudioGrandDeviceState({ ...descriptor, enabled: false })).toEqual({
      soundbankId: STUDIO_GRAND_SOUNDBANK_ID,
    })
  })

  it('fails closed for unknown definitions and incompatible state without rewriting either', () => {
    const descriptor = createStudioGrandDeviceDescriptor(
      parseDeviceId('device-studio-grand-invalid'),
    )
    const unknownDefinition = createDeviceDescriptor({
      ...descriptor,
      typeId: parseDeviceTypeId('third-party.sample-instrument'),
    })
    const unsupportedVersion = createDeviceDescriptor({
      ...descriptor,
      definitionVersion: descriptor.definitionVersion + 1,
    })
    const parameterized = createDeviceDescriptor({
      ...descriptor,
      parameters: { [parseParameterId('future')]: true },
    })
    const incompatibleState = createDeviceDescriptor({
      ...descriptor,
      opaqueState: { soundbankId: STUDIO_GRAND_SOUNDBANK_ID, future: true },
    })

    expect(decodeStudioGrandDeviceState(unknownDefinition)).toBeNull()
    expect(decodeStudioGrandDeviceState(unsupportedVersion)).toBeNull()
    expect(decodeStudioGrandDeviceState(parameterized)).toBeNull()
    expect(decodeStudioGrandDeviceState(incompatibleState)).toBeNull()
    expect(incompatibleState.opaqueState).toEqual({
      soundbankId: STUDIO_GRAND_SOUNDBANK_ID,
      future: true,
    })
  })
})
