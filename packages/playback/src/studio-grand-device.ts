import { type DeviceDescriptor, type DeviceId } from '@seele-daw/project-core'

import {
  SAMPLE_INSTRUMENT_DEVICE_DEFINITION,
  createSampleInstrumentDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
  parseSoundbankId,
} from './sample-instrument-device'

export const STUDIO_GRAND_SOUNDBANK_ID = 'studio-grand' as const

export const STUDIO_GRAND_DEVICE_DEFINITION = Object.freeze({
  definitionVersion: SAMPLE_INSTRUMENT_DEVICE_DEFINITION.definitionVersion,
  displayName: 'Studio Grand',
  typeId: SAMPLE_INSTRUMENT_DEVICE_DEFINITION.typeId,
})

export interface StudioGrandDeviceState {
  readonly soundbankId: typeof STUDIO_GRAND_SOUNDBANK_ID
}

const STUDIO_GRAND_DEVICE_STATE = Object.freeze<StudioGrandDeviceState>({
  soundbankId: STUDIO_GRAND_SOUNDBANK_ID,
})

/** Creates the default Studio Grand selection using the generic Sample Instrument schema. */
export function createStudioGrandDeviceDescriptor(deviceId: DeviceId): DeviceDescriptor {
  return createSampleInstrumentDeviceDescriptor(
    deviceId,
    parseSoundbankId(STUDIO_GRAND_SOUNDBANK_ID),
  )
}

/** Decodes only the exact V1 Studio Grand schema and leaves unknown Device state untouched. */
export function decodeStudioGrandDeviceState(
  device: DeviceDescriptor,
): StudioGrandDeviceState | null {
  const state = decodeSampleInstrumentDeviceState(device)
  if (state?.soundbankId !== STUDIO_GRAND_SOUNDBANK_ID) return null

  return STUDIO_GRAND_DEVICE_STATE
}
