import { describe, expect, it, vi } from 'vitest'

import {
  SampleInstrumentAuditionError,
  createSampleInstrumentAuditionSession,
} from '#internal/development/sample-instrument-audition'

function createManifestResponse(): Response {
  return Response.json({
    displayName: 'Audition Fixture',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: 'audition-fixture',
    zones: [
      {
        amplitudeEnvelope: {
          attack: { curve: null, durationSecond: 0 },
          release: { curve: null, durationSecond: 0.133 },
        },
        exclusiveGroup: null,
        loop: { kind: 'none' },
        resource: { key: 'samples/060.wav', mediaType: 'audio/wav' },
        rootMidiPitch: 60,
        selector: { kind: 'midi-range', maximumPitch: 72, minimumPitch: 48 },
        startOffsetSecond: 0,
        triggerMode: 'gated',
        tuneCent: 0,
        zoneId: 'fixture-zone',
      },
    ],
  })
}

class FakeAudioParam {
  readonly values: { readonly kind: 'linear' | 'set'; readonly value: number }[] = []

  setValueAtTime(value: number): AudioParam {
    this.values.push({ kind: 'set', value })
    return this as unknown as AudioParam
  }

  linearRampToValueAtTime(value: number): AudioParam {
    this.values.push({ kind: 'linear', value })
    return this as unknown as AudioParam
  }
}

class FakeBufferSource {
  buffer: AudioBuffer | null = null
  readonly playbackRate = new FakeAudioParam()
  readonly start = vi.fn<(...arguments_: unknown[]) => void>()
  readonly stop = vi.fn<(...arguments_: unknown[]) => void>()
  readonly disconnect = vi.fn<() => void>()
  readonly connect = vi.fn<(...arguments_: unknown[]) => void>()
  #endedListener: (() => void) | null = null

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== 'ended') return
    this.#endedListener = () => {
      if (typeof listener === 'function') listener(new Event('ended'))
      else listener.handleEvent(new Event('ended'))
    }
  }

  finish(): void {
    this.#endedListener?.()
  }
}

class FakeGainNode {
  readonly gain = new FakeAudioParam()
  readonly disconnect = vi.fn<() => void>()
  readonly connect = vi.fn<(...arguments_: unknown[]) => void>()
}

class FakeAudioContext {
  readonly destination = {} as AudioDestinationNode
  readonly sources: FakeBufferSource[] = []
  readonly gains: FakeGainNode[] = []
  readonly decodeAudioData = vi.fn<() => Promise<AudioBuffer>>(async () =>
    Object.freeze({
      duration: 2,
      length: 88_200,
      numberOfChannels: 2,
      sampleRate: 44_100,
    } as AudioBuffer),
  )
  currentTime = 10
  state: AudioContextState = 'suspended'

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource()
    this.sources.push(source)
    return source as unknown as AudioBufferSourceNode
  }

  createGain(): GainNode {
    const gain = new FakeGainNode()
    this.gains.push(gain)
    return gain as unknown as GainNode
  }

  async resume(): Promise<void> {
    this.state = 'running'
  }

  async close(): Promise<void> {
    this.state = 'closed'
  }
}

function createSession(
  fetchImplementation: typeof globalThis.fetch,
  context: FakeAudioContext,
  audioContextFactory = vi.fn<() => AudioContext>(() => context as unknown as AudioContext),
) {
  let time = 0
  return {
    audioContextFactory,
    session: createSampleInstrumentAuditionSession({
      assetBaseUrl: 'http://studio.test/soundbanks/generated/studio-grand/',
      audioContextFactory,
      expectedOrigin: 'http://studio.test',
      fetch: fetchImplementation,
      now: () => {
        time += 1
        return time
      },
    }),
  }
}

describe('development Sample Instrument audition session', () => {
  it('loads and validates the Manifest without creating AudioContext before activation', async () => {
    const context = new FakeAudioContext()
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async () => createManifestResponse())
    const { audioContextFactory, session } = createSession(fetchImplementation, context)

    await expect(session.loadManifest()).resolves.toEqual(
      expect.objectContaining({ soundbankId: 'audition-fixture' }),
    )
    expect(audioContextFactory).not.toHaveBeenCalled()

    await expect(session.activateAudio()).resolves.toBe('running')
    expect(audioContextFactory).toHaveBeenCalledOnce()
    await session.dispose()
    expect(context.state).toBe('closed')
  })

  it('evicts a failed resource request so the same Zone can be retried', async () => {
    const context = new FakeAudioContext()
    let sampleRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = String(input)
      if (url.endsWith('manifest.json')) return createManifestResponse()
      sampleRequestCount += 1
      return sampleRequestCount === 1
        ? new Response(null, { status: 503 })
        : new Response(Uint8Array.of(1, 2, 3, 4))
    })
    const { session } = createSession(fetchImplementation, context)

    await expect(session.measurePitches([60])).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentAuditionError>>({
        code: 'resource-load-failed',
      }),
    )
    await expect(session.measurePitches([60])).resolves.toEqual(
      expect.objectContaining({ cacheHitCount: 0, resourceCount: 1 }),
    )
    await expect(session.measurePitches([60])).resolves.toEqual(
      expect.objectContaining({ cacheHitCount: 1, resourceCount: 1 }),
    )
    expect(sampleRequestCount).toBe(2)
  })

  it('evicts a failed decode so a later attempt fetches and decodes again', async () => {
    const context = new FakeAudioContext()
    context.decodeAudioData.mockRejectedValueOnce(new TypeError('fixture decode failure'))
    let sampleRequestCount = 0
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (String(input).endsWith('manifest.json')) return createManifestResponse()
      sampleRequestCount += 1
      return new Response(Uint8Array.of(1, 2, 3, 4))
    })
    const { session } = createSession(fetchImplementation, context)

    await expect(session.measurePitches([60])).rejects.toEqual(
      expect.objectContaining<Partial<SampleInstrumentAuditionError>>({
        code: 'resource-load-failed',
      }),
    )
    await expect(session.measurePitches([60])).resolves.toEqual(
      expect.objectContaining({ cacheHitCount: 0, resourceCount: 1 }),
    )
    expect(sampleRequestCount).toBe(2)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2)
  })

  it('exposes note-length, transposition, velocity, and release candidates for listening', async () => {
    const context = new FakeAudioContext()
    const fetchImplementation = vi.fn<typeof globalThis.fetch>(async (input) =>
      String(input).endsWith('manifest.json')
        ? createManifestResponse()
        : new Response(Uint8Array.of(1, 2, 3, 4)),
    )
    const { session } = createSession(fetchImplementation, context)

    const result = await session.auditionNote({
      durationSecond: 1.5,
      noteOffMode: 'linear-release',
      pitch: 72,
      releaseSecond: 0.133,
      velocity: 64,
      velocityCurve: 'linear-amplitude',
    })

    expect(result).toEqual({
      effectiveNaturalEndSecond: 1,
      endsBeforeRequestedNoteOff: true,
      pitch: 72,
      playbackRate: 2,
      releaseSecond: 0.133,
      resourceKey: 'samples/060.wav',
      velocityGain: 64 / 127,
      zoneId: 'fixture-zone',
    })
    expect(context.sources[0]?.playbackRate.values).toContainEqual({ kind: 'set', value: 2 })
    expect(context.gains[0]?.gain.values).toEqual([
      { kind: 'set', value: 64 / 127 },
      { kind: 'set', value: 64 / 127 },
      { kind: 'linear', value: 0 },
    ])
  })
})
