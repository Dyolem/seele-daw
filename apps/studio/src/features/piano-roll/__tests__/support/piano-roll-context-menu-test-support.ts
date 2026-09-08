import { DOMWrapper, flushPromises } from '@vue/test-utils'

export async function requestPianoRollContextMenu(target: Element): Promise<MouseEvent> {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
    clientX: 100,
    clientY: 100,
    composed: true,
  })
  target.dispatchEvent(event)
  await flushPromises()
  return event
}

export function getPianoRollContextMenu(): DOMWrapper<HTMLElement> {
  const menu = document.body.querySelector<HTMLElement>('.piano-roll-context-menu')
  if (menu === null) throw new Error('Expected a Piano Roll context menu')
  return new DOMWrapper(menu)
}

export function getPianoRollContextMenuItem(label: string): DOMWrapper<Element> {
  const item = getPianoRollContextMenu()
    .findAll('[role="menuitem"]')
    .find((candidate) => candidate.text().startsWith(label))
  if (item === undefined) throw new Error(`Expected context menu action: ${label}`)
  return item
}
