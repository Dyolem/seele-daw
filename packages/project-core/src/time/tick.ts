import type { Brand } from '../model/brand'
import { rejectDomainValue } from '../model/domain-value-error'

export type Tick = Brand<number, 'Tick'>

export const PROJECT_PPQ = 960 as const
export const ZERO_TICK = 0 as Tick

export function parseTick(value: unknown): Tick {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    rejectDomainValue('Tick', 'a non-negative safe integer')
  }

  return value as Tick
}

export function parsePositiveTick(value: unknown): Tick {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    rejectDomainValue('Tick', 'a positive safe integer')
  }

  return value as Tick
}
