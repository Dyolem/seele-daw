import { PROJECT_PPQ } from '@seele-daw/project-core'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'

const MAX_STANDARD_MIDI_FILE_PPQ = 0x7fff
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

export function assertSourcePpq(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_STANDARD_MIDI_FILE_PPQ) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      `MIDI PPQ must be an integer from 1 through ${MAX_STANDARD_MIDI_FILE_PPQ}.`,
      { value },
    )
  }
}

/** Converts absolute endpoints independently using integer half-up rounding. */
export function convertMidiTickToProjectTick(sourceTick: number, sourcePpq: number): number {
  if (!Number.isSafeInteger(sourceTick) || sourceTick < 0) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      'MIDI event ticks must be non-negative safe integers.',
      { sourceTick, value: sourceTick },
    )
  }

  assertSourcePpq(sourcePpq)

  const divisor = BigInt(sourcePpq)
  const scaledTick = BigInt(sourceTick) * BigInt(PROJECT_PPQ)
  const roundedTick = (scaledTick + divisor / 2n) / divisor

  if (roundedTick > MAX_SAFE_INTEGER_BIGINT) {
    throw new ProjectMidiImportError(
      'tick-conversion-overflow',
      `MIDI tick ${sourceTick} cannot be represented safely at Project PPQ ${PROJECT_PPQ}.`,
      { sourceTick },
    )
  }

  return Number(roundedTick)
}
