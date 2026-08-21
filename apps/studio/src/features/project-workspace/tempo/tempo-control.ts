import {
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  parseTempoBpm,
  type TempoBpm,
  type TempoEventRecord,
} from '@seele-daw/project-core'

import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

export const PROJECT_TEMPO_CONTROL_MODE = Object.freeze({
  SINGLE: 'single',
  TEMPO_MAP: 'tempo-map',
} as const)

export type ProjectTempoControlMode =
  (typeof PROJECT_TEMPO_CONTROL_MODE)[keyof typeof PROJECT_TEMPO_CONTROL_MODE]

export interface ProjectTempoControlPresentation {
  readonly bpm: TempoBpm
  readonly displayBpm: string
  readonly mode: ProjectTempoControlMode
}

export type ProjectTempoInputResult =
  | {
      readonly status: 'accepted'
      readonly bpm: TempoBpm
    }
  | {
      readonly status: 'rejected'
      readonly message: string
    }

/** Formats Project precision for a compact DAW control without mutating the stored BPM. */
export function formatProjectTempoBpm(bpm: TempoBpm): string {
  return parseTempoBpm(bpm)
    .toFixed(2)
    .replace(/\.?0+$/, '')
}

/** Selects the step Tempo Event active at the continuous Transport position. */
export function createProjectTempoControlPresentation(
  tempoEvents: readonly TempoEventRecord[],
  positionTick: ProjectPlaybackVisualPosition['positionTick'],
): ProjectTempoControlPresentation {
  const orderedEvents = [...tempoEvents].sort((left, right) => {
    if (left.tick !== right.tick) return left.tick - right.tick
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })
  const initialEvent = orderedEvents[0]
  if (initialEvent === undefined) {
    throw new Error('Project Tempo control requires an initial Tempo Event')
  }

  let activeEvent = initialEvent
  for (const event of orderedEvents) {
    if (event.tick > positionTick) break
    activeEvent = event
  }

  return Object.freeze({
    bpm: activeEvent.bpm,
    displayBpm: formatProjectTempoBpm(activeEvent.bpm),
    mode:
      orderedEvents.length === 1
        ? PROJECT_TEMPO_CONTROL_MODE.SINGLE
        : PROJECT_TEMPO_CONTROL_MODE.TEMPO_MAP,
  })
}

/** Parses the deliberately narrower, at-most-two-decimal Studio editing surface. */
export function parseProjectTempoInput(input: string): ProjectTempoInputResult {
  const candidate = input.trim()
  if (!/^\d+(?:\.\d*)?$/.test(candidate)) {
    return Object.freeze({
      status: 'rejected',
      message: 'Tempo must be a decimal number.',
    })
  }

  const fraction = candidate.split('.')[1]
  if (fraction !== undefined && fraction.length > 2) {
    return Object.freeze({
      status: 'rejected',
      message: 'Tempo supports at most two decimal places.',
    })
  }

  const numericBpm = Number(candidate)
  if (numericBpm < TEMPO_BPM_MIN || numericBpm > TEMPO_BPM_MAX) {
    return Object.freeze({
      status: 'rejected',
      message: `Tempo must be from ${TEMPO_BPM_MIN} through ${TEMPO_BPM_MAX} BPM.`,
    })
  }

  return Object.freeze({ status: 'accepted', bpm: parseTempoBpm(numericBpm) })
}
