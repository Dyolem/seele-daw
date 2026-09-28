/** A separate preference record; never part of Project persistence or History. */
export interface StudioUserKeymapStorage {
  read(): string | null
  write(record: string): void
}
