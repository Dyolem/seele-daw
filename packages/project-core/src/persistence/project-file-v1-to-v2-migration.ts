import {
  PROJECT_FILE_V2_FORMAT_VERSION,
  type MidiSourceDTO,
  type ProjectFileDTO,
  type ProjectFileV1DTO,
} from '#internal/persistence/project-file-dto'

function defineOwnDataProperty<Value>(
  target: Record<string, Value>,
  key: string,
  value: Value,
): void {
  Object.defineProperty(target, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  })
}

/** Migrates one already-validated V1 DTO without mutating or repairing historical data. */
export function migrateProjectFileV1ToV2(v1: ProjectFileV1DTO): ProjectFileDTO {
  const midiSources: Record<string, MidiSourceDTO> = {}

  for (const sourceId of Object.keys(v1.midiSources).sort()) {
    const source = v1.midiSources[sourceId]!

    defineOwnDataProperty(
      midiSources,
      sourceId,
      Object.freeze({
        ...source,
        sustainPedalEvents: Object.freeze({}),
      }),
    )
  }

  return Object.freeze({
    ...v1,
    formatVersion: PROJECT_FILE_V2_FORMAT_VERSION,
    midiSources: Object.freeze(midiSources),
  })
}
