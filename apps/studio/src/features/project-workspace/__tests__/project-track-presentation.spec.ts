import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddInstrumentTrackCommand,
  createDeviceDescriptor,
  createInitialProjectSession,
  parseBipolarValue,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
  type DeviceDescriptor,
  type ProjectSession,
} from '@seele-daw/project-core'
import {
  STUDIO_GRAND_DEVICE_DEFINITION,
  createSampleInstrumentDeviceDescriptor,
  createStudioGrandDeviceDescriptor,
  parseSoundbankId,
} from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import {
  PROJECT_TRACK_INSTRUMENT_STATUS,
  createProjectTrackPresentations,
} from '@/features/project-workspace/project-track-presentation'
import {
  MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION,
  createMidiProgramPlaceholderDeviceDescriptor,
} from '@/workbench/instrument/midi-import-instrument-policy'
import { INSTRUMENT_SLOT_DEVICE_TYPE_ID } from '@/workbench/project/track/project-track-coordinator'

function createSession(): ProjectSession {
  return createInitialProjectSession({
    projectId: parseProjectId('project-track-presentation'),
    projectName: 'Track presentation',
    tempoEventId: parseTempoEventId('tempo-track-presentation'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-track-presentation'),
  })
}

function addInstrumentTrack(
  session: ProjectSession,
  suffix: string,
  instrumentDevice: DeviceDescriptor,
): void {
  const result = session.execute(
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      trackId: parseTrackId(`track-${suffix}`),
      name: suffix,
      color: null,
      channel: {
        gain: parseLinearGain(1),
        pan: parseBipolarValue(0),
        muted: false,
        soloed: false,
      },
      instrumentDevice,
      insertAt: session.getSnapshot().trackOrder.length,
    }),
  )

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error(`Expected ${suffix} fixture to commit`)
  }
}

describe('Project Track presentation', () => {
  it('projects Catalogue, legacy empty, and unknown Instruments without rewriting facts', () => {
    const session = createSession()
    addInstrumentTrack(
      session,
      'Studio Grand',
      createStudioGrandDeviceDescriptor(parseDeviceId('device-studio-grand-presentation')),
    )
    addInstrumentTrack(
      session,
      'Violin',
      createSampleInstrumentDeviceDescriptor(
        parseDeviceId('device-violin-presentation'),
        parseSoundbankId('solo-violin'),
      ),
    )
    addInstrumentTrack(
      session,
      'Unknown Sample Bank',
      createSampleInstrumentDeviceDescriptor(
        parseDeviceId('device-unknown-sample-presentation'),
        parseSoundbankId('unknown-orchestral-bank'),
      ),
    )
    addInstrumentTrack(
      session,
      'Unsupported Program',
      createMidiProgramPlaceholderDeviceDescriptor(
        parseDeviceId('device-program-placeholder-presentation'),
        2,
        80,
      ),
    )
    addInstrumentTrack(
      session,
      'Legacy Slot',
      createDeviceDescriptor({
        id: parseDeviceId('device-legacy-slot-presentation'),
        typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        definitionVersion: 1,
        enabled: true,
        parameters: {},
        opaqueState: null,
      }),
    )
    addInstrumentTrack(
      session,
      'Unavailable Instrument',
      createDeviceDescriptor({
        id: parseDeviceId('device-unavailable-presentation'),
        typeId: parseDeviceTypeId('third-party.unavailable-instrument'),
        definitionVersion: 7,
        enabled: true,
        parameters: {},
        opaqueState: { presetId: 'preserved-preset' },
      }),
    )

    const presentations = createProjectTrackPresentations(session.getSnapshot())

    expect(presentations.map(({ instrument }) => instrument)).toEqual([
      {
        deviceTypeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
        displayName: 'Studio Grand',
        soundbankId: 'studio-grand',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      },
      {
        deviceTypeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
        displayName: 'Violin',
        soundbankId: 'solo-violin',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.READY,
      },
      {
        deviceTypeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
        displayName: 'Missing instrument',
        soundbankId: 'unknown-orchestral-bank',
        status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
      },
      {
        deviceTypeId: MIDI_PROGRAM_PLACEHOLDER_DEVICE_DEFINITION.typeId,
        displayName: 'MIDI Program 81 unavailable',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.UNAVAILABLE,
      },
      {
        deviceTypeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        displayName: 'No instrument selected',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.EMPTY,
      },
      {
        deviceTypeId: parseDeviceTypeId('third-party.unavailable-instrument'),
        displayName: 'Missing instrument',
        soundbankId: null,
        status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
      },
    ])
    expect(Object.isFrozen(presentations)).toBe(true)
    expect(presentations.every((track) => Object.isFrozen(track))).toBe(true)
    expect(presentations.every((track) => Object.isFrozen(track.instrument))).toBe(true)
    expect(
      session
        .getSnapshot()
        .devices.find((device) => device.id === 'device-unavailable-presentation')?.opaqueState,
    ).toEqual({ presetId: 'preserved-preset' })
  })

  it('does not present an incompatible Instrument Slot payload as an empty legacy Slot', () => {
    const session = createSession()
    addInstrumentTrack(
      session,
      'Incompatible Slot',
      createDeviceDescriptor({
        id: parseDeviceId('device-incompatible-slot-presentation'),
        typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
        definitionVersion: 1,
        enabled: true,
        parameters: {},
        opaqueState: { future: true },
      }),
    )

    expect(createProjectTrackPresentations(session.getSnapshot())[0]?.instrument).toEqual({
      deviceTypeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
      displayName: 'Missing instrument',
      soundbankId: null,
      status: PROJECT_TRACK_INSTRUMENT_STATUS.MISSING,
    })
  })
})
