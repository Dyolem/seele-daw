export const AUDIO_QUALITY_FIXTURE_SAMPLE_RATE_HZ = 48_000

const REFERENCE_SINE_AMPLITUDE = 0.5
const REFERENCE_SINE_FREQUENCY_HZ = 1_000

export interface AudioQualityPcmFixture {
  readonly channels: readonly Float32Array[]
  readonly frameCount: number
  readonly id: string
  readonly sampleRateHz: number
}

export interface AudioQualityPcmMeasurement {
  readonly dcOffset: number
  readonly maximumAdjacentDelta: number
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
}

export interface AudioQualityPcmFixtureSet {
  readonly discontinuousLoop: AudioQualityPcmFixture
  readonly impulse: AudioQualityPcmFixture
  readonly opposedStereo: AudioQualityPcmFixture
  readonly referenceSine: AudioQualityPcmFixture
  readonly seamlessLoop: AudioQualityPcmFixture
}

function createChannel(frameCount: number, sampleAt: (frame: number) => number): Float32Array {
  const channel = new Float32Array(frameCount)
  for (let frame = 0; frame < frameCount; frame += 1) channel[frame] = sampleAt(frame)
  return channel
}

function createFixture(id: string, channels: readonly Float32Array[]): AudioQualityPcmFixture {
  if (channels.length === 0) throw new TypeError('PCM fixture requires at least one channel')
  const frameCount = channels[0]?.length ?? 0
  if (frameCount === 0 || channels.some((channel) => channel.length !== frameCount)) {
    throw new TypeError('PCM fixture channels must have one shared non-zero frame count')
  }
  return Object.freeze({
    channels: Object.freeze([...channels]),
    frameCount,
    id,
    sampleRateHz: AUDIO_QUALITY_FIXTURE_SAMPLE_RATE_HZ,
  })
}

function createReferenceSineChannel(): Float32Array {
  const frameCount = AUDIO_QUALITY_FIXTURE_SAMPLE_RATE_HZ / 10
  return createChannel(
    frameCount,
    (frame) =>
      REFERENCE_SINE_AMPLITUDE *
      Math.sin(
        (2 * Math.PI * REFERENCE_SINE_FREQUENCY_HZ * frame) / AUDIO_QUALITY_FIXTURE_SAMPLE_RATE_HZ,
      ),
  )
}

export function linearAmplitudeToDbfs(linearAmplitude: number): number | null {
  if (!Number.isFinite(linearAmplitude) || linearAmplitude < 0) {
    throw new TypeError('Linear amplitude must be a finite non-negative number')
  }
  return linearAmplitude === 0 ? null : 20 * Math.log10(linearAmplitude)
}

export function measureAudioQualityPcmChannel(
  channel: Float32Array,
  fromFrame = 0,
  toFrame = channel.length,
): AudioQualityPcmMeasurement {
  if (
    !Number.isSafeInteger(fromFrame) ||
    !Number.isSafeInteger(toFrame) ||
    fromFrame < 0 ||
    toFrame > channel.length ||
    toFrame <= fromFrame
  ) {
    throw new TypeError('PCM measurement window must be a non-empty in-range frame interval')
  }

  let absolutePeak = 0
  let maximumAdjacentDelta = 0
  let sum = 0
  let sumOfSquares = 0
  let previous = channel[fromFrame]
  if (previous === undefined || !Number.isFinite(previous)) {
    throw new TypeError('PCM measurement contains a non-finite sample')
  }

  for (let frame = fromFrame; frame < toFrame; frame += 1) {
    const sample = channel[frame]
    if (sample === undefined || !Number.isFinite(sample)) {
      throw new TypeError('PCM measurement contains a non-finite sample')
    }
    absolutePeak = Math.max(absolutePeak, Math.abs(sample))
    if (frame > fromFrame)
      maximumAdjacentDelta = Math.max(maximumAdjacentDelta, Math.abs(sample - previous))
    sum += sample
    sumOfSquares += sample * sample
    previous = sample
  }

  const frameCount = toFrame - fromFrame
  const rmsLinear = Math.sqrt(sumOfSquares / frameCount)
  return Object.freeze({
    dcOffset: sum / frameCount,
    maximumAdjacentDelta,
    peakDbfs: linearAmplitudeToDbfs(absolutePeak),
    peakLinear: absolutePeak,
    rmsDbfs: linearAmplitudeToDbfs(rmsLinear),
    rmsLinear,
  })
}

export function measureAudioQualityLoopWrapDelta(channel: Float32Array): number {
  if (channel.length < 2) throw new TypeError('Loop fixture requires at least two frames')
  return Math.abs(channel[0]! - channel[channel.length - 1]!)
}

export function createAudioQualityPcmFixtureSet(): AudioQualityPcmFixtureSet {
  const referenceSine = createReferenceSineChannel()
  const impulse = createChannel(480, (frame) => (frame === 0 ? 1 : 0))
  const loopFrameCount = 481
  const seamlessLoop = createChannel(
    loopFrameCount,
    (frame) =>
      REFERENCE_SINE_AMPLITUDE * Math.sin((2 * Math.PI * 10 * frame) / (loopFrameCount - 1)),
  )
  const discontinuousLoop = createChannel(
    loopFrameCount,
    (frame) => -0.5 + frame / (loopFrameCount - 1),
  )
  const opposedRight = createChannel(referenceSine.length, (frame) => -referenceSine[frame]!)

  return Object.freeze({
    discontinuousLoop: createFixture('discontinuous-loop', [discontinuousLoop]),
    impulse: createFixture('impulse', [impulse]),
    opposedStereo: createFixture('opposed-stereo', [referenceSine.slice(), opposedRight]),
    referenceSine: createFixture('reference-sine', [referenceSine]),
    seamlessLoop: createFixture('seamless-loop', [seamlessLoop]),
  })
}
