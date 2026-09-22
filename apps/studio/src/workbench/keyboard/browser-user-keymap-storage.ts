/** A separate preference record; never part of Project persistence or History. */
export const STUDIO_USER_KEYMAP_STORAGE_KEY = 'seele.studio.user-keymap'

export interface StudioUserKeymapStorage {
  read(): string | null
  write(record: string): void
}

export function createBrowserUserKeymapStorage(
  getStorage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage,
): StudioUserKeymapStorage {
  // Access is lazy: browsers can throw even when reading the localStorage property.
  return Object.freeze({
    read: () => getStorage().getItem(STUDIO_USER_KEYMAP_STORAGE_KEY),
    write: (record: string) => getStorage().setItem(STUDIO_USER_KEYMAP_STORAGE_KEY, record),
  })
}
