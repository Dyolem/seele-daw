import type { SoundbankId } from '@seele-daw/playback'

export const SAMPLE_INSTRUMENT_MANIFEST_SCHEMA = 'seele.sample-instrument-manifest'
export const SAMPLE_INSTRUMENT_MANIFEST_VERSION = 1

export type SampleInstrumentTriggerModeV1 = 'gated' | 'one-shot'

export type SampleInstrumentSelectorV1 =
  | {
      readonly kind: 'exact-midi'
      readonly pitch: number
    }
  | {
      readonly kind: 'midi-range'
      readonly maximumPitch: number
      readonly minimumPitch: number
    }

export type SampleInstrumentLoopV1 =
  | {
      readonly kind: 'none'
    }
  | {
      readonly endSecond: number
      readonly kind: 'continuous' | 'sustain'
      readonly startSecond: number
    }

export interface SampleInstrumentEnvelopeSegmentV1 {
  readonly curve: number | null
  readonly durationSecond: number
}

export interface SampleInstrumentAmplitudeEnvelopeV1 {
  readonly attack: SampleInstrumentEnvelopeSegmentV1
  readonly release: SampleInstrumentEnvelopeSegmentV1 | null
}

export interface SampleInstrumentExclusiveGroupV1 {
  readonly groupId: number
  readonly offByGroupId: number
  readonly offMode: 'fast' | 'normal'
}

export interface SampleInstrumentResourceV1 {
  readonly key: string
  readonly mediaType: 'audio/wav'
}

export interface SampleInstrumentZoneV1 {
  readonly amplitudeEnvelope: SampleInstrumentAmplitudeEnvelopeV1
  readonly exclusiveGroup: SampleInstrumentExclusiveGroupV1 | null
  readonly loop: SampleInstrumentLoopV1
  readonly resource: SampleInstrumentResourceV1
  readonly rootMidiPitch: number
  readonly selector: SampleInstrumentSelectorV1
  readonly startOffsetSecond: number
  readonly triggerMode: SampleInstrumentTriggerModeV1
  readonly tuneCent: number
  readonly zoneId: string
}

export interface SampleInstrumentManifestV1 {
  readonly displayName: string
  readonly schema: typeof SAMPLE_INSTRUMENT_MANIFEST_SCHEMA
  readonly schemaVersion: typeof SAMPLE_INSTRUMENT_MANIFEST_VERSION
  readonly soundbankId: SoundbankId
  readonly zones: readonly SampleInstrumentZoneV1[]
}

export function getSampleInstrumentSelectorBounds(
  selector: SampleInstrumentSelectorV1,
): readonly [number, number] {
  return selector.kind === 'exact-midi'
    ? [selector.pitch, selector.pitch]
    : [selector.minimumPitch, selector.maximumPitch]
}

export function compareSampleInstrumentZones(
  left: SampleInstrumentZoneV1,
  right: SampleInstrumentZoneV1,
): number {
  const [leftMinimum, leftMaximum] = getSampleInstrumentSelectorBounds(left.selector)
  const [rightMinimum, rightMaximum] = getSampleInstrumentSelectorBounds(right.selector)
  const identityOrder = left.zoneId < right.zoneId ? -1 : left.zoneId > right.zoneId ? 1 : 0
  return (
    leftMinimum - rightMinimum ||
    leftMaximum - rightMaximum ||
    left.rootMidiPitch - right.rootMidiPitch ||
    identityOrder
  )
}
