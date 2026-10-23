import type { StudioContext } from '@/workbench/actions/studio-action'

/** Native activation and composite-widget navigation take precedence over application shortcuts. */
export function isWidgetOwnedKeyboardInput(event: KeyboardEvent, context: StudioContext): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  if (event.key === 'Tab') return true
  const element = event.composedPath().find((item): item is Element => item instanceof Element)
  if (element === undefined) return false
  if (event.key === 'Enter' && context.ownsEnter) return false
  if (
    (event.key === 'Enter' || event.key === ' ') &&
    element.closest(
      'button, a[href], input[type="button"], input[type="submit"], input[type="reset"], [role="button"]',
    )
  )
    return true
  const widget = element.closest(
    '[role="slider"], [role="separator"], [role="tablist"], [role="radiogroup"], [role="menu"], [role="listbox"]',
  )
  return (
    widget !== null &&
    [
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Enter',
      ' ',
    ].includes(event.key)
  )
}
