import { describe, expect, it } from 'vitest'
import {
  assertMidiSourceEnvelope,
  copyMidiSourceEnvelope,
  createStandardMidiFileSourceEnvelope,
  createStandardMidiFileSourceEnvelopeWithEvidence,
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

  it('validates and deeply copies inspected declaration evidence', () => {
    const source = createStandardMidiFileSourceEnvelopeWithEvidence(1, {
      declarations: [
        {
          deviceId: 0x10,
          kind: 'roland-gs-reset',
          scope: 'file',
          sourceEventIndex: 3,
          sourceTrackIndex: 0,
          tick: 0,
        },
      ],
      inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
      status: 'inspected',
      unclassifiedSystemExclusiveMessageCount: 2,
    })
    const copy = copyMidiSourceEnvelope(source)

    expect(copy).toEqual(source)
    expect(copy).not.toBe(source)
    expect(copy.semanticEvidence).not.toBe(source.semanticEvidence)
    if (copy.semanticEvidence.status !== 'inspected') {
      throw new TypeError('Expected inspected evidence')
    }
    expect(Object.isFrozen(copy.semanticEvidence.declarations)).toBe(true)
    expect(Object.isFrozen(copy.semanticEvidence.declarations[0])).toBe(true)
  })

  it('rejects invalid declaration locations and kind-specific device IDs', () => {
    expect(() =>
      createStandardMidiFileSourceEnvelopeWithEvidence(1, {
        declarations: [
          {
            deviceId: 0x20,
            kind: 'roland-gs-reset',
            scope: 'file',
            sourceEventIndex: 0,
            sourceTrackIndex: 0,
            tick: 0,
          },
        ],
        inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
        status: 'inspected',
        unclassifiedSystemExclusiveMessageCount: 0,
      }),
    ).toThrow(TypeError)
  })
})
