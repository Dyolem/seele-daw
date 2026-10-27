import {
  MAX_ENTITY_NAME_LENGTH,
  parseClipId,
  parseDeviceId,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTimeSignatureEventId,
  parseTrackId,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportEntityKind,
  type ProjectMidiImportIdFactory,
} from '#internal/import/project-midi-import-contract'

export interface ImportIdContext {
  readonly sourceTrackIndex?: number
  readonly sourceNoteIndex?: number
  readonly sourceControlChangeIndex?: number
}

type IdParser = (value: unknown) => string

const ID_PARSERS: Readonly<Record<ProjectMidiImportEntityKind, IdParser>> = Object.freeze({
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.PROJECT]: parseProjectId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.TRACK]: parseTrackId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.CLIP]: parseClipId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_SOURCE]: parseMidiSourceId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_NOTE]: parseNoteId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_SUSTAIN_PEDAL_EVENT]: parseMidiSustainPedalEventId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.DEVICE]: parseDeviceId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.TEMPO_EVENT]: parseTempoEventId,
  [PROJECT_MIDI_IMPORT_ENTITY_KIND.TIME_SIGNATURE_EVENT]: parseTimeSignatureEventId,
})

export class ImportIdAllocator {
  readonly #createId: ProjectMidiImportIdFactory
  readonly #ordinals = new Map<ProjectMidiImportEntityKind, number>()
  readonly #seenByKind = new Map<ProjectMidiImportEntityKind, Set<string>>()

  constructor(createId: ProjectMidiImportIdFactory) {
    this.#createId = createId
  }

  allocate(kind: ProjectMidiImportEntityKind, context: ImportIdContext = {}): string {
    const ordinal = this.#ordinals.get(kind) ?? 0
    const request = Object.freeze({ kind, ordinal, ...context })
    let id: string

    try {
      id = ID_PARSERS[kind](this.#createId(request))
    } catch (cause) {
      throw new Error(`The MIDI import identity factory could not create a valid ${kind} ID.`, {
        cause,
      })
    }

    const seenIds = this.#seenByKind.get(kind) ?? new Set<string>()
    if (seenIds.has(id)) {
      throw new Error(`The MIDI import identity factory generated duplicate ${kind} ID ${id}.`)
    }

    seenIds.add(id)
    this.#seenByKind.set(kind, seenIds)
    this.#ordinals.set(kind, ordinal + 1)
    return id
  }
}

export function createDiagnostic(input: ProjectMidiImportDiagnostic): ProjectMidiImportDiagnostic {
  return Object.freeze({
    ...input,
    ...(input.controllerNumbers === undefined
      ? {}
      : { controllerNumbers: Object.freeze([...input.controllerNumbers]) }),
  })
}

export function normalizeEntityName(value: string, fallback: string): string {
  const trimmedValue = value.trim()
  const selectedValue = trimmedValue.length === 0 ? fallback : trimmedValue
  return Array.from(selectedValue).slice(0, MAX_ENTITY_NAME_LENGTH).join('')
}
