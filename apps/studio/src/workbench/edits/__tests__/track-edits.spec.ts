import {
  PROJECT_COMMAND_TYPE,
  createAddInstrumentTrackCommand,
  createProjectFile,
  createProjectSessionFromProjectFile,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseTrackId,
  type DeviceDescriptor,
  type ProjectSession,
} from '@seele-daw/project-core'
import {
  STUDIO_GRAND_DEVICE_DEFINITION,
  createSampleInstrumentDeviceDescriptor,
  decodeSampleInstrumentDeviceState,
  decodeStudioGrandDeviceState,
  parseSoundbankId,
} from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import { ProjectEditError } from '@/workbench/edits/edit-session'
import { createTrackEdits } from '@/workbench/edits/track-edits'
import { PROJECT_TRACK_PALETTE } from '@/workbench/edits/track-palette'
import { INSTRUMENT_SLOT_DEVICE_TYPE_ID } from '@/workbench/instrument/built-in-instrument-catalogue'
import {
  IDLE_PROJECT,
  createEditTestSession,
  editContextFor,
  identitySource,
  readyStateOf,
} from '@/workbench/edits/__tests__/support/edit-test-support'

function addTrackWithDevice(session: ProjectSession, instrumentDevice: DeviceDescriptor) {
  const trackId = parseTrackId(`track-${instrumentDevice.id}`)
  session.execute(
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      trackId,
      name: 'Existing Instrument',
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
  return trackId
}

function deviceState(session: ProjectSession) {
  return decodeSampleInstrumentDeviceState(session.getSnapshot().devices[0]!)
}

describe('track edits', () => {
  it('appends a Studio Grand Instrument Track with product defaults', () => {
    const session = createEditTestSession('track-defaults')

    const result = createTrackEdits(
      editContextFor(session, 'track-defaults', 'device-defaults'),
    ).addInstrumentTrack()
    const snapshot = session.getSnapshot()

    expect(result.trackId).toBe('track-defaults')
    expect(result.commit.origin).toEqual({
      kind: 'command',
      commandType: PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD,
    })
    expect(result.commit.changes.map(({ table, op }) => `${table}.${op}`)).toEqual([
      'devices.insert',
      'tracks.insert',
      'trackOrder.insert',
    ])
    expect(snapshot.trackOrder).toEqual(['track-defaults'])
    expect(snapshot.tracks[0]).toMatchObject({
      id: 'track-defaults',
      kind: 'instrument',
      name: 'Instrument 1',
      color: PROJECT_TRACK_PALETTE[0],
      channel: { gain: 1, pan: 0, muted: false, soloed: false },
      instrumentDeviceId: 'device-defaults',
    })
    expect(snapshot.devices[0]).toMatchObject({
      id: 'device-defaults',
      typeId: STUDIO_GRAND_DEVICE_DEFINITION.typeId,
    })
    expect(decodeStudioGrandDeviceState(snapshot.devices[0]!)).toEqual({
      soundbankId: 'studio-grand',
    })
  })

  it('numbers Instrument Tracks in order and avoids the neighbouring color', () => {
    const session = createEditTestSession('track-sequence')
    const tracks = createTrackEdits(
      editContextFor(session, 'track-1', 'device-1', 'track-2', 'device-2'),
    )

    tracks.addInstrumentTrack()
    tracks.addInstrumentTrack()

    expect(session.getSnapshot().tracks.map(({ name, color }) => ({ name, color }))).toEqual([
      { name: 'Instrument 1', color: PROJECT_TRACK_PALETTE[0] },
      { name: 'Instrument 2', color: PROJECT_TRACK_PALETTE[1] },
    ])
  })

  it('edits the live Session even before the Active Project publishes its next state', () => {
    const session = createEditTestSession('track-revision')
    const tracks = createTrackEdits({
      activeProject: { state: readyStateOf(session) },
      createId: identitySource('track-1', 'device-1', 'track-2', 'device-2'),
      random: () => 0.5,
    })

    tracks.addInstrumentTrack()
    tracks.addInstrumentTrack()

    expect(session.modelRevision).toBe(2)
  })

  it('replaces a legacy empty instrument slot, surviving save, Undo and Redo', () => {
    const session = createEditTestSession('track-legacy-slot')
    const deviceId = parseDeviceId('device-legacy-slot')
    const trackId = addTrackWithDevice(session, {
      id: deviceId,
      typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
      definitionVersion: 1,
      enabled: true,
      parameters: {},
      opaqueState: null,
    })

    const commit = createTrackEdits(editContextFor(session)).selectBuiltInInstrument(
      trackId,
      parseSoundbankId('solo-violin'),
    )

    expect(commit?.changes).toMatchObject([
      { op: 'replace', table: 'devices', after: { id: deviceId } },
    ])
    expect(deviceState(session)).toEqual({ soundbankId: 'solo-violin' })
    const reloaded = createProjectSessionFromProjectFile(createProjectFile(session.getSnapshot()))
    expect(deviceState(reloaded)).toEqual({ soundbankId: 'solo-violin' })
    session.undo()
    expect(session.getSnapshot().devices[0]).toMatchObject({
      id: deviceId,
      typeId: INSTRUMENT_SLOT_DEVICE_TYPE_ID,
    })
    session.redo()
    expect(deviceState(session)).toEqual({ soundbankId: 'solo-violin' })
  })

  it('replaces an unknown soundbank while keeping the Device identity', () => {
    const session = createEditTestSession('track-unknown-bank')
    const deviceId = parseDeviceId('device-unknown-bank')
    const trackId = addTrackWithDevice(
      session,
      createSampleInstrumentDeviceDescriptor(deviceId, parseSoundbankId('unknown-orchestral-bank')),
    )

    createTrackEdits(editContextFor(session)).selectBuiltInInstrument(
      trackId,
      parseSoundbankId('flute'),
    )

    expect(session.getSnapshot().tracks[0]).toMatchObject({ instrumentDeviceId: deviceId })
    expect(deviceState(session)).toEqual({ soundbankId: 'flute' })
  })

  it('returns null when the Track already uses the instrument', () => {
    const session = createEditTestSession('track-no-change')
    const tracks = createTrackEdits(editContextFor(session, 'track-1', 'device-1'))
    const { trackId } = tracks.addInstrumentTrack()

    expect(tracks.selectBuiltInInstrument(trackId, parseSoundbankId('studio-grand'))).toBeNull()
    expect(session.modelRevision).toBe(1)
  })

  it('rejects edits without a ready project', () => {
    const tracks = createTrackEdits({
      activeProject: IDLE_PROJECT,
      createId: () => 'unused',
      random: () => 0,
    })
    const notReady = expect.objectContaining<Partial<ProjectEditError>>({
      code: 'project-not-ready',
    })

    expect(() => tracks.addInstrumentTrack()).toThrowError(notReady)
    expect(() =>
      tracks.selectBuiltInInstrument(parseTrackId('track-idle'), parseSoundbankId('studio-grand')),
    ).toThrowError(notReady)
  })

  it('rejects a missing Track as stale and an unknown soundbank as unsupported', () => {
    const session = createEditTestSession('track-rejections')
    const tracks = createTrackEdits(editContextFor(session, 'track-1', 'device-1'))

    expect(() =>
      tracks.selectBuiltInInstrument(parseTrackId('track-missing'), parseSoundbankId('flute')),
    ).toThrowError(expect.objectContaining<Partial<ProjectEditError>>({ code: 'target-stale' }))
    const { trackId } = tracks.addInstrumentTrack()
    expect(() =>
      tracks.selectBuiltInInstrument(trackId, parseSoundbankId('unknown-soundbank')),
    ).toThrowError(expect.objectContaining<Partial<ProjectEditError>>({ code: 'unsupported' }))
    expect(session.modelRevision).toBe(1)
  })

  it('rejects invalid randomness before consuming identities', () => {
    const session = createEditTestSession('track-invalid-random')
    let identityCalls = 0
    const tracks = createTrackEdits({
      activeProject: { state: readyStateOf(session) },
      createId: () => `unused-${++identityCalls}`,
      random: () => 1,
    })

    expect(() => tracks.addInstrumentTrack()).toThrow(RangeError)
    expect(identityCalls).toBe(0)
    expect(session.modelRevision).toBe(0)
  })
})
