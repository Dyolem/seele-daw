import type {
  DeviceDescriptor,
  DeviceTypeId,
  ProjectColor,
  ProjectSnapshot,
  TrackId,
  TrackRecord,
} from '@seele-daw/project-core'
import { decodeSampleInstrumentDeviceState, type SoundbankId } from '@seele-daw/playback'

import { findBuiltInInstrumentCatalogueEntry } from '@/workbench/instrument/built-in-instrument-catalogue'
import { decodeMidiProgramPlaceholderDeviceState } from '@/workbench/instrument/midi-import-instrument-policy'
import { INSTRUMENT_SLOT_DEVICE_TYPE_ID } from '@/workbench/project/track/project-track-coordinator'

export const PROJECT_TRACK_INSTRUMENT_STATUS = Object.freeze({
  EMPTY: 'empty',
  MISSING: 'missing',
  READY: 'ready',
  UNAVAILABLE: 'unavailable',
} as const)

export type ProjectTrackInstrumentStatus =
  (typeof PROJECT_TRACK_INSTRUMENT_STATUS)[keyof typeof PROJECT_TRACK_INSTRUMENT_STATUS]

export interface ProjectTrackInstrumentPresentation {
  readonly deviceTypeId: DeviceTypeId | null
  readonly displayName: string
  readonly soundbankId: SoundbankId | null
  readonly status: ProjectTrackInstrumentStatus
}

export interface ProjectTrackPresentation {
  readonly color: ProjectColor | null
  readonly id: TrackId
  readonly instrument: ProjectTrackInstrumentPresentation | null
  readonly kind: TrackRecord['kind']
  readonly name: string
}

function isLegacyEmptyInstrumentSlot(device: DeviceDescriptor): boolean {
  return (
    device.typeId === INSTRUMENT_SLOT_DEVICE_TYPE_ID &&
    device.definitionVersion === 1 &&
    device.enabled &&
    Reflect.ownKeys(device.parameters).length === 0 &&
    device.opaqueState === null
  )
}

function createInstrumentPresentation(
  device: DeviceDescriptor | undefined,
): ProjectTrackInstrumentPresentation {
  if (device === undefined) {
    return Object.freeze({
      deviceTypeId: null,
      displayName: 'Missing instrument',
      soundbankId: null,
      status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
    })
  }

  if (isLegacyEmptyInstrumentSlot(device)) {
    return Object.freeze({
      deviceTypeId: device.typeId,
      displayName: 'No instrument selected',
      soundbankId: null,
      status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
    })
  }

  const programPlaceholderState = decodeMidiProgramPlaceholderDeviceState(device)
  if (programPlaceholderState !== null) {
    return Object.freeze({
      deviceTypeId: device.typeId,
      displayName: `MIDI Program ${programPlaceholderState.programNumber + 1} unavailable`,
      soundbankId: null,
      status: PROJECT_TRACK_INSTRUMENT_STATUS.UNAVAILABLE,
    })
  }

  const sampleInstrumentState = decodeSampleInstrumentDeviceState(device)
  const catalogueEntry = findBuiltInInstrumentCatalogueEntry(sampleInstrumentState?.soundbankId)
  if (sampleInstrumentState !== null && catalogueEntry !== null) {
    return Object.freeze({
      deviceTypeId: device.typeId,
      displayName: catalogueEntry.displayName,
      soundbankId: catalogueEntry.soundbankId,
      status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
    })
  }

  return Object.freeze({
    deviceTypeId: device.typeId,
    displayName: 'Missing instrument',
    soundbankId: sampleInstrumentState?.soundbankId ?? null,
    status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
  })
}

/** Projects ordered Track facts into immutable, Vue-safe presentation values. */
export function createProjectTrackPresentations(
  snapshot: ProjectSnapshot,
): readonly ProjectTrackPresentation[] {
  const tracksById = new Map(snapshot.tracks.map((track) => [track.id, track] as const))
  const devicesById = new Map(snapshot.devices.map((device) => [device.id, device] as const))
  const tracks: ProjectTrackPresentation[] = []

  for (const trackId of snapshot.trackOrder) {
    const track = tracksById.get(trackId)
    if (track === undefined) continue

    tracks.push(
      Object.freeze({
        color: track.color,
        id: track.id,
        instrument:
          track.kind === 'instrument'
            ? createInstrumentPresentation(devicesById.get(track.instrumentDeviceId))
            : null,
        kind: track.kind,
        name: track.name,
      }),
    )
  }

  return Object.freeze(tracks)
}
