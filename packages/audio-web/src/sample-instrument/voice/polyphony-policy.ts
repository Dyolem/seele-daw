export interface SampleInstrumentVoiceStealCandidate<TValue> {
  readonly effectiveGain: number
  readonly releaseStarted: boolean
  readonly stableToken: string
  readonly startTime: number
  readonly value: TValue
}

function compareStableToken(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareCandidates<TValue>(
  left: SampleInstrumentVoiceStealCandidate<TValue>,
  right: SampleInstrumentVoiceStealCandidate<TValue>,
): number {
  if (left.releaseStarted !== right.releaseStarted) return left.releaseStarted ? -1 : 1
  if (left.effectiveGain !== right.effectiveGain) return left.effectiveGain - right.effectiveGain
  if (left.startTime !== right.startTime) return left.startTime - right.startTime
  return compareStableToken(left.stableToken, right.stableToken)
}

/** Selects one deterministic victim without mutating the caller-owned Voice collection. */
export function selectSampleInstrumentVoiceStealCandidate<TValue>(
  candidates: readonly SampleInstrumentVoiceStealCandidate<TValue>[],
): TValue | null {
  let selected: SampleInstrumentVoiceStealCandidate<TValue> | null = null
  for (const candidate of candidates) {
    if (selected === null || compareCandidates(candidate, selected) < 0) selected = candidate
  }
  return selected?.value ?? null
}
