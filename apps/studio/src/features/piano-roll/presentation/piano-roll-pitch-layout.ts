import { parseMidiPitch } from '@seele-daw/project-core'

export const INITIAL_MINIMUM_PITCH = parseMidiPitch(48)
export const INITIAL_MAXIMUM_PITCH = parseMidiPitch(72)

export const PIANO_ROLL_KEYS = Object.freeze(
  Array.from({ length: INITIAL_MAXIMUM_PITCH - INITIAL_MINIMUM_PITCH + 1 }, (_, index) => {
    const pitch = INITIAL_MAXIMUM_PITCH - index
    const pitchClass = pitch % 12
    return Object.freeze({
      isBlack: [1, 3, 6, 8, 10].includes(pitchClass),
      label: pitchClass === 0 ? `C${Math.floor(pitch / 12) - 1}` : '',
      pitch,
    })
  }),
)
