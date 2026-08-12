import { parseSoundbankId } from '@seele-daw/playback'
import { describe, expect, it } from 'vitest'

import {
  BuiltInMidiSampleSynthAdapterError,
  adaptBuiltInMidiSampleSynthMapping,
  type BuiltInWavResourceRequest,
} from '#internal/sample-instrument/built-in-midi-sample-synth-adapter'
import {
  createBuiltInMapping,
  createBuiltInZone,
} from '#internal/__tests__/support/built-in-midi-sample-synth-fixture'

function resolveWavResource({ fileName }: BuiltInWavResourceRequest) {
  return { key: `samples/${fileName}.wav`, sourceSampleRateHz: 44_100 }
}

describe('Built-in MIDISampleSynth Mapping Adapter', () => {
  it('normalizes unsorted range, exact-key, loop, envelope, tune, offset, and release override', () => {
    const mapping = createBuiltInMapping({
      release: 0.12,
      samples: [
        createBuiltInZone({
          attackCurve: -0.1,
          attackTime: 0.02,
          fileName: '064-Looped',
          loopEnd: 2.5,
          loopStart: 1.25,
          maxRange: 67,
          midiNumber: 64,
          minRange: 61,
          offset: 4_410,
          releaseCurve: 0,
          releaseTime: 0.08,
          tune: -4,
          urls: {
            m4a: 'https://static.example.test/064-Looped.m4a',
            wav: 'https://static.example.test/064-Looped.wav',
          },
        }),
        createBuiltInZone({
          fileName: '060-Exact',
          maxRange: null,
          midiNumber: 60,
          minRange: null,
          urls: {
            m4a: 'https://static.example.test/060-Exact.m4a',
            wav: 'https://static.example.test/060-Exact.wav',
          },
        }),
      ],
    })

    const manifest = adaptBuiltInMidiSampleSynthMapping(mapping, {
      resolveWavResource,
      soundbankId: parseSoundbankId('fixture-soundbank'),
    })

    expect(manifest.zones).toEqual([
      expect.objectContaining({
        selector: { kind: 'exact-midi', pitch: 60 },
        triggerMode: 'gated',
        tuneCent: 0,
        startOffsetSecond: 0,
      }),
      expect.objectContaining({
        amplitudeEnvelope: {
          attack: { curve: -0.1, durationSecond: 0.02 },
          release: { curve: 0, durationSecond: 0.08 },
        },
        loop: { endSecond: 2.5, kind: 'continuous', startSecond: 1.25 },
        resource: { key: 'samples/064-Looped.wav', mediaType: 'audio/wav' },
        selector: { kind: 'midi-range', maximumPitch: 67, minimumPitch: 61 },
        startOffsetSecond: 0.1,
        tuneCent: -4,
      }),
    ])
    expect(Object.isFrozen(manifest)).toBe(true)
  })

  it('keeps built-in kit defaults and mutex inference inside the compatibility adapter', () => {
    const mapping = createBuiltInMapping({
      category: 'kit',
      mutexSets: [[42, 46]],
      release: null,
      samples: [
        createBuiltInZone({
          fileName: '042-Closed-Hat',
          maxRange: null,
          midiNumber: 42,
          minRange: null,
          urls: {
            m4a: 'https://static.example.test/042-Closed-Hat.m4a',
            wav: 'https://static.example.test/042-Closed-Hat.wav',
          },
        }),
        createBuiltInZone({
          fileName: '046-Open-Hat',
          maxRange: null,
          midiNumber: 46,
          minRange: null,
          urls: {
            m4a: 'https://static.example.test/046-Open-Hat.m4a',
            wav: 'https://static.example.test/046-Open-Hat.wav',
          },
        }),
      ],
    })

    const manifest = adaptBuiltInMidiSampleSynthMapping(mapping, {
      resolveWavResource,
      soundbankId: parseSoundbankId('fixture-kit'),
    })

    expect(
      manifest.zones.map(({ amplitudeEnvelope, exclusiveGroup, triggerMode }) => ({
        exclusiveGroup,
        release: amplitudeEnvelope.release,
        triggerMode,
      })),
    ).toEqual([
      {
        exclusiveGroup: { groupId: 1, offByGroupId: 1, offMode: 'fast' },
        release: null,
        triggerMode: 'one-shot',
      },
      {
        exclusiveGroup: { groupId: 1, offByGroupId: 1, offMode: 'fast' },
        release: null,
        triggerMode: 'one-shot',
      },
    ])
  })

  it('preserves explicit one-shot release metadata without making Note Off gated', () => {
    const mapping = createBuiltInMapping({
      release: null,
      samples: [
        createBuiltInZone({
          oneshot: true,
          releaseCurve: 0,
          releaseTime: 0.01,
        }),
      ],
    })

    const manifest = adaptBuiltInMidiSampleSynthMapping(mapping, {
      resolveWavResource,
      soundbankId: parseSoundbankId('fixture-one-shot'),
    })

    expect(manifest.zones[0]).toEqual(
      expect.objectContaining({
        amplitudeEnvelope: {
          attack: { curve: null, durationSecond: 0 },
          release: { curve: 0, durationSecond: 0.01 },
        },
        triggerMode: 'one-shot',
      }),
    )
  })

  it('accepts URL-encoded sample names without retaining their remote URLs', () => {
    const mapping = createBuiltInMapping({
      samples: [createBuiltInZone({ fileName: '060-Keys#Bright' })],
    })

    const manifest = adaptBuiltInMidiSampleSynthMapping(mapping, {
      resolveWavResource,
      soundbankId: parseSoundbankId('fixture-encoded-name'),
    })

    expect(manifest.zones[0]?.resource.key).toBe('samples/060-Keys#Bright.wav')
    expect(JSON.stringify(manifest)).not.toContain('https://')
  })

  it.each([
    {
      code: 'unsupported-built-in-control',
      mapping: createBuiltInMapping({
        samples: [createBuiltInZone({ crossfade: 0.5 })],
      }),
    },
    {
      code: 'invalid-built-in-mapping',
      mapping: createBuiltInMapping({
        samples: [createBuiltInZone({ futureControl: true })],
      }),
    },
    {
      code: 'ambiguous-mutex-set',
      mapping: createBuiltInMapping({ mutexSets: [[60, 61]] }),
    },
    {
      code: 'manifest-contract-violation',
      mapping: createBuiltInMapping({
        samples: [
          createBuiltInZone({ maxRange: 61 }),
          createBuiltInZone({
            fileName: '061-Overlap',
            maxRange: 61,
            midiNumber: 61,
            minRange: 61,
          }),
        ],
      }),
    },
  ] as const)('fails closed with $code', ({ code, mapping }) => {
    expect(() =>
      adaptBuiltInMidiSampleSynthMapping(mapping, {
        resolveWavResource,
        soundbankId: parseSoundbankId('fixture-invalid'),
      }),
    ).toThrowError(expect.objectContaining<Partial<BuiltInMidiSampleSynthAdapterError>>({ code }))
  })

  it('requires encoded source sample rate before converting an offset frame', () => {
    const mapping = createBuiltInMapping({ samples: [createBuiltInZone({ offset: 441 })] })

    expect(() =>
      adaptBuiltInMidiSampleSynthMapping(mapping, {
        resolveWavResource: ({ fileName }) => ({ key: `${fileName}.wav` }),
        soundbankId: parseSoundbankId('fixture-offset'),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<BuiltInMidiSampleSynthAdapterError>>({
        code: 'missing-source-sample-rate',
      }),
    )
  })
})
