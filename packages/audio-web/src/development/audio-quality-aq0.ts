import { parseSoundbankId, type ScheduledSampleVoicePlan } from '@seele-daw/playback'

import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import {
  SampleInstrumentVoiceRuntime,
  type SampleInstrumentVoiceRuntimeStatistics,
} from '#internal/sample-instrument/voice/voice-runtime'

export const AUDIO_QUALITY_AQ0_REPORT_SCHEMA = 'seele.audio-quality-aq0-browser-report'
export const AUDIO_QUALITY_AQ0_VELOCITY_VECTOR = Object.freeze([1, 32, 64, 96, 127] as const)

const RENDER_POLICY = 'aq0-current-linear-amplitude-no-calibration-trim'
const SAMPLE_RATE_HZ = 48_000
const RENDER_DURATION_SECOND = 0.5
const SOURCE_DURATION_SECOND = 1
const SOURCE_AMPLITUDE = 0.5
const SOURCE_FREQUENCY_HZ = 1_000
const NOTE_START_SECOND = 0.05
const NOTE_RELEASE_SECOND = 0.3
const ZONE_RELEASE_SECOND = 0.133
const STEADY_WINDOW = Object.freeze({ fromSecond: 0.1, toSecond: 0.2 })
const TAIL_WINDOW = Object.freeze({ fromSecond: 0.45, toSecond: RENDER_DURATION_SECOND })
const SOUNDBANK_ID = parseSoundbankId('audio-quality-aq0-browser-fixture')

export interface AudioQualityAq0ChannelMeasurement {
  readonly dcOffset: number
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
}

export interface AudioQualityAq0VelocityMeasurement {
  readonly baseGain: number
  readonly channelMeasurements: readonly AudioQualityAq0ChannelMeasurement[]
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly relativeRmsDbToVelocity127: number | null
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly tailPeakDbfs: number | null
  readonly tailPeakLinear: number
  readonly velocity: number
}

export interface AudioQualityAq0BrowserReport {
  readonly checks: {
    readonly allMeasurementsFinite: boolean
    readonly resourcesReleasedAfterDispose: boolean
    readonly resourcesReleasedAfterRender: boolean
    readonly tailsBelowMinus90Dbfs: boolean
  }
  readonly environment: {
    readonly offlineAudioContextAvailable: true
    readonly userAgent: string
  }
  readonly fixture: {
    readonly noteReleaseSecond: number
    readonly noteStartSecond: number
    readonly renderDurationSecond: number
    readonly sampleRateHz: number
    readonly sourceAmplitude: number
    readonly sourceDurationSecond: number
    readonly sourceFrequencyHz: number
    readonly steadyWindow: typeof STEADY_WINDOW
    readonly tailWindow: typeof TAIL_WINDOW
    readonly zoneReleaseSecond: number
  }
  readonly renderPolicy: typeof RENDER_POLICY
  readonly schema: typeof AUDIO_QUALITY_AQ0_REPORT_SCHEMA
  readonly schemaVersion: 1
  readonly velocityMeasurements: readonly AudioQualityAq0VelocityMeasurement[]
}

interface RawVelocityMeasurement {
  readonly baseGain: number
  readonly channelMeasurements: readonly AudioQualityAq0ChannelMeasurement[]
  readonly peakLinear: number
  readonly rmsLinear: number
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly tailPeakLinear: number
  readonly velocity: number
}

interface OfflineRuntimeContextAdapter {
  readonly audioContext: AudioContext
  finishScheduling(): void
}

function linearAmplitudeToDbfs(linearAmplitude: number): number | null {
  return linearAmplitude === 0 ? null : 20 * Math.log10(linearAmplitude)
}

function isZeroStatistics(statistics: SampleInstrumentVoiceRuntimeStatistics): boolean {
  return (
    statistics.activeVoiceCount === 0 &&
    statistics.connectedNodeCount === 0 &&
    statistics.endedListenerCount === 0 &&
    statistics.sourceNodeCount === 0
  )
}

