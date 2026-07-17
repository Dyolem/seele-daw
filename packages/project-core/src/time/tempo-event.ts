import type { Brand } from '@seele-daw/type-utils'
import { rejectDomainValue, requireFiniteNumber } from '@/model/domain-value-error'
import { parseTempoEventId, type TempoEventId } from '@/model/ids'
import { parseTick, type Tick } from './tick'

export type TempoBpm = Brand<number, 'TempoBpm'>

export const TEMPO_BPM_MIN = 20
export const TEMPO_BPM_MAX = 400

export interface TempoEventRecord {
  readonly id: TempoEventId
  readonly tick: Tick
  readonly bpm: TempoBpm
}

export interface CreateTempoEventRecordInput {
  readonly id: TempoEventId
  readonly tick: Tick
  readonly bpm: TempoBpm
}

export function parseTempoBpm(value: unknown): TempoBpm {
  const constraint = `a finite number from ${TEMPO_BPM_MIN} through ${TEMPO_BPM_MAX}`
  const bpm = requireFiniteNumber(value, 'TempoBpm', constraint)

  if (bpm < TEMPO_BPM_MIN || bpm > TEMPO_BPM_MAX) {
    rejectDomainValue('TempoBpm', constraint)
  }

  return bpm as TempoBpm
}

export function createTempoEventRecord(input: CreateTempoEventRecordInput): TempoEventRecord {
  return {
    id: parseTempoEventId(input.id),
    tick: parseTick(input.tick),
    bpm: parseTempoBpm(input.bpm),
  }
}
