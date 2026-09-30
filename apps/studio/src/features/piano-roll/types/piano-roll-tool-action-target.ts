import type { PianoRollTool } from '@/features/piano-roll/types/piano-roll-preferences'

export interface PianoRollToolActionTarget {
  isFocused(): boolean
  getTool(): PianoRollTool
  activateTool(tool: PianoRollTool): void
  isSnapEnabled(): boolean
  toggleSnap(): void
}
