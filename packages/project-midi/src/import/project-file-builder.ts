import {
  PROJECT_FILE_FORMAT_VERSION,
  type DeviceDTO,
  type InstrumentTrackCollectionEntry,
  type JsonValue,
  type ProjectFileDTO,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type CreateProjectMidiImportDraftInput,
  type ProjectMidiImportDiagnostic,
} from '#internal/import/project-midi-import-contract'
import {
  createDiagnostic,
  createRecordTable,
  type ImportIdAllocator,
  normalizeEntityName,
  setRecord,
} from '#internal/import/import-support'
import { createTempoEvents, createTimeSignatureEvents } from '#internal/import/timeline-mapper'
import { createImportedTrackCollection } from '#internal/import/track-collection-builder'
import type { MappedTrack } from '#internal/import/track-mapper'

const DEFAULT_PROJECT_NAME = 'Imported MIDI'

function selectProjectName(
  input: CreateProjectMidiImportDraftInput,
  diagnostics: ProjectMidiImportDiagnostic[],
): string {
  const requestedName = input.projectName ?? input.document.name
  const sourceName = typeof requestedName === 'string' ? requestedName : ''
  const importedName = normalizeEntityName(sourceName, DEFAULT_PROJECT_NAME)
  if (sourceName !== importedName) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROJECT_NAME_ADJUSTED,
        message: 'The imported project name was trimmed, truncated, or replaced.',
        originalName: sourceName,
        importedName,
      }),
    )
  }
  return importedName
}

function copyDeviceParameters(descriptor: DeviceDTO): Readonly<Record<string, JsonValue>> {
  const parameters = createRecordTable<JsonValue>()
  for (const [id, value] of Object.entries(descriptor.parameters)) setRecord(parameters, id, value)
  return parameters
}

function createInstrumentDeviceDto(descriptor: DeviceDTO): DeviceDTO {
  return {
    id: descriptor.id,
    typeId: descriptor.typeId,
    definitionVersion: descriptor.definitionVersion,
    enabled: descriptor.enabled,
    parameters: copyDeviceParameters(descriptor),
    opaqueState: descriptor.opaqueState,
  }
}

interface ProjectFileCollections {
  readonly trackOrder: string[]
  readonly tracks: Record<string, ProjectFileDTO['tracks'][string]>
  readonly clips: Record<string, ProjectFileDTO['clips'][string]>
  readonly midiSources: Record<string, ProjectFileDTO['midiSources'][string]>
  readonly devices: Record<string, ProjectFileDTO['devices'][string]>
}

function addTrackCollection(
  entries: readonly InstrumentTrackCollectionEntry[],
  collections: ProjectFileCollections,
): void {
  for (const entry of entries) {
    collections.trackOrder.push(entry.track.id)
    setRecord(collections.tracks, entry.track.id, entry.track)
    setRecord(
      collections.devices,
      entry.instrumentDevice.id,
      createInstrumentDeviceDto(entry.instrumentDevice),
    )

    for (const clipGraph of entry.clips) {
      const notes = createRecordTable<ProjectFileDTO['midiSources'][string]['notes'][string]>()
      for (const note of clipGraph.notes) setRecord(notes, note.id, note)
      const sustainPedalEvents =
        createRecordTable<ProjectFileDTO['midiSources'][string]['sustainPedalEvents'][string]>()
      for (const event of clipGraph.sustainPedalEvents) {
        setRecord(sustainPedalEvents, event.id, event)
      }

      setRecord(collections.clips, clipGraph.clip.id, clipGraph.clip)
      setRecord(collections.midiSources, clipGraph.source.id, {
        ...clipGraph.source,
        notes,
        sustainPedalEvents,
      })
    }
  }
}

export function createImportedProjectFile(
  input: CreateProjectMidiImportDraftInput,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
): ProjectFileDTO {
  const projectId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.PROJECT)
  const projectName = selectProjectName(input, diagnostics)
  const tempoEvents = createTempoEvents(input.document, allocator, diagnostics)
  const timeSignatureEvents = createTimeSignatureEvents(input.document, allocator, diagnostics)
  const entries = createImportedTrackCollection(
    input.createInstrumentDevice,
    input.createTrackColor,
    mappedTracks,
    allocator,
    diagnostics,
  )
  const collections: ProjectFileCollections = {
    trackOrder: [],
    tracks: createRecordTable(),
    clips: createRecordTable(),
    midiSources: createRecordTable(),
    devices: createRecordTable(),
  }
  addTrackCollection(entries, collections)
  return {
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    requiredFeatures: [],
    projectId,
    name: projectName,
    trackOrder: collections.trackOrder,
    tracks: collections.tracks,
    clips: collections.clips,
    midiSources: collections.midiSources,
    tempoEvents,
    timeSignatureEvents,
    devices: collections.devices,
    master: { gain: 1, muted: false, audioEffectIds: [] },
  }
}
