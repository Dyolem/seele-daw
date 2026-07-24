import { parseProjectColor, type ProjectColor } from '@seele-daw/project-core'

import { ProjectTrackError } from '@/workbench/project/track/project-track-error'

/** Stable project colors tuned for readable musical content on Piano Black surfaces. */
export const PROJECT_TRACK_PALETTE: readonly ProjectColor[] = Object.freeze([
  parseProjectColor('#8B5CF6'),
  parseProjectColor('#4F8CFF'),
  parseProjectColor('#16B8D4'),
  parseProjectColor('#23B26D'),
  parseProjectColor('#D6A43B'),
  parseProjectColor('#F27A3D'),
  parseProjectColor('#E85474'),
  parseProjectColor('#C65AD9'),
])

export function selectProjectTrackColor(
  randomValue: number,
  adjacentColor: ProjectColor | null,
): ProjectColor {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new ProjectTrackError(
      'invalid-random-value',
      'Project Track random value must be a finite number from 0 up to, but not including, 1',
      { randomValue },
    )
  }

  const candidates =
    adjacentColor !== null && PROJECT_TRACK_PALETTE.length > 1
      ? PROJECT_TRACK_PALETTE.filter((color) => color !== adjacentColor)
      : PROJECT_TRACK_PALETTE
  const index = Math.floor(randomValue * candidates.length)

  return candidates[index]!
}
