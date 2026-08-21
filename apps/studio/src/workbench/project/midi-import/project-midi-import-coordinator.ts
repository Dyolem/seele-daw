import type { MidiFileDecoder, MidiFileDocument } from '@seele-daw/midi-file'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  type ProjectColor,
  type ProjectId,
  type ProjectSnapshot,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'
import type { LocalFileByteReader } from '@seele-daw/platform-browser'
import {
  createProjectMidiImportDraft,
  createProjectMidiTrackImportDraft,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportDraft,
  type ProjectMidiImportIdFactory,
  type ProjectMidiImportSummary,
  type ProjectMidiInstrumentDeviceFactory,
  type ProjectMidiTrackColorFactory,
} from '@seele-daw/project-midi'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import {
  PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND,
  PROJECT_NAVIGATION_INTENT_KIND,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { selectProjectTrackColor } from '@/workbench/project/track/project-track-palette'

export interface ProjectMidiImportResult {
  readonly diagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly projectId: ProjectId
  readonly summary: ProjectMidiImportSummary
}

export interface ProjectMidiTrackImportResult {
  readonly diagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly importedTrackIds: readonly TrackId[]
  readonly projectId: ProjectId
  readonly summary: ProjectMidiImportSummary
}

export interface ProjectMidiImportCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'createFromSession' | 'state'>
  readonly createId: ProjectMidiImportIdFactory
  readonly createInstrumentDevice: ProjectMidiInstrumentDeviceFactory
  readonly createRandomValue: () => number
  readonly decoder: MidiFileDecoder
  readonly fileReader: LocalFileByteReader
  readonly navigationConfirmation: Pick<ProjectNavigationConfirmationCoordinator, 'confirm'>
}

export interface ProjectMidiImportCoordinator {
  importLocalFile(file: Blob): Promise<ProjectMidiImportResult>
  importLocalFileAsNewTracks(file: Blob, placementTick: Tick): Promise<ProjectMidiTrackImportResult>
  importLocalFileReplacingActiveProject(file: Blob): Promise<ProjectMidiImportResult | null>
}

const MIDI_FILE_EXTENSION_PATTERN = /\.(?:mid|midi)$/iu

function lastOrderedTrackColor(snapshot: ProjectSnapshot): ProjectColor | null {
  const lastTrackId = snapshot.trackOrder.at(-1)
  if (lastTrackId === undefined) return null
  return snapshot.tracks.find((track) => track.id === lastTrackId)?.color ?? null
}

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
  function createTrackColorFactory(
    initialAdjacentColor: ProjectColor | null,
  ): ProjectMidiTrackColorFactory {
    let adjacentColor = initialAdjacentColor

    return () => {
      const color = selectProjectTrackColor(dependencies.createRandomValue(), adjacentColor)
      adjacentColor = color
      return color
    }
  }

  async function decodeLocalFile(file: Blob): Promise<MidiFileDocument> {
    const bytes = await dependencies.fileReader.read(file)
    return dependencies.decoder.decode(bytes)
  }

  async function prepareLocalFile(file: Blob): Promise<ProjectMidiImportDraft> {
    // No Project lifecycle write starts until browser bytes, SMF decoding, and the complete
    // imported Session have all passed their respective validation boundaries.
    const document = await decodeLocalFile(file)
    const projectName = selectFallbackProjectName(document, file)
    return createProjectMidiImportDraft({
      document,
      createId: dependencies.createId,
      createInstrumentDevice: dependencies.createInstrumentDevice,
      createTrackColor: createTrackColorFactory(null),
      ...(projectName === undefined ? {} : { projectName }),
    })
  }

  async function activateDraft(draft: ProjectMidiImportDraft): Promise<ProjectMidiImportResult> {
    const projectId = await dependencies.activeProject.createFromSession(draft.session)

    return Object.freeze({
      diagnostics: draft.diagnostics,
      projectId,
      summary: draft.summary,
    })
  }

  async function importLocalFile(file: Blob): Promise<ProjectMidiImportResult> {
    return activateDraft(await prepareLocalFile(file))
  }

  async function importLocalFileAsNewTracks(
    file: Blob,
    placementTick: Tick,
  ): Promise<ProjectMidiTrackImportResult> {
    const document = await decodeLocalFile(file)
    // Resolve the destination only after asynchronous file work so the command targets the
    // latest authoritative Session and revision rather than a stale page projection.
    const activeState = dependencies.activeProject.state
    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new Error('MIDI Tracks can only be imported while a Project is ready.')
    }

    const snapshot = activeState.session.getSnapshot()
    const draft = createProjectMidiTrackImportDraft({
      document,
      baseRevision: activeState.session.modelRevision,
      insertAt: snapshot.trackOrder.length,
      placementTick,
      createId: dependencies.createId,
      createInstrumentDevice: dependencies.createInstrumentDevice,
      createTrackColor: createTrackColorFactory(lastOrderedTrackColor(snapshot)),
    })
    const execution = activeState.session.execute(draft.command)
    if (execution.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('The current Project did not commit the imported MIDI Tracks.')
    }

    return Object.freeze({
      diagnostics: draft.diagnostics,
      importedTrackIds: draft.importedTrackIds,
      projectId: activeState.projectId,
      summary: draft.summary,
    })
  }

  return Object.freeze({
    importLocalFile,
    importLocalFileAsNewTracks,
    async importLocalFileReplacingActiveProject(
      file: Blob,
    ): Promise<ProjectMidiImportResult | null> {
      // Validation happens before asking to abandon the current Project. The confirmation then
      // observes edits made while a large file was being read and parsed.
      const draft = await prepareLocalFile(file)
      const confirmation = await dependencies.navigationConfirmation.confirm({
        kind: PROJECT_NAVIGATION_INTENT_KIND.CREATE_PROJECT,
      })

      if (confirmation.kind === PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.CANCELLED) return null
      if (confirmation.kind === PROJECT_NAVIGATION_CONFIRMATION_RESULT_KIND.FAILED) {
        throw confirmation.failureCause
      }

      return activateDraft(draft)
    },
  })
}
