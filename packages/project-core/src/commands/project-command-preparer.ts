import {
  normalizeProjectCommand,
  PROJECT_COMMAND_TYPE,
  type ProjectCommand,
} from '#internal/commands/project-command'
import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { ProjectCommandPreparation } from '#internal/commands/project-command-preparation'
import { prepareAddInstrumentTrackCommand } from '#internal/commands/instrument-track-command-handler'
import {
  prepareAddNoteCommand,
  prepareMoveNoteCommand,
  prepareRemoveNoteCommand,
} from '#internal/commands/midi-note-command-handler'
import type { ModelStoreReader } from '#internal/model/model-store'

function rejectUnknownCommand(command: never): never {
  const type = (command as { readonly type?: unknown }).type

  throw new ProjectCommandError(
    'unknown-command-type',
    `ProjectCommand has an unknown type: ${String(type)}`,
    { commandType: String(type) },
  )
}

/**
 * Converts one complete product intent into a closed plan without acquiring write access.
 * The future ProjectSession will apply only the ready branch through MutationApplier.
 */
export function prepareProjectCommand(
  reader: ModelStoreReader,
  command: ProjectCommand,
): ProjectCommandPreparation {
  const normalizedCommand = normalizeProjectCommand(command)

  if (normalizedCommand.baseRevision !== reader.modelRevision) {
    const commandAddress =
      normalizedCommand.type === PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD
        ? {
            deviceId: normalizedCommand.instrumentDevice.id,
            trackId: normalizedCommand.track.id,
          }
        : {
            noteId: normalizedCommand.noteId,
            sourceId: normalizedCommand.sourceId,
          }

    throw new ProjectCommandError(
      'base-revision-mismatch',
      `ProjectCommand revision ${normalizedCommand.baseRevision} does not match model revision ${reader.modelRevision}`,
      {
        baseRevision: normalizedCommand.baseRevision,
        commandType: normalizedCommand.type,
        currentRevision: reader.modelRevision,
        ...commandAddress,
      },
    )
  }

  switch (normalizedCommand.type) {
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD:
      return prepareAddInstrumentTrackCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
      return prepareAddNoteCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
      return prepareMoveNoteCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return prepareRemoveNoteCommand(reader, normalizedCommand)
    default:
      return rejectUnknownCommand(normalizedCommand)
  }
}
