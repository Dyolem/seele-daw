import { describe, expect, it } from 'vitest'
import { inspectSmfMidi1ModeDeclarations } from '#internal/adapters/midi-file-js/smf-midi1-mode-declaration-inspector'
import {
  createSmfFixture,
  TYPE_ONE_MODE_DECLARATIONS_FIXTURE,
  TYPE_ZERO_FRAGMENTED_GM_DECLARATION_FIXTURE,
} from '#internal/__tests__/fixtures/standard-midi-file-fixtures'

describe('SMF MIDI 1.0 mode-declaration inspector', () => {
  it('recognizes only exact GM1, GM2, GM Off, GS, and XG declarations', () => {
    expect(inspectSmfMidi1ModeDeclarations(TYPE_ONE_MODE_DECLARATIONS_FIXTURE)).toEqual({
      declarations: [
        {
          deviceId: 0x7f,
          kind: 'general-midi-1-system-on',
          scope: 'file',
          sourceEventIndex: 0,
          sourceTrackIndex: 0,
          tick: 0,
        },
        {
          deviceId: 0x03,
          kind: 'general-midi-system-off',
          scope: 'file',
          sourceEventIndex: 1,
          sourceTrackIndex: 0,
          tick: 0,
        },
        {
          deviceId: 0x05,
          kind: 'general-midi-2-system-on',
          scope: 'file',
          sourceEventIndex: 2,
          sourceTrackIndex: 0,
          tick: 0,
        },
        {
          deviceId: 0x10,
          kind: 'roland-gs-reset',
          scope: 'file',
          sourceEventIndex: 3,
          sourceTrackIndex: 0,
          tick: 0,
        },
        {
          deviceId: 0x0a,
          kind: 'yamaha-xg-system-on',
          scope: 'file',
          sourceEventIndex: 4,
          sourceTrackIndex: 0,
          tick: 0,
        },
      ],
      inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
      status: 'inspected',
      unclassifiedSystemExclusiveMessageCount: 1,
    })
  })

  it('reassembles an F0 declaration continued by multiple F7 packets', () => {
    expect(inspectSmfMidi1ModeDeclarations(TYPE_ZERO_FRAGMENTED_GM_DECLARATION_FIXTURE)).toEqual({
      declarations: [
        {
          deviceId: 0x7f,
          kind: 'general-midi-1-system-on',
          scope: 'file',
          sourceEventIndex: 0,
          sourceTrackIndex: 0,
          tick: 120,
        },
      ],
      inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
      status: 'inspected',
      unclassifiedSystemExclusiveMessageCount: 0,
    })
  })

  it('keeps evidence unresolved when the bounded inspection parser fails', () => {
    expect(inspectSmfMidi1ModeDeclarations(new Uint8Array([0x00]))).toEqual({
      reason: 'profile-declaration-inspection-failed',
      status: 'unresolved',
    })
  })

  it('does not promote near-match or manufacturer-private messages into declarations', () => {
    const fixture = createSmfFixture(0, 120, [
      [
        0x00, 0xf0, 0x05, 0x7e, 0x7f, 0x09, 0x04, 0xf7, 0x00, 0xf0, 0x0a, 0x41, 0x10, 0x42, 0x12,
        0x40, 0x00, 0x7f, 0x00, 0x40, 0xf7, 0x00, 0xf0, 0x03, 0x7d, 0x01, 0xf7, 0x00, 0xff, 0x2f,
        0x00,
      ],
    ])

    expect(inspectSmfMidi1ModeDeclarations(fixture)).toEqual({
      declarations: [],
      inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
      status: 'inspected',
      unclassifiedSystemExclusiveMessageCount: 3,
    })
  })
})
