import type { ValueOf } from '@seele-daw/type-utils'

export const PIANO_ROLL_TOOL = {
  CURSOR: 'cursor',
  PENCIL: 'pencil',
} as const

export type PianoRollTool = ValueOf<typeof PIANO_ROLL_TOOL>

export const PIANO_ROLL_EDITING_SCOPE = {
  CLIP: 'clip',
  TRACK: 'track',
} as const

export type PianoRollEditingScope = ValueOf<typeof PIANO_ROLL_EDITING_SCOPE>

export const PIANO_ROLL_GRID_PRESET = {
  SIXTEENTH: '1/16',
} as const

export type PianoRollGridPreset = ValueOf<typeof PIANO_ROLL_GRID_PRESET>
