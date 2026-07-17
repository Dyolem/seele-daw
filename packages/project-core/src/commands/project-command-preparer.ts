import {
  normalizeProjectCommand,
  PROJECT_COMMAND_TYPE,
  type ProjectCommand,
} from '@/commands/project-command'
import { ProjectCommandError } from '@/commands/project-command-error'
import type { ProjectCommandPreparation } from '@/commands/project-command-preparation'
import {
  prepareAddNoteCommand,
  prepareMoveNoteCommand,
  prepareRemoveNoteCommand,
} from '@/commands/midi-note-command-handler'
import type { ModelStoreReader } from '@/model/model-store'

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
    throw new ProjectCommandError(
      'base-revision-mismatch',
      `ProjectCommand revision ${normalizedCommand.baseRevision} does not match model revision ${reader.modelRevision}`,
      {
        baseRevision: normalizedCommand.baseRevision,
        commandType: normalizedCommand.type,
        currentRevision: reader.modelRevision,
        noteId: normalizedCommand.noteId,
        sourceId: normalizedCommand.sourceId,
      },
    )
  }

  switch (normalizedCommand.type) {
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
