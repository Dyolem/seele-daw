import {
  parseSoundbankId,
  type AudibleMidiProjectPlan,
  type ScheduledSampleVoicePlan,
  type SoundbankId,
  PLAYBACK_INSTRUMENT_FAILURE_MODE,
} from '@seele-daw/playback'
import { describe, expect, it, vi } from 'vitest'

import { createWebAudioPlaybackRuntime } from '#internal/web-audio-playback-runtime'

const FIRST_SOUNDBANK_ID = parseSoundbankId('fixture-piano')
const SECOND_SOUNDBANK_ID = parseSoundbankId('fixture-strings')
const FIRST_ASSET_BASE = 'https://studio.example.test/soundbanks/fixture-piano/'
const SECOND_ASSET_BASE = 'https://studio.example.test/soundbanks/fixture-strings/'

function writeFourCc(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function createPcmWav(): ArrayBuffer {
  const frameCount = 100
  const channelCount = 2
  const bitDepth = 16
  const sampleRateHz = 44_100
  const blockAlign = channelCount * (bitDepth / 8)
  const dataByteLength = frameCount * blockAlign
  const bytes = new ArrayBuffer(44 + dataByteLength)
  const view = new DataView(bytes)
  writeFourCc(view, 0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  writeFourCc(view, 8, 'WAVE')
  writeFourCc(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRateHz, true)
  view.setUint32(28, sampleRateHz * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeFourCc(view, 36, 'data')
  view.setUint32(40, dataByteLength, true)
  return bytes
}

function createManifestResponse(soundbankId: SoundbankId): Response {
  return Response.json({
    displayName: `Fixture ${soundbankId}`,
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId,
    zones: [
      {
        amplitudeEnvelope: {
          attack: { curve: null, durationSecond: 0 },
          release: { curve: null, durationSecond: 0.1 },
        },
        exclusiveGroup: null,
        loop: { kind: 'none' },
        resource: { key: 'samples/middle.wav', mediaType: 'audio/wav' },
        rootMidiPitch: 60,
        selector: { kind: 'midi-range', maximumPitch: 72, minimumPitch: 48 },
        startOffsetSecond: 0,
        triggerMode: 'gated',
        tuneCent: 0,
        zoneId: `fixture:${soundbankId}`,
      },
    ],
  })
}

class FakeBrowserAudioContext {
  readonly destination = Object.freeze({}) as unknown as AudioDestinationNode
  readonly decodeAudioData = vi.fn<(audioData: ArrayBuffer) => Promise<AudioBuffer>>(async () =>
    Object.freeze({
      duration: 100 / 44_100,
      length: 100,
      numberOfChannels: 2,
      sampleRate: 44_100,
    } as AudioBuffer),
  )
  currentTime = 0
  state: AudioContextState = 'running'
  closeCallCount = 0

  createGain(): GainNode {
    const gain = Object.freeze({
      setValueAtTime: vi.fn<(value: number, startTime: number) => void>(),
    }) as unknown as AudioParam
    return {
      connect: vi.fn<(destination: AudioNode) => AudioNode>((destination) => destination),
      disconnect: vi.fn<() => void>(),
      gain,
    } as unknown as GainNode
  }

  async close(): Promise<void> {
    this.closeCallCount += 1
    this.state = 'closed'
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext
  }
}

function createPlan(
  soundbankIds: readonly SoundbankId[],
  pitches: readonly number[] = soundbankIds.map(() => 60),
): AudibleMidiProjectPlan {
  return Object.freeze({
    arrangementEndTick: 960,
    diagnostics: Object.freeze([]),
    master: Object.freeze({ gain: 1, muted: false }),
    midiNoteSpans: Object.freeze(
      soundbankIds.map((_soundbankId, index) =>
        Object.freeze({
          channel: index,
          clipId: `clip-${index}`,
          endTick: 480,
          noteId: `note-${index}`,
          occurrenceKey: JSON.stringify([`track-${index}`, index]),
          pitch: pitches[index] ?? 60,
          releaseTick: 480,
          sourceId: `source-${index}`,
          startTick: 0,
          trackId: `track-${index}`,
          velocity: 100,
        }),
      ),
    ),
    modelRevision: 4,
    status: 'playable',
    tempoSegments: Object.freeze([]),
    timelineEndTick: 960,
    tracks: Object.freeze(
      soundbankIds.map((soundbankId, index) =>
        Object.freeze({
          audible: true,
          gain: 1,
          instrument: Object.freeze({
            deviceId: `device-${index}`,
            kind: 'sample-instrument',
            soundbankId,
          }),
          instrumentDeviceId: `device-${index}`,
          muted: false,
          pan: 0,
          soloed: false,
          trackId: `track-${index}`,
        }),
      ),
    ),
  }) as unknown as AudibleMidiProjectPlan
}

const ASSET_BASES = new Map([
  [FIRST_SOUNDBANK_ID, FIRST_ASSET_BASE],
  [SECOND_SOUNDBANK_ID, SECOND_ASSET_BASE],
])

const LIMITS = Object.freeze({
  maximumDecodedFloat32ByteLength: 4 * 1_024 * 1_024,
  maximumManifestByteLength: 64 * 1_024,
  maximumResourceByteLength: 4 * 1_024 * 1_024,
})

function createRuntime(
  context: FakeBrowserAudioContext,
  fetch: typeof globalThis.fetch,
  limits = LIMITS,
) {
  return createWebAudioPlaybackRuntime({
    assetBaseUrl: (soundbankId: SoundbankId) => ASSET_BASES.get(soundbankId) ?? null,
    audioContextFactory: () => context.asAudioContext(),
    expectedOrigin: 'https://studio.example.test',
    fetch,
    limits,
  })
}

function createVoicePlan(
  plan: AudibleMidiProjectPlan,
  index: number,
  soundbankId: SoundbankId,
): ScheduledSampleVoicePlan {
  const span = plan.midiNoteSpans[index]!
  return Object.freeze({
    channel: span.channel,
    instrumentDeviceId: `device-${index}`,
    keyReleasePlaybackClockSecond: 0.5,
    kind: 'sample-voice',
    masterGain: 1,
    occurrenceKey: span.occurrenceKey,
    pan: 0,
    pitch: span.pitch,
    releasePlaybackClockSecond: 0.5,
    soundbankId,
    startPlaybackClockSecond: 0,
    timing: 'on-time',
    trackGain: 1,
    trackId: span.trackId,
    velocity: span.velocity,
  }) as unknown as ScheduledSampleVoicePlan
}

describe('Web Audio playback runtime', () => {
  it('shares one bounded application cache across repeated multi-instrument preparations', async () => {
    const context = new FakeBrowserAudioContext()
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('manifest.json')) {
        return createManifestResponse(
          url.startsWith(SECOND_ASSET_BASE) ? SECOND_SOUNDBANK_ID : FIRST_SOUNDBANK_ID,
        )
      }
      return new Response(createPcmWav())
    })
    const runtime = createRuntime(context, fetchImplementation, {
      ...LIMITS,
      maximumDecodedFloat32ByteLength: 1_600,
    })
    const plan = createPlan([FIRST_SOUNDBANK_ID, SECOND_SOUNDBANK_ID])

    await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
    })
    await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
    })

    expect(fetchImplementation).toHaveBeenCalledTimes(4)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
    runtime.dispose()
    expect(context.closeCallCount).toBe(1)
  })

  it('isolates an uncovered occurrence while retaining covered resources for the same Soundbank', async () => {
    const context = new FakeBrowserAudioContext()
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith('manifest.json')
        ? createManifestResponse(FIRST_SOUNDBANK_ID)
        : new Response(createPcmWav()),
    )
    const runtime = createRuntime(context, fetchImplementation)
    const plan = createPlan([FIRST_SOUNDBANK_ID, FIRST_SOUNDBANK_ID], [47, 60])

    const prepared = await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
    })

    expect(prepared.preparationFailures).toEqual([])
    expect(prepared.unsupportedNoteOccurrences).toEqual([
      expect.objectContaining({
        occurrenceKey: plan.midiNoteSpans[0]?.occurrenceKey,
        pitch: 47,
        reason: 'no-matching-zone',
        soundbankId: FIRST_SOUNDBANK_ID,
      }),
    ])
    expect(prepared.schedule(createVoicePlan(plan, 0, FIRST_SOUNDBANK_ID))).toBeNull()
    expect(prepared.schedule(createVoicePlan(plan, 0, SECOND_SOUNDBANK_ID))).toBeNull()
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
    runtime.dispose()
  })

  it('prepares an all-uncovered Plan without fetching a WAV resource', async () => {
    const context = new FakeBrowserAudioContext()
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (!String(input).endsWith('manifest.json')) {
        throw new Error('An all-uncovered Plan must not request a WAV resource')
      }
      return createManifestResponse(FIRST_SOUNDBANK_ID)
    })
    const runtime = createRuntime(context, fetchImplementation)
    const plan = createPlan([FIRST_SOUNDBANK_ID], [33])

    const prepared = await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
    })

    expect(prepared.unsupportedNoteOccurrences).toEqual([
      expect.objectContaining({
        occurrenceKey: plan.midiNoteSpans[0]?.occurrenceKey,
        pitch: 33,
        reason: 'no-matching-zone',
      }),
    ])
    expect(fetchImplementation).toHaveBeenCalledOnce()
    expect(context.decodeAudioData).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('fails the initial plan, isolates a selective resource failure, and permits retry', async () => {
    const context = new FakeBrowserAudioContext()
    let secondManifestRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url === `${SECOND_ASSET_BASE}manifest.json`) {
        secondManifestRequestCount += 1
        if (secondManifestRequestCount < 3) return new Response(null, { status: 503 })
        return createManifestResponse(SECOND_SOUNDBANK_ID)
      }
      if (url.endsWith('manifest.json')) return createManifestResponse(FIRST_SOUNDBANK_ID)
      return new Response(createPcmWav())
    })
    const runtime = createRuntime(context, fetchImplementation)
    const plan = createPlan([FIRST_SOUNDBANK_ID, SECOND_SOUNDBANK_ID])

    await expect(
      runtime.prepare(plan, new AbortController().signal, {
        instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'manifest-load-failed', soundbankId: SECOND_SOUNDBANK_ID }),
    )
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce())

    const selective = await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.SKIP_UNAVAILABLE_INSTRUMENTS,
    })
    expect(selective.preparationFailures).toEqual([
      expect.objectContaining({
        cause: expect.objectContaining({ code: 'manifest-load-failed' }),
        soundbankId: SECOND_SOUNDBANK_ID,
      }),
    ])

    const retried = await runtime.prepare(plan, new AbortController().signal, {
      instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN,
    })
    expect(retried.preparationFailures).toEqual([])
    expect(secondManifestRequestCount).toBe(3)
    runtime.dispose()
  })

  it('aborts pending resource work and closes the AudioContext on application disposal', async () => {
    const context = new FakeBrowserAudioContext()
    const manifestSignals: AbortSignal[] = []
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const signal = init?.signal
      if (!(signal instanceof AbortSignal)) throw new TypeError('Fixture requires AbortSignal')
      manifestSignals.push(signal)
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Fixture request aborted', 'AbortError')),
          { once: true },
        ),
      )
    })
    const runtime = createRuntime(context, fetchImplementation)
    const preparation = runtime.prepare(
      createPlan([FIRST_SOUNDBANK_ID]),
      new AbortController().signal,
      { instrumentFailureMode: PLAYBACK_INSTRUMENT_FAILURE_MODE.FAIL_PLAN },
    )

    await vi.waitFor(() => expect(manifestSignals).toHaveLength(1))
    runtime.dispose()

    expect(manifestSignals[0]?.aborted).toBe(true)
    await expect(preparation).rejects.toEqual(expect.objectContaining({ code: 'aborted' }))
    expect(context.closeCallCount).toBe(1)
  })
})
