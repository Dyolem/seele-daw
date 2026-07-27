import {
  PROJECT_PPQ,
  ZERO_TICK,
  parsePositiveTick,
  parseTick,
  type ProjectSnapshot,
  type Tick,
} from '@seele-daw/project-core'

import { ProjectClipError } from '@/workbench/project/clip/project-clip-error'

export interface ProjectClipBarRange {
  readonly startTick: Tick
  readonly spanTick: Tick
}

/**
 * Resolves the first Clip creation grid from the initial meter. Later meter
 * changes deliberately do not affect this first Arrangement slice.
 */
export function createProjectClipBarRange(
  snapshot: ProjectSnapshot,
  targetTick: Tick,
): ProjectClipBarRange {
  const initialTimeSignature = snapshot.timeSignatureEvents.find(
    (timeSignature) => timeSignature.tick === ZERO_TICK,
  )

  if (initialTimeSignature === undefined) {
    throw new ProjectClipError(
      'initial-time-signature-missing',
      'Cannot create a MIDI Clip without an initial Project time signature',
    )
  }

  const beatSpan = (PROJECT_PPQ * 4) / initialTimeSignature.denominator
  const barSpanTick = parsePositiveTick(beatSpan * initialTimeSignature.numerator)
  const barIndex = Math.floor(targetTick / barSpanTick)

  return Object.freeze({
    startTick: parseTick(barIndex * barSpanTick),
    spanTick: barSpanTick,
  })
}
