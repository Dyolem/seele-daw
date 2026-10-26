import { prepareReplaceInstrumentDeviceCommand } from '#internal/commands/instrument-device/command-handler'
import { prepareAddInstrumentTrackCollectionCommand } from '#internal/commands/instrument-track/collection-command-handler'
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
import {
  prepareAddMidiSustainPedalEventCommand,
  prepareMoveMidiSustainPedalEventsCommand,
  prepareRemoveMidiSustainPedalEventsCommand,
  prepareReplaceMidiSustainPedalEventValueCommand,
} from '#internal/commands/midi-sustain-pedal-event/command-handler'
import type { ProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import {
  PROJECT_COMMAND_TYPE,
  type ProjectCommand,
  type ProjectCommandType,
} from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import {
  prepareAddTempoEventCommand,
  prepareMoveTempoEventCommand,
  prepareRemoveTempoEventCommand,
  prepareReplaceTempoEventBpmCommand,
} from '#internal/commands/tempo-event/command-handler'
import type { ModelStoreReader } from '#internal/model/model-store'

type ProjectCommandPreparer<Command extends ProjectCommand> = (
  reader: ModelStoreReader,
  command: Command,
) => ProjectCommandPreparation

/** Turns each command type into a closed plan without writing. */
const PREPARERS: {
  readonly [Type in ProjectCommandType]: ProjectCommandPreparer<
    Extract<ProjectCommand, { readonly type: Type }>
  >
} = {
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD]: prepareAddTempoEventCommand,
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE]: prepareMoveTempoEventCommand,
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE]: prepareRemoveTempoEventCommand,
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM]: prepareReplaceTempoEventBpmCommand,
  [PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE]: prepareReplaceInstrumentDeviceCommand,
  [PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD]: prepareAddInstrumentTrackCommand,
  [PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION]:
    prepareAddInstrumentTrackCollectionCommand,
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD]: prepareAddMidiClipCommand,
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE]: prepareAddMidiClipWithNoteCommand,
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE]: prepareExtendMidiClipWithNoteCommand,
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD]: prepareAddNoteCommand,
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE]: prepareMoveNotesCommand,
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE]: prepareRemoveNotesCommand,
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE]: prepareResizeNoteCommand,
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD]: prepareAddMidiSustainPedalEventCommand,
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE]: prepareMoveMidiSustainPedalEventsCommand,
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE]:
    prepareRemoveMidiSustainPedalEventsCommand,
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE]:
    prepareReplaceMidiSustainPedalEventValueCommand,
}

/**
 * Converts one complete product intent into a closed plan without acquiring write access.
 * The ProjectSession applies only the ready branch through MutationApplier.
 */
export function prepareProjectCommand(
  reader: ModelStoreReader,
  command: ProjectCommand,
): ProjectCommandPreparation {
  if (command.baseRevision !== reader.modelRevision) {
    throw new ProjectCommandError(
      'base-revision-mismatch',
      `ProjectCommand revision ${command.baseRevision} does not match model revision ${reader.modelRevision}`,
    )
  }
  const prepare = PREPARERS[command.type] as ProjectCommandPreparer<ProjectCommand>
  return prepare(reader, command)
}