function requireOfflineAudioContextConstructor(): typeof OfflineAudioContext {
  const Constructor = globalThis.OfflineAudioContext
  if (Constructor === undefined)
    throw new TypeError('OfflineAudioContext is unavailable in this browser')
  return Constructor
}

function createOfflineRuntimeContextAdapter(
  context: OfflineAudioContext,
): OfflineRuntimeContextAdapter {
  // OfflineAudioContext is suspended before startRendering(); only its scheduling view is adapted.
  // Native node creation, automation, rendering, and the resulting PCM stay on the real context.
  let scheduling = true
  const audioContext = new Proxy(context, {
    get(target, property) {
      if (property === 'state' && scheduling) return 'running'
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as AudioContext
  return Object.freeze({
    audioContext,
    finishScheduling: () => {
      scheduling = false
    },
  })
}

function secondToFrame(second: number): number {
  return Math.round(second * SAMPLE_RATE_HZ)
}

export function measureAudioQualityAq0Channel(
  channel: Float32Array,
  fromFrame: number,
  toFrame: number,
): AudioQualityAq0ChannelMeasurement {
  if (
    !Number.isSafeInteger(fromFrame) ||
    !Number.isSafeInteger(toFrame) ||
    fromFrame < 0 ||
    toFrame > channel.length ||
    toFrame <= fromFrame
  ) {
    throw new TypeError('AQ0 PCM measurement window must be a non-empty in-range frame interval')
  }

  let peakLinear = 0
  let sum = 0
  let sumOfSquares = 0
  for (let frame = fromFrame; frame < toFrame; frame += 1) {
    const sample = channel[frame]
    if (sample === undefined || !Number.isFinite(sample)) {
      throw new TypeError('AQ0 PCM measurement contains a non-finite sample')
    }
    peakLinear = Math.max(peakLinear, Math.abs(sample))
    sum += sample
    sumOfSquares += sample * sample
  }

  const frameCount = toFrame - fromFrame
  const rmsLinear = Math.sqrt(sumOfSquares / frameCount)
  return Object.freeze({
    dcOffset: sum / frameCount,
    peakDbfs: linearAmplitudeToDbfs(peakLinear),
    peakLinear,
    rmsDbfs: linearAmplitudeToDbfs(rmsLinear),
    rmsLinear,
  })
}

function createZone(): SampleInstrumentZoneV1 {
  return Object.freeze({
    amplitudeEnvelope: Object.freeze({
      attack: Object.freeze({ curve: null, durationSecond: 0 }),
      release: Object.freeze({ curve: null, durationSecond: ZONE_RELEASE_SECOND }),
    }),
    exclusiveGroup: null,
    loop: Object.freeze({ kind: 'none' }),
    resource: Object.freeze({ key: 'synthetic/reference-sine.wav', mediaType: 'audio/wav' }),
    rootMidiPitch: 60,
    selector: Object.freeze({ kind: 'exact-midi', pitch: 60 }),
    startOffsetSecond: 0,
    triggerMode: 'gated',
    tuneCent: 0,
    zoneId: 'aq0-reference-sine',
  })
}

function createReferenceSineBuffer(context: OfflineAudioContext): AudioBuffer {
  const frameCount = secondToFrame(SOURCE_DURATION_SECOND)
  const buffer = context.createBuffer(1, frameCount, SAMPLE_RATE_HZ)
  const channel = buffer.getChannelData(0)
  for (let frame = 0; frame < frameCount; frame += 1) {
    channel[frame] =
      SOURCE_AMPLITUDE * Math.sin((2 * Math.PI * SOURCE_FREQUENCY_HZ * frame) / SAMPLE_RATE_HZ)
  }
  return buffer
}

function createPreparedResources(audioBuffer: AudioBuffer): PreparedAudibleMidiSampleResources {
  const zone = createZone()
  const manifest = Object.freeze({
    displayName: 'AQ0 Synthetic Reference',
    schema: 'seele.sample-instrument-manifest',
    schemaVersion: 1,
    soundbankId: SOUNDBANK_ID,
    zones: Object.freeze([zone]),
  }) as SampleInstrumentManifestV1
  return Object.freeze({
    failures: Object.freeze([]),
    instruments: Object.freeze([
      Object.freeze({
        manifest,
        resources: Object.freeze([
          Object.freeze({
            audioBuffer,
            encodedByteLength: audioBuffer.length * Float32Array.BYTES_PER_ELEMENT,
            key: zone.resource.key,
          }),
        ]),
        soundbankId: SOUNDBANK_ID,
      }),
    ]),
    modelRevision: 1,
  }) as unknown as PreparedAudibleMidiSampleResources
}

function createPlan(velocity: number): ScheduledSampleVoicePlan {
  return Object.freeze({
    channel: 0,
    engineGeneration: 1,
    instrumentDeviceId: 'audio-quality-aq0-browser-device',
    kind: 'sample-voice',
    masterGain: 1,
    occurrenceKey: `aq0-browser-velocity-${velocity}`,
    pan: 0,
    pitch: 60,
    releasePlaybackClockSecond: NOTE_RELEASE_SECOND,
    soundbankId: SOUNDBANK_ID,
    startPlaybackClockSecond: NOTE_START_SECOND,
    timing: 'on-time',
    trackGain: 1,
    trackId: 'audio-quality-aq0-browser-track',
    velocity,
  }) as unknown as ScheduledSampleVoicePlan
}

function createOutput(
  context: OfflineAudioContext,
  runtimeAudioContext: AudioContext,
): ActiveWebAudioOutput {
  const master = context.createGain()
  master.gain.setValueAtTime(1, 0)
  master.connect(context.destination)
  return Object.freeze({
    audioContext: runtimeAudioContext,
    masterInput: master,
    setMasterGainAtTime: (gain: number, audioContextSecond: number) => {
      master.gain.setValueAtTime(gain, audioContextSecond)
    },
  })
}

function collectChannels(buffer: AudioBuffer): readonly Float32Array[] {
  return Object.freeze(
    Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)),
  )
}

function maximumPeakInWindow(
  channels: readonly Float32Array[],
  fromFrame: number,
  toFrame: number,
): number {
  return Math.max(
    ...channels.map(
      (channel) => measureAudioQualityAq0Channel(channel, fromFrame, toFrame).peakLinear,
    ),
  )
}

async function renderVelocity(velocity: number): Promise<RawVelocityMeasurement> {
  const OfflineAudioContextConstructor = requireOfflineAudioContextConstructor()
  const context = new OfflineAudioContextConstructor(
    2,
    secondToFrame(RENDER_DURATION_SECOND),
    SAMPLE_RATE_HZ,
  )
  const contextAdapter = createOfflineRuntimeContextAdapter(context)
  const runtime = new SampleInstrumentVoiceRuntime({
    output: createOutput(context, contextAdapter.audioContext),
    preparedResources: createPreparedResources(createReferenceSineBuffer(context)),
  })
  runtime.advanceGeneration(1 as ScheduledSampleVoicePlan['engineGeneration'])
  const result = runtime.schedule(createPlan(velocity))
  if (result.outcome !== 'scheduled')
    throw new TypeError(`AQ0 Voice was not scheduled: ${result.outcome}`)

  const renderRequest = context.startRendering()
  contextAdapter.finishScheduling()
  const rendered = await renderRequest
  await Promise.resolve()
  const channels = collectChannels(rendered)
  const steadyFromFrame = secondToFrame(STEADY_WINDOW.fromSecond)
  const steadyToFrame = secondToFrame(STEADY_WINDOW.toSecond)
  const tailFromFrame = secondToFrame(TAIL_WINDOW.fromSecond)
  const tailToFrame = secondToFrame(TAIL_WINDOW.toSecond)
  const channelMeasurements = Object.freeze(
    channels.map((channel) =>
      measureAudioQualityAq0Channel(channel, steadyFromFrame, steadyToFrame),
    ),
  )
  const peakLinear = Math.max(...channelMeasurements.map((measurement) => measurement.peakLinear))
  const rmsLinear = Math.sqrt(
    channelMeasurements.reduce((total, measurement) => total + measurement.rmsLinear ** 2, 0) /
      channelMeasurements.length,
  )
  const runtimeStatisticsAfterRender = runtime.statistics
  runtime.dispose()
  const runtimeStatisticsAfterDispose = runtime.statistics

  return Object.freeze({
    baseGain: velocity / 127,
    channelMeasurements,
    peakLinear,
    rmsLinear,
    runtimeStatisticsAfterDispose,
    runtimeStatisticsAfterRender,
    tailPeakLinear: maximumPeakInWindow(channels, tailFromFrame, tailToFrame),
    velocity,
  })
}

function finalizeMeasurement(
  measurement: RawVelocityMeasurement,
  referenceRmsLinear: number,
): AudioQualityAq0VelocityMeasurement {
  return Object.freeze({
    ...measurement,
    peakDbfs: linearAmplitudeToDbfs(measurement.peakLinear),
    relativeRmsDbToVelocity127:
      measurement.rmsLinear === 0 || referenceRmsLinear === 0
        ? null
        : 20 * Math.log10(measurement.rmsLinear / referenceRmsLinear),
    rmsDbfs: linearAmplitudeToDbfs(measurement.rmsLinear),
    tailPeakDbfs: linearAmplitudeToDbfs(measurement.tailPeakLinear),
  })
}

export async function runAudioQualityAq0BrowserBaseline(): Promise<AudioQualityAq0BrowserReport> {
  requireOfflineAudioContextConstructor()
  const rawMeasurements = await Promise.all(AUDIO_QUALITY_AQ0_VELOCITY_VECTOR.map(renderVelocity))
  const reference = rawMeasurements.at(-1)
  if (reference === undefined) throw new TypeError('AQ0 Velocity reference is unavailable')
  const velocityMeasurements = Object.freeze(
    rawMeasurements.map((measurement) => finalizeMeasurement(measurement, reference.rmsLinear)),
  )
  const finiteValues = velocityMeasurements.flatMap((measurement) => [
    measurement.baseGain,
    measurement.peakLinear,
    measurement.rmsLinear,
    measurement.tailPeakLinear,
    ...measurement.channelMeasurements.flatMap((channel) => [
      channel.dcOffset,
      channel.peakLinear,
      channel.rmsLinear,
    ]),
  ])

  return Object.freeze({
    checks: Object.freeze({
      allMeasurementsFinite: finiteValues.every(Number.isFinite),
      resourcesReleasedAfterDispose: velocityMeasurements.every((measurement) =>
        isZeroStatistics(measurement.runtimeStatisticsAfterDispose),
      ),
      resourcesReleasedAfterRender: velocityMeasurements.every((measurement) =>
        isZeroStatistics(measurement.runtimeStatisticsAfterRender),
      ),
      tailsBelowMinus90Dbfs: velocityMeasurements.every(
        (measurement) => measurement.tailPeakDbfs === null || measurement.tailPeakDbfs < -90,
      ),
    }),
    environment: Object.freeze({
      offlineAudioContextAvailable: true,
      userAgent: navigator.userAgent,
    }),
    fixture: Object.freeze({
      noteReleaseSecond: NOTE_RELEASE_SECOND,
      noteStartSecond: NOTE_START_SECOND,
      renderDurationSecond: RENDER_DURATION_SECOND,
      sampleRateHz: SAMPLE_RATE_HZ,
      sourceAmplitude: SOURCE_AMPLITUDE,
      sourceDurationSecond: SOURCE_DURATION_SECOND,
      sourceFrequencyHz: SOURCE_FREQUENCY_HZ,
      steadyWindow: STEADY_WINDOW,
      tailWindow: TAIL_WINDOW,
      zoneReleaseSecond: ZONE_RELEASE_SECOND,
    }),
    renderPolicy: RENDER_POLICY,
    schema: AUDIO_QUALITY_AQ0_REPORT_SCHEMA,
    schemaVersion: 1,
    velocityMeasurements,
  })
}
