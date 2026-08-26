export interface AudioQualityAq0ChannelMeasurement {
  readonly dcOffset: number
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
}

export interface AudioQualityAq0CombinedMeasurement {
  readonly channelMeasurements: readonly AudioQualityAq0ChannelMeasurement[]
  readonly peakDbfs: number | null
  readonly peakLinear: number
  readonly rmsDbfs: number | null
  readonly rmsLinear: number
}

function requireMeasurementWindow(
  channels: readonly Float32Array[],
  fromFrame: number,
  toFrame: number,
): void {
  if (
    channels.length === 0 ||
    !Number.isSafeInteger(fromFrame) ||
    !Number.isSafeInteger(toFrame) ||
    fromFrame < 0 ||
    toFrame <= fromFrame ||
    channels.some((channel) => toFrame > channel.length)
  ) {
    throw new TypeError('AQ0 PCM measurement window must be a non-empty in-range frame interval')
  }
}

export function linearAmplitudeToDbfs(linearAmplitude: number): number | null {
  if (!Number.isFinite(linearAmplitude) || linearAmplitude < 0) {
    throw new TypeError('Linear amplitude must be a finite non-negative number')
  }
  return linearAmplitude === 0 ? null : 20 * Math.log10(linearAmplitude)
}

export function measureAudioQualityAq0Channel(
  channel: Float32Array,
  fromFrame: number,
  toFrame: number,
): AudioQualityAq0ChannelMeasurement {
  requireMeasurementWindow([channel], fromFrame, toFrame)

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

export function measureAudioQualityAq0Channels(
  channels: readonly Float32Array[],
  fromFrame: number,
  toFrame: number,
): AudioQualityAq0CombinedMeasurement {
  requireMeasurementWindow(channels, fromFrame, toFrame)
  const channelMeasurements = Object.freeze(
    channels.map((channel) => measureAudioQualityAq0Channel(channel, fromFrame, toFrame)),
  )
  const peakLinear = Math.max(...channelMeasurements.map((measurement) => measurement.peakLinear))
  const rmsLinear = Math.sqrt(
    channelMeasurements.reduce((total, measurement) => total + measurement.rmsLinear ** 2, 0) /
      channelMeasurements.length,
  )
  return Object.freeze({
    channelMeasurements,
    peakDbfs: linearAmplitudeToDbfs(peakLinear),
    peakLinear,
    rmsDbfs: linearAmplitudeToDbfs(rmsLinear),
    rmsLinear,
  })
}

export function countAudioQualityClippedFrames(
  channels: readonly Float32Array[],
  fromFrame: number,
  toFrame: number,
): number {
  requireMeasurementWindow(channels, fromFrame, toFrame)
  let clippedFrameCount = 0
  for (let frame = fromFrame; frame < toFrame; frame += 1) {
    if (channels.some((channel) => Math.abs(channel[frame]!) >= 1)) clippedFrameCount += 1
  }
  return clippedFrameCount
}
