import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  parseDeviceTypeId,
  type DeviceDescriptor,
  type DeviceId,
} from '@seele-daw/project-core'

export const STUDIO_GRAND_SOUNDBANK_ID = 'studio-grand' as const

export const STUDIO_GRAND_DEVICE_DEFINITION = Object.freeze({
  definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
  displayName: 'Studio Grand',
  typeId: parseDeviceTypeId('seele.sample-instrument'),
})

export interface StudioGrandDeviceState {
  readonly soundbankId: typeof STUDIO_GRAND_SOUNDBANK_ID
}

const STUDIO_GRAND_DEVICE_STATE = Object.freeze<StudioGrandDeviceState>({
  soundbankId: STUDIO_GRAND_SOUNDBANK_ID,
})

/** Creates the one persisted Descriptor shape owned by the built-in Studio Grand definition. */
export function createStudioGrandDeviceDescriptor(deviceId: DeviceId): DeviceDescriptor {
  return createDeviceDescriptor({
    id: deviceId,
    typeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
    definitionVersion: STUDIO_GRAND_DEVICE_DEFINITION.definitionVersion,
    enabled: true,
    parameters: {},
    opaqueState: STUDIO_GRAND_DEVICE_STATE,
  })
}

/** Decodes only the exact V1 Studio Grand schema and leaves unknown Device state untouched. */
export function decodeStudioGrandDeviceState(
  device: DeviceDescriptor,
): StudioGrandDeviceState | null {
  if (
    device.typeId !== STUDIO_GRAND_DEVICE_DEFINITION.typeId ||
    device.definitionVersion !== STUDIO_GRAND_DEVICE_DEFINITION.definitionVersion ||
    Reflect.ownKeys(device.parameters).length !== 0
  ) {
    return null
  }

  const state = device.opaqueState
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null

  const stateKeys = Reflect.ownKeys(state)
  const soundbankId = Object.getOwnPropertyDescriptor(state, 'soundbankId')
  if (
    stateKeys.length !== 1 ||
    stateKeys[0] !== 'soundbankId' ||
    soundbankId === undefined ||
    !soundbankId.enumerable ||
    !('value' in soundbankId) ||
    soundbankId.value !== STUDIO_GRAND_SOUNDBANK_ID
  ) {
    return null
  }

  return STUDIO_GRAND_DEVICE_STATE
}
