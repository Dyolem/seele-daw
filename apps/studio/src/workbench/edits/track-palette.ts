import { parseProjectColor, type ProjectColor } from '@seele-daw/project-core'

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

/** Picks a palette color at random, avoiding the color of the neighbouring Track. */
export function selectProjectTrackColor(
  randomValue: number,
  adjacentColor: ProjectColor | null,
): ProjectColor {
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new RangeError(`Track color random value must be in [0, 1), received ${randomValue}`)
  }
  const candidates =
    adjacentColor === null
      ? PROJECT_TRACK_PALETTE
      : PROJECT_TRACK_PALETTE.filter((color) => color !== adjacentColor)
  return candidates[Math.floor(randomValue * candidates.length)]!
}
