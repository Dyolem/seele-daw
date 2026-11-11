import {
  PROJECT_FILE_FORMAT_VERSION,
  createMasterChannelRecord,
  createProjectRecord,
  parseLinearGain,
  parseProjectId,
  type ProjectFile,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type CreateProjectMidiImportDraftInput,
  type ProjectMidiImportDiagnostic,
} from '#internal/import/project-midi-import-contract'
import {
  createDiagnostic,
  type ImportIdAllocator,
  normalizeEntityName,
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

export function createImportedProjectFile(
  input: CreateProjectMidiImportDraftInput,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
): ProjectFile {
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
  const clips = entries.flatMap((entry) => entry.clips)

  return {
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    project: createProjectRecord({ id: parseProjectId(projectId), name: projectName }),
    master: createMasterChannelRecord({
      gain: parseLinearGain(1),
      muted: false,
    }),
    trackOrder: entries.map(({ track }) => track.id),
    tracks: entries.map(({ track }) => track),
    clips: clips.map(({ clip }) => clip),
    midiSources: clips.map(({ source }) => source),
    tempoEvents,
    timeSignatureEvents,
    devices: entries.map(({ instrumentDevice }) => instrumentDevice),
    midiNotes: Object.fromEntries(clips.map(({ source, notes }) => [source.id, notes])),
    midiSustainPedalEvents: Object.fromEntries(
      clips.map(({ source, sustainPedalEvents }) => [source.id, sustainPedalEvents]),
    ),
  }
}
