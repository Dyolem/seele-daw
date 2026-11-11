import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DomainValueError,
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
  type ChannelStripDescriptor,
  type InstrumentTrackRecord,
  type MasterChannelRecord,
  type ProjectRecord,
} from '#internal/index'

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
  it('creates a new Master Channel record', () => {
    const input = { gain: parseLinearGain(0.5), muted: false }
    const master = createMasterChannelRecord(input)

    expect(master).not.toBe(input)
    expect(master).toEqual(input)
    expectTypeOf(master).toEqualTypeOf<MasterChannelRecord>()
  })

  it('validates the mute flag at runtime', () => {
    expect(() =>
      createMasterChannelRecord({ gain: parseLinearGain(1), muted: 'false' as never }),
    ).toThrow(DomainValueError)
  })
})

describe('InstrumentTrackRecord', () => {
  it('creates a fresh record and copies its Channel', () => {
    const channel = createChannelInput()
    const input = {
      id: parseTrackId('track-1'),
      name: 'Lead',
      color: parseProjectColor('#a0b1c2'),
      channel,
      instrumentDeviceId: parseDeviceId('instrument-1'),
    }

    const track = createInstrumentTrackRecord(input)

    channel.muted = true

    expect(track).not.toBe(input)
    expect(track.color).toBe('#A0B1C2')
    expect(track.channel).toEqual({ ...createChannelInput(), muted: false })
    expect(track.channel).not.toBe(channel)
    expect(track.instrumentDeviceId).toBe('instrument-1')
    expectTypeOf(track).toEqualTypeOf<InstrumentTrackRecord>()
  })

  it('defers Device existence to cross-entity validation', () => {
    const track = createInstrumentTrackRecord({
      id: parseTrackId('track-1'),
      name: 'Lead',
      color: null,
      channel: createChannelInput(),
      instrumentDeviceId: parseDeviceId('unknown-instrument'),
    })

    expect(track.instrumentDeviceId).toBe('unknown-instrument')
  })
})
