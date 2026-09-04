import { describe, expect, it } from 'vitest'
import {
  assertMidiSourceEnvelope,
  createStandardMidiFileSourceEnvelope,
} from '#internal/contract/midi-source-envelope'

describe('MIDI Source Envelope', () => {
  it.each([0, 1] as const)('creates deeply frozen SMF format %s evidence', (format) => {
    const envelope = createStandardMidiFileSourceEnvelope(format)

    expect(envelope).toEqual({
      schemaVersion: 1,
      container: {
        format,
        kind: 'standard-midi-file',
        timeDivision: 'ppq',
      },
      messageProtocol: 'midi-1.0',
      semanticEvidence: {
        reason: 'profile-declarations-not-inspected',
        status: 'unresolved',
      },
    })
    expect(Object.isFrozen(envelope)).toBe(true)
    expect(Object.isFrozen(envelope.container)).toBe(true)
    expect(Object.isFrozen(envelope.semanticEvidence)).toBe(true)
  })

  it('rejects missing, unsupported, and format-inconsistent evidence', () => {
    expect(() => assertMidiSourceEnvelope(undefined)).toThrow(TypeError)
    expect(() =>
      assertMidiSourceEnvelope({
        ...createStandardMidiFileSourceEnvelope(1),
        schemaVersion: 2,
      }),
    ).toThrow(TypeError)
    expect(() =>
      assertMidiSourceEnvelope(
        {
          ...createStandardMidiFileSourceEnvelope(1),
          messageProtocol: 'midi-2.0',
        },
        1,
      ),
    ).toThrow(TypeError)
    expect(() => assertMidiSourceEnvelope(createStandardMidiFileSourceEnvelope(0), 1)).toThrow(
      TypeError,
    )
  })
})
