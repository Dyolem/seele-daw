import type { Brand } from '@seele-daw/type-utils'
import {
  DEVICE_DEFINITION_VERSION_MIN,
  createDeviceDescriptor,
  parseDeviceId,
  parseDeviceTypeId,
  type DeviceDescriptor,
  type DeviceId,
} from '@seele-daw/project-core'

export type SoundbankId = Brand<string, 'SoundbankId'>

export const SOUNDBANK_ID_MAX_LENGTH = 128

export const SAMPLE_INSTRUMENT_DEVICE_DEFINITION = Object.freeze({
  definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
  typeId: parseDeviceTypeId('seele.sample-instrument'),
})

export interface SampleInstrumentDeviceState {
  readonly soundbankId: SoundbankId
}

export type SoundbankIdErrorCode = 'invalid-soundbank-id'

/** Stable failure raised when an opaque Soundbank identity is not persistable. */
export class SoundbankIdError extends RangeError {
  readonly code: SoundbankIdErrorCode

  constructor() {
    super(
      `SoundbankId must be a trimmed non-blank string of at most ${SOUNDBANK_ID_MAX_LENGTH} Unicode characters`,
    )
    this.name = 'SoundbankIdError'
    this.code = 'invalid-soundbank-id'
  }
}

export function parseSoundbankId(value: unknown): SoundbankId {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    Array.from(value).length > SOUNDBANK_ID_MAX_LENGTH
  ) {
    throw new SoundbankIdError()
  }

  return value as SoundbankId
}

/** Creates the persisted V1 Descriptor shared by every MIDISampleSynth Soundbank. */
export function createSampleInstrumentDeviceDescriptor(
  deviceId: DeviceId,
  soundbankId: SoundbankId,
): DeviceDescriptor {
  return createDeviceDescriptor({
    id: parseDeviceId(deviceId),
    typeId: SAMPLE_INSTRUMENT_DEVICE_DEFINITION.typeId,
    definitionVersion: SAMPLE_INSTRUMENT_DEVICE_DEFINITION.definitionVersion,
    enabled: true,
    parameters: {},
    opaqueState: { soundbankId: parseSoundbankId(soundbankId) },
  })
}

/** Decodes any exact V1 MIDISampleSynth state without consulting a Catalog or asset resolver. */
export function decodeSampleInstrumentDeviceState(
  device: DeviceDescriptor,
): SampleInstrumentDeviceState | null {
  if (
    device.typeId !== SAMPLE_INSTRUMENT_DEVICE_DEFINITION.typeId ||
    device.definitionVersion !== SAMPLE_INSTRUMENT_DEVICE_DEFINITION.definitionVersion ||
    Reflect.ownKeys(device.parameters).length !== 0
  ) {
    return null
  }

  const state = device.opaqueState
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null

  const stateKeys = Reflect.ownKeys(state)
  const soundbankIdProperty = Object.getOwnPropertyDescriptor(state, 'soundbankId')
  if (
    stateKeys.length !== 1 ||
    stateKeys[0] !== 'soundbankId' ||
    soundbankIdProperty === undefined ||
    !soundbankIdProperty.enumerable ||
    !('value' in soundbankIdProperty)
  ) {
    return null
  }

  try {
    return Object.freeze({
      soundbankId: parseSoundbankId(soundbankIdProperty.value),
    })
  } catch {
    return null
  }
}
