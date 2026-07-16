import type { Brand } from '@/model/brand'
import { rejectDomainValue } from '@/model/domain-value-error'
import { parseTimeSignatureEventId, type TimeSignatureEventId } from '@/model/ids'
import { parseTick, type Tick } from './tick'

export type TimeSignatureNumerator = Brand<number, 'TimeSignatureNumerator'>

export const TIME_SIGNATURE_NUMERATOR_MIN = 1
export const TIME_SIGNATURE_NUMERATOR_MAX = 32
export const TIME_SIGNATURE_DENOMINATORS = [1, 2, 4, 8, 16, 32] as const

export type TimeSignatureDenominator = (typeof TIME_SIGNATURE_DENOMINATORS)[number]

export interface TimeSignatureEventRecord {
  readonly id: TimeSignatureEventId
  readonly tick: Tick
  readonly numerator: TimeSignatureNumerator
  readonly denominator: TimeSignatureDenominator
}

export interface CreateTimeSignatureEventRecordInput {
  readonly id: TimeSignatureEventId
  readonly tick: Tick
  readonly numerator: TimeSignatureNumerator
  readonly denominator: TimeSignatureDenominator
}

export function parseTimeSignatureNumerator(value: unknown): TimeSignatureNumerator {
  const constraint = `an integer from ${TIME_SIGNATURE_NUMERATOR_MIN} through ${TIME_SIGNATURE_NUMERATOR_MAX}`

  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < TIME_SIGNATURE_NUMERATOR_MIN ||
    value > TIME_SIGNATURE_NUMERATOR_MAX
  ) {
    rejectDomainValue('TimeSignatureNumerator', constraint)
  }

  return value as TimeSignatureNumerator
}

export function parseTimeSignatureDenominator(value: unknown): TimeSignatureDenominator {
  const denominator = TIME_SIGNATURE_DENOMINATORS.find((candidate) => candidate === value)

  if (denominator === undefined) {
    rejectDomainValue(
      'TimeSignatureDenominator',
      `one of ${TIME_SIGNATURE_DENOMINATORS.join(', ')}`,
    )
  }

  return denominator
}

export function createTimeSignatureEventRecord(
  input: CreateTimeSignatureEventRecordInput,
): TimeSignatureEventRecord {
  return {
    id: parseTimeSignatureEventId(input.id),
    tick: parseTick(input.tick),
    numerator: parseTimeSignatureNumerator(input.numerator),
    denominator: parseTimeSignatureDenominator(input.denominator),
  }
}
