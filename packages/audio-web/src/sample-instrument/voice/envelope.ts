import type { SampleInstrumentEnvelopeSegmentV1 } from '#internal/sample-instrument/contract/manifest'

export const SAMPLE_INSTRUMENT_ENVELOPE_CURVE_LIMIT = 10
const CURVED_SEGMENT_COUNT = 32
const LINEAR_CURVE_EPSILON = 1e-6

function clampUnitInterval(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Maps normalized envelope time to normalized progress. Shape zero and null are linear;
 * positive shapes defer the transition while negative shapes front-load it.
 */
export function evaluateSampleInstrumentEnvelopeProgress(
  normalizedTime: number,
  curve: number | null,
): number {
  const time = clampUnitInterval(normalizedTime)
  if (curve === null || Math.abs(curve) < LINEAR_CURVE_EPSILON) return time
  const shape = Math.min(
    SAMPLE_INSTRUMENT_ENVELOPE_CURVE_LIMIT,
    Math.max(-SAMPLE_INSTRUMENT_ENVELOPE_CURVE_LIMIT, curve),
  )
  return Math.expm1(shape * time) / Math.expm1(shape)
}

export function evaluateSampleInstrumentEnvelopeTransition(
  startValue: number,
  endValue: number,
  normalizedTime: number,
  curve: number | null,
): number {
  const progress = evaluateSampleInstrumentEnvelopeProgress(normalizedTime, curve)
  return startValue + (endValue - startValue) * progress
}

/** Uses piecewise native ramps so later cancellation can safely replace future automation. */
export function scheduleSampleInstrumentEnvelopeTransition(
  parameter: AudioParam,
  startValue: number,
  endValue: number,
  startTime: number,
  segment: SampleInstrumentEnvelopeSegmentV1,
  maximumDurationSecond = segment.durationSecond,
): number {
  const scheduledDurationSecond = Math.max(
    0,
    Math.min(segment.durationSecond, maximumDurationSecond),
  )
  parameter.setValueAtTime(startValue, startTime)
  if (segment.durationSecond === 0) {
    parameter.setValueAtTime(endValue, startTime)
    return endValue
  }
  if (scheduledDurationSecond === 0) {
    return startValue
  }

  const normalizedEndTime = scheduledDurationSecond / segment.durationSecond
  const scheduledEndValue = evaluateSampleInstrumentEnvelopeTransition(
    startValue,
    endValue,
    normalizedEndTime,
    segment.curve,
  )
  const endTime = startTime + scheduledDurationSecond
  if (segment.curve === null || Math.abs(segment.curve) < LINEAR_CURVE_EPSILON) {
    parameter.linearRampToValueAtTime(scheduledEndValue, endTime)
    return scheduledEndValue
  }

  const scheduledSegmentCount = Math.max(1, Math.ceil(CURVED_SEGMENT_COUNT * normalizedEndTime))
  for (let index = 1; index <= scheduledSegmentCount; index += 1) {
    const normalizedTime = normalizedEndTime * (index / scheduledSegmentCount)
    parameter.linearRampToValueAtTime(
      evaluateSampleInstrumentEnvelopeTransition(
        startValue,
        endValue,
        normalizedTime,
        segment.curve,
      ),
      startTime + segment.durationSecond * normalizedTime,
    )
  }
  return scheduledEndValue
}
