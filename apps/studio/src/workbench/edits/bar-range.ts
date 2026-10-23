import {
  PROJECT_PPQ,
  ZERO_TICK,
  parsePositiveTick,
  parseTick,
  type ProjectSnapshot,
  type Tick,
} from '@seele-daw/project-core'

export interface BarRange {
  readonly startTick: Tick
  readonly spanTick: Tick
}

/**
 * Resolves the bar containing `tick` on the grid of the initial meter. Later meter changes
 * deliberately do not affect Clip creation or the editor grid yet.
 */
export function resolveInitialBarRange(snapshot: ProjectSnapshot, tick: Tick): BarRange {
  const meter = snapshot.timeSignatureEvents.find((event) => event.tick === ZERO_TICK)
  if (meter === undefined) throw new Error('The project has no initial time signature')

  const spanTick = parsePositiveTick(((PROJECT_PPQ * 4) / meter.denominator) * meter.numerator)
  return { startTick: parseTick(Math.floor(tick / spanTick) * spanTick), spanTick }
}
