import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DomainValueError,
  createAudioTrackRecord,
  createChannelStripDescriptor,
  createInstrumentTrackRecord,
  createMasterChannelRecord,
  createProjectRecord,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseProjectColor,
  parseProjectId,
  parseTrackId,
  type AudioTrackRecord,
  type ChannelStripDescriptor,
  type InstrumentTrackRecord,
  type MasterChannelRecord,
  type ProjectRecord,
  type TrackRecord,
} from '@/index'

function createChannelInput() {
  return {
    gain: parseLinearGain(1),
    pan: parseBipolarValue(0),
    muted: false,
    soloed: false,
  }
}

describe('ProjectRecord', () => {
  it('creates a new project record from validated primitives', () => {
    const input = {
      id: parseProjectId('project-1'),
      name: 'First Song',
    }

    const project = createProjectRecord(input)

    expect(project).not.toBe(input)
    expect(project).toEqual(input)
    expectTypeOf(project).toEqualTypeOf<ProjectRecord>()
  })

  it('rejects a blank project name', () => {
    expect(() =>
      createProjectRecord({
        id: parseProjectId('project-1'),
        name: '   ',
      }),
    ).toThrow(DomainValueError)
  })
})

describe('ChannelStripDescriptor', () => {
  it('creates a new channel value object', () => {
    const input = createChannelInput()
    const channel = createChannelStripDescriptor(input)

    expect(channel).not.toBe(input)
    expect(channel).toEqual(input)
    expectTypeOf(channel).toEqualTypeOf<ChannelStripDescriptor>()
  })

  it('validates boolean channel state at runtime', () => {
    expect(() =>
      createChannelStripDescriptor({
        ...createChannelInput(),
        muted: 'false' as never,
      }),
    ).toThrow(DomainValueError)
    expect(() =>
      createChannelStripDescriptor({
        ...createChannelInput(),
        soloed: 1 as never,
      }),
    ).toThrow(DomainValueError)
  })
})

describe('MasterChannelRecord', () => {
  it('copies its ordered Audio Effect IDs', () => {
    const audioEffectIds = [parseDeviceId('master-fx-1')]
    const master = createMasterChannelRecord({
      gain: parseLinearGain(1),
      muted: false,
      audioEffectIds,
    })

    audioEffectIds.push(parseDeviceId('master-fx-2'))

    expect(master.audioEffectIds).toEqual(['master-fx-1'])
    expect(master.audioEffectIds).not.toBe(audioEffectIds)
    expectTypeOf(master).toEqualTypeOf<MasterChannelRecord>()
  })

  it('rejects duplicate Audio Effect IDs', () => {
    const duplicateId = parseDeviceId('master-fx-1')

    expect(() =>
      createMasterChannelRecord({
        gain: parseLinearGain(1),
        muted: false,
        audioEffectIds: [duplicateId, duplicateId],
      }),
    ).toThrow(DomainValueError)
  })
})

describe('InstrumentTrackRecord', () => {
  it('creates a fresh discriminated topology and copies nested values', () => {
    const channel = createChannelInput()
    const midiEffectIds = [parseDeviceId('midi-fx-1')]
    const audioEffectIds = [parseDeviceId('audio-fx-1')]
    const input = {
      id: parseTrackId('track-1'),
      name: 'Lead',
      color: parseProjectColor('#a0b1c2'),
      channel,
      midiEffectIds,
      instrumentDeviceId: parseDeviceId('instrument-1'),
      audioEffectIds,
    }

    const track = createInstrumentTrackRecord(input)

    channel.muted = true
    midiEffectIds.push(parseDeviceId('midi-fx-2'))
    audioEffectIds.push(parseDeviceId('audio-fx-2'))

    expect(track).not.toBe(input)
    expect(track.kind).toBe('instrument')
    expect(track.color).toBe('#A0B1C2')
    expect(track.channel).toEqual({ ...createChannelInput(), muted: false })
    expect(track.channel).not.toBe(channel)
    expect(track.midiEffectIds).toEqual(['midi-fx-1'])
    expect(track.audioEffectIds).toEqual(['audio-fx-1'])
    expectTypeOf(track).toEqualTypeOf<InstrumentTrackRecord>()
  })

  it.each([
    {
      midiEffectIds: [parseDeviceId('duplicate'), parseDeviceId('duplicate')],
      instrumentDeviceId: parseDeviceId('instrument-1'),
      audioEffectIds: [],
    },
    {
      midiEffectIds: [parseDeviceId('duplicate')],
      instrumentDeviceId: parseDeviceId('duplicate'),
      audioEffectIds: [],
    },
    {
      midiEffectIds: [],
      instrumentDeviceId: parseDeviceId('duplicate'),
      audioEffectIds: [parseDeviceId('duplicate')],
    },
  ])('rejects a Device ID assigned to multiple topology positions', (deviceTopology) => {
    expect(() =>
      createInstrumentTrackRecord({
        id: parseTrackId('track-1'),
        name: 'Lead',
        color: null,
        channel: createChannelInput(),
        ...deviceTopology,
      }),
    ).toThrow(DomainValueError)
  })

  it('defers Device existence and role compatibility to cross-entity validation', () => {
    const track = createInstrumentTrackRecord({
      id: parseTrackId('track-1'),
      name: 'Lead',
      color: null,
      channel: createChannelInput(),
      midiEffectIds: [parseDeviceId('unknown-midi-fx')],
      instrumentDeviceId: parseDeviceId('unknown-instrument'),
      audioEffectIds: [parseDeviceId('unknown-audio-fx')],
    })

    expect(track.instrumentDeviceId).toBe('unknown-instrument')
  })
})

describe('AudioTrackRecord', () => {
  it('creates the minimal future audio topology without recording fields', () => {
    const track = createAudioTrackRecord({
      id: parseTrackId('audio-track-1'),
      name: 'Vocal',
      color: null,
      channel: createChannelInput(),
      audioEffectIds: [parseDeviceId('audio-fx-1')],
    })

    expect(track.kind).toBe('audio')
    expect(track).not.toHaveProperty('recordingInput')
    expectTypeOf(track).toEqualTypeOf<AudioTrackRecord>()
  })

  it('forms a discriminated TrackRecord union', () => {
    function readTrackKind(track: TrackRecord): TrackRecord['kind'] {
      if (track.kind === 'instrument') {
        expectTypeOf(track).toEqualTypeOf<InstrumentTrackRecord>()
      } else {
        expectTypeOf(track).toEqualTypeOf<AudioTrackRecord>()
      }

      return track.kind
    }

    expect(
      readTrackKind(
        createAudioTrackRecord({
          id: parseTrackId('audio-track-1'),
          name: 'Vocal',
          color: null,
          channel: createChannelInput(),
          audioEffectIds: [],
        }),
      ),
    ).toBe('audio')
  })
})
