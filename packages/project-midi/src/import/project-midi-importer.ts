import { createProjectSessionFromProjectFile } from '@seele-daw/project-core'
import {
  type CreateProjectMidiImportDraftInput,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportDraft,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import { ImportIdAllocator, requireNormalizedMidiDocument } from '#internal/import/import-support'
import { createImportedProjectFile } from '#internal/import/project-file-builder'
import { addGlobalUnsupportedFactDiagnostics } from '#internal/import/timeline-mapper'
import { mapTracks } from '#internal/import/track-mapper'

export function createProjectMidiImportDraft(
  input: CreateProjectMidiImportDraftInput,
): ProjectMidiImportDraft {
  requireNormalizedMidiDocument(input.document)
  if (typeof input.createId !== 'function' || typeof input.createInstrumentDevice !== 'function') {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      'Project MIDI import requires identity and instrument device factories.',
    )
  }

  const diagnostics: ProjectMidiImportDiagnostic[] = []
  addGlobalUnsupportedFactDiagnostics(input.document, diagnostics)
  const mappedTracks = mapTracks(input.document, diagnostics)
  const allocator = new ImportIdAllocator(input.createId)
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

  const importedNoteCount = mappedTracks.reduce((count, track) => count + track.notes.length, 0)
  return Object.freeze({
    session,
    diagnostics: Object.freeze([...diagnostics]),
    summary: Object.freeze({
      sourceFormat: input.document.format,
      sourcePpq: input.document.ppq,
      sourceTrackCount: input.document.tracks.length,
      importedTrackCount: mappedTracks.length,
      importedNoteCount,
    }),
  })
}
