import {
  normalizeProjectCommand,
  PROJECT_COMMAND_TYPE,
  type ProjectCommand,
} from '#internal/commands/protocol/project-command'
import {
  ProjectCommandError,
  type ProjectCommandErrorDetails,
} from '#internal/commands/protocol/project-command-error'
import type { ProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import { prepareReplaceInstrumentDeviceCommand } from '#internal/commands/instrument-device/command-handler'
import { prepareAddInstrumentTrackCommand } from '#internal/commands/instrument-track/command-handler'
import { prepareAddMidiClipCommand } from '#internal/commands/midi-clip/command-handler'
import { prepareAddMidiClipWithNoteCommand } from '#internal/commands/midi-clip-note-placement/add-command-handler'
import { prepareExtendMidiClipWithNoteCommand } from '#internal/commands/midi-clip-note-placement/extend-command-handler'
import {
  prepareAddNoteCommand,
  prepareMoveNotesCommand,
  prepareRemoveNotesCommand,
  prepareResizeNoteCommand,
} from '#internal/commands/midi-note/command-handler'
import type { ModelStoreReader } from '#internal/model/model-store'

function rejectUnknownCommand(command: never): never {
  const type = (command as { readonly type?: unknown }).type

  throw new ProjectCommandError(
    'unknown-command-type',
    `ProjectCommand has an unknown type: ${String(type)}`,
    { commandType: String(type) },
  )
}

function commandAddress(command: ProjectCommand): ProjectCommandErrorDetails {
  switch (command.type) {
    case PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE:
      return {
        deviceId: command.instrumentDevice.id,
        trackId: command.trackId,
      }
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD:
      return {
        deviceId: command.instrumentDevice.id,
        trackId: command.track.id,
      }
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD:
      return {
        clipId: command.clip.id,
        sourceId: command.source.id,
        trackId: command.clip.trackId,
      }
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE:
      return {
        clipId: command.clip.id,
        noteId: command.note.id,
        sourceId: command.source.id,
        trackId: command.clip.trackId,
      }
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE:
      return {
        clipId: command.clipId,
        noteId: command.note.id,
      }
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE:
      return {
        noteId: command.noteId,
        sourceId: command.sourceId,
      }
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return {
        sourceId: command.sourceId,
      }
    default:
      return rejectUnknownCommand(command)
  }
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
        ...commandAddress(normalizedCommand),
      },
    )
  }

  switch (normalizedCommand.type) {
    case PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE:
      return prepareReplaceInstrumentDeviceCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD:
      return prepareAddInstrumentTrackCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD:
      return prepareAddMidiClipCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE:
      return prepareAddMidiClipWithNoteCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE:
      return prepareExtendMidiClipWithNoteCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD:
      return prepareAddNoteCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE:
      return prepareMoveNotesCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE:
      return prepareRemoveNotesCommand(reader, normalizedCommand)
    case PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE:
      return prepareResizeNoteCommand(reader, normalizedCommand)
    default:
      return rejectUnknownCommand(normalizedCommand)
  }
}
