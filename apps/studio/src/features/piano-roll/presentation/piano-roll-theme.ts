import type { PianoRollSurfaceThemeSnapshot } from '@/features/piano-roll/types/piano-roll-theme'

function readThemeColor(style: CSSStyleDeclaration, token: string): string {
  return style.getPropertyValue(token).trim()
}

export function createPianoRollThemeSnapshot(
  element: HTMLElement,
  color: string | null,
): PianoRollSurfaceThemeSnapshot {
  const style = getComputedStyle(element)
  return Object.freeze({
    grid: Object.freeze({
      background: readThemeColor(style, '--sd-color-surface-canvas'),
      blackPitchRow: readThemeColor(style, '--sd-editor-pitch-row-black'),
      gridBar: readThemeColor(style, '--sd-editor-grid-bar'),
      gridBeat: readThemeColor(style, '--sd-editor-grid-beat'),
      gridSubdivision: readThemeColor(style, '--sd-editor-grid-subdivision'),
      pitchRowBorder: readThemeColor(style, '--sd-editor-pitch-row-border'),
      whitePitchRow: readThemeColor(style, '--sd-editor-pitch-row-white'),
    }),
    noteBorderColor: readThemeColor(style, '--sd-editor-note-border'),
    noteFillColor: color ?? readThemeColor(style, '--sd-color-border-focus'),
    selectedNoteBorderColor: readThemeColor(style, '--sd-editor-note-selected-border'),
    selectedNoteGlowColor: readThemeColor(style, '--sd-editor-note-selected-glow'),
  })
}
