import {
  createAddInstrumentTrackCollectionCommand,
  createProjectSessionFromProjectFile,
} from '@seele-daw/project-core'
import {
  type CreateProjectMidiImportDraftInput,
  type CreateProjectMidiTrackImportDraftInput,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportDraft,
  type ProjectMidiImportSummary,
  type ProjectMidiTrackImportDraft,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import { ImportIdAllocator, requireNormalizedMidiDocument } from '#internal/import/import-support'
import { createImportedProjectFile } from '#internal/import/project-file-builder'
import { createImportedTrackCollection } from '#internal/import/track-collection-builder'
import {
  addCurrentProjectTimelineDiagnostics,
  addGlobalUnsupportedFactDiagnostics,
} from '#internal/import/timeline-mapper'
import { mapTracks } from '#internal/import/track-mapper'

type ProjectMidiImportSourceInput = Pick<
  CreateProjectMidiTrackImportDraftInput,
  'document' | 'createId' | 'createInstrumentDevice' | 'createTrackColor'
>

interface PreparedProjectMidiImportMapping {
  readonly allocator: ImportIdAllocator
  readonly diagnostics: ProjectMidiImportDiagnostic[]
  readonly mappedTracks: ReturnType<typeof mapTracks>
}

function prepareProjectMidiImportMapping(
  input: ProjectMidiImportSourceInput,
): PreparedProjectMidiImportMapping {
  requireNormalizedMidiDocument(input.document)
  if (
    typeof input.createId !== 'function' ||
    typeof input.createInstrumentDevice !== 'function' ||
    typeof input.createTrackColor !== 'function'
  ) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      'Project MIDI import requires identity, instrument device, and Track color factories.',
    )
  }

  const diagnostics: ProjectMidiImportDiagnostic[] = []
  addGlobalUnsupportedFactDiagnostics(input.document, diagnostics)

  return {
    allocator: new ImportIdAllocator(input.createId),
    diagnostics,
    mappedTracks: mapTracks(input.document, diagnostics),
  }
}

export function createProjectMidiImportDraft(
  input: CreateProjectMidiImportDraftInput,
): ProjectMidiImportDraft {
  const { allocator, diagnostics, mappedTracks } = prepareProjectMidiImportMapping(input)
  const projectFile = createImportedProjectFile(input, mappedTracks, allocator, diagnostics)
  let session

  try {
    session = createProjectSessionFromProjectFile(projectFile)
  } catch (cause) {
    throw new ProjectMidiImportError(
      'project-validation-failed',
      'The imported MIDI document could not form a valid Project Session.',
      {},
      { cause },
    )
  }

  return Object.freeze({
    session,
    diagnostics: Object.freeze([...diagnostics]),
    summary: createImportSummary(input.document, mappedTracks),
  })
}

function createImportSummary(
  document: CreateProjectMidiTrackImportDraftInput['document'],
  mappedTracks: ReturnType<typeof mapTracks>,
): ProjectMidiImportSummary {
  return Object.freeze({
    sourceFormat: document.format,
    sourcePpq: document.ppq,
    sourceTrackCount: document.tracks.length,
    importedTrackCount: mappedTracks.length,
    importedNoteCount: mappedTracks.reduce((count, track) => count + track.notes.length, 0),
  })
}

/** Creates one Core command without reading or replacing the destination Project timeline. */
export function createProjectMidiTrackImportDraft(
  input: CreateProjectMidiTrackImportDraftInput,
): ProjectMidiTrackImportDraft {
  const { allocator, diagnostics, mappedTracks } = prepareProjectMidiImportMapping(input)
  if (mappedTracks.length === 0) {
    throw new ProjectMidiImportError(
      'no-importable-tracks',
      'The MIDI document has no note-bearing Tracks to add to the current Project.',
    )
  }
  addCurrentProjectTimelineDiagnostics(input.document, diagnostics)

  const entries = createImportedTrackCollection(
    input.createInstrumentDevice,
    input.createTrackColor,
    mappedTracks,
    allocator,
    input.placementTick,
  )
  let command

  try {
    command = createAddInstrumentTrackCollectionCommand({
      baseRevision: input.baseRevision,
      entries,
      insertAt: input.insertAt,
    })
  } catch (cause) {
    throw new ProjectMidiImportError(
      'project-validation-failed',
      'The imported MIDI tracks could not form a valid Project Command.',
      {},
      { cause },
    )
  }

  return Object.freeze({
    command,
    importedTrackIds: Object.freeze(command.entries.map((entry) => entry.track.id)),
    diagnostics: Object.freeze([...diagnostics]),
    summary: createImportSummary(input.document, mappedTracks),
  })
}
