import { PROJECT_PPQ } from '@seele-daw/project-core'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * Converts absolute endpoints independently using integer half-up rounding. Ticks and PPQ come
 * from a decoded document, so only the Project's range can reject them.
 */
export function convertMidiTickToProjectTick(sourceTick: number, sourcePpq: number): number {
  const divisor = BigInt(sourcePpq)
  const scaledTick = BigInt(sourceTick) * BigInt(PROJECT_PPQ)
  const roundedTick = (scaledTick + divisor / 2n) / divisor

  if (roundedTick > MAX_SAFE_INTEGER_BIGINT) {
    throw new RangeError(
      `MIDI tick ${sourceTick} cannot be represented safely at Project PPQ ${PROJECT_PPQ}.`,
    )
  }

  return Number(roundedTick)
}
