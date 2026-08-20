import type { MidiFileDecoder, MidiFileDocument } from '@seele-daw/midi-file'
import type { ProjectId } from '@seele-daw/project-core'
import type { LocalFileByteReader } from '@seele-daw/platform-browser'
import {
  createProjectMidiImportDraft,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportIdFactory,
  type ProjectMidiImportSummary,
  type ProjectMidiInstrumentDeviceFactory,
} from '@seele-daw/project-midi'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'

export interface ProjectMidiImportResult {
  readonly diagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly projectId: ProjectId
  readonly summary: ProjectMidiImportSummary
}

export interface ProjectMidiImportCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'createFromSession'>
  readonly createId: ProjectMidiImportIdFactory
  readonly createInstrumentDevice: ProjectMidiInstrumentDeviceFactory
  readonly decoder: MidiFileDecoder
  readonly fileReader: LocalFileByteReader
}

export interface ProjectMidiImportCoordinator {
  importLocalFile(file: Blob): Promise<ProjectMidiImportResult>
}

const MIDI_FILE_EXTENSION_PATTERN = /\.(?:mid|midi)$/iu

function readLocalFileName(file: Blob): string | null {
  const name = (file as Blob & { readonly name?: unknown }).name
  return typeof name === 'string' ? name : null
}

function selectFallbackProjectName(document: MidiFileDocument, file: Blob): string | undefined {
  if (typeof document.name === 'string' && document.name.trim().length > 0) return undefined

  const fileName = readLocalFileName(file)
  if (fileName === null) return undefined

  const nameWithoutExtension = fileName.replace(MIDI_FILE_EXTENSION_PATTERN, '').trim()
  return nameWithoutExtension.length > 0 ? nameWithoutExtension : undefined
}

/** Coordinates one local MIDI file across browser, codec, Project mapping, and lifecycle owners. */
export function createProjectMidiImportCoordinator(
  dependencies: ProjectMidiImportCoordinatorDependencies,
): ProjectMidiImportCoordinator {
  return Object.freeze({
    async importLocalFile(file: Blob): Promise<ProjectMidiImportResult> {
      // No Project lifecycle write starts until browser bytes, SMF decoding, and the complete
      // imported Session have all passed their respective validation boundaries.
      const bytes = await dependencies.fileReader.read(file)
      const document = dependencies.decoder.decode(bytes)
      const projectName = selectFallbackProjectName(document, file)
      const draft = createProjectMidiImportDraft({
        document,
        createId: dependencies.createId,
        createInstrumentDevice: dependencies.createInstrumentDevice,
        ...(projectName === undefined ? {} : { projectName }),
      })
      const projectId = await dependencies.activeProject.createFromSession(draft.session)

      return Object.freeze({
        diagnostics: draft.diagnostics,
        projectId,
        summary: draft.summary,
      })
    },
  })
}
