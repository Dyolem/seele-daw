import type { Brand } from '@/model/brand'
import { rejectDomainValue } from '@/model/domain-value-error'

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

/** Adds two non-negative Tick values and rejects unsafe integer overflow. */
export function addTicks(left: Tick, right: Tick): Tick {
  const leftTick = parseTick(left)
  const rightTick = parseTick(right)
  const result = leftTick + rightTick

  if (!Number.isSafeInteger(result)) {
    rejectDomainValue('TickSum', 'a non-negative safe integer')
  }

  return result as Tick
}
