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
  createAddInstrumentTrackCollectionCommand,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddMidiClipWithNoteCommand,
  createAddMidiSustainPedalEventCommand,
  createAddNoteCommand,
  createAddTempoEventCommand,
  createExtendMidiClipWithNoteCommand,
  createMoveMidiSustainPedalEventsCommand,
  createMoveNotesCommand,
  createMoveTempoEventCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createRemoveNotesCommand,
  createRemoveTempoEventCommand,
  createReplaceInstrumentDeviceCommand,
  createReplaceMidiSustainPedalEventValueCommand,
  createReplaceTempoEventBpmCommand,
  createResizeNoteCommand,
  type ProjectCommand,
  type ProjectCommandType,
} from '#internal/commands/protocol/project-command'
import {
  ProjectCommandError,
  type ProjectCommandErrorDetails,
} from '#internal/commands/protocol/project-command-error'
import {
  prepareAddTempoEventCommand,
  prepareMoveTempoEventCommand,
  prepareRemoveTempoEventCommand,
  prepareReplaceTempoEventBpmCommand,
} from '#internal/commands/tempo-event/command-handler'
import type { ModelStoreReader } from '#internal/model/model-store'

/** Everything the session needs to run one command type. */
interface ProjectCommandDefinition<Command extends ProjectCommand> {
  /** Rebuilds a structurally supplied command through its factory, so its values are trusted. */
  normalize(command: Command): Command
  /** The entities the command addresses, reported with its errors. */
  address(command: Command): ProjectCommandErrorDetails
  /** Turns the command into a closed plan without writing. */
  prepare(reader: ModelStoreReader, command: Command): ProjectCommandPreparation
}

type ProjectCommandRegistry = {
  readonly [Type in ProjectCommandType]: ProjectCommandDefinition<
    Extract<ProjectCommand, { readonly type: Type }>
  >
}

const PROJECT_COMMANDS: ProjectCommandRegistry = {
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.ADD]: {
    normalize: (command) =>
      createAddTempoEventCommand({
        baseRevision: command.baseRevision,
        tempoEventId: command.tempoEvent.id,
        tick: command.tempoEvent.tick,
        bpm: command.tempoEvent.bpm,
      }),
    address: (command) => ({
      tempoEventId: command.tempoEvent.id,
      tempoEventTick: command.tempoEvent.tick,
    }),
    prepare: prepareAddTempoEventCommand,
  },
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.MOVE]: {
    normalize: createMoveTempoEventCommand,
    address: (command) => ({ tempoEventId: command.tempoEventId, tempoEventTick: command.tick }),
    prepare: prepareMoveTempoEventCommand,
  },
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.REMOVE]: {
    normalize: createRemoveTempoEventCommand,
    address: (command) => ({ tempoEventId: command.tempoEventId }),
    prepare: prepareRemoveTempoEventCommand,
  },
  [PROJECT_COMMAND_TYPE.TEMPO_EVENT.REPLACE_BPM]: {
    normalize: createReplaceTempoEventBpmCommand,
    address: (command) => ({ tempoEventId: command.tempoEventId }),
    prepare: prepareReplaceTempoEventBpmCommand,
  },
  [PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE]: {
    normalize: createReplaceInstrumentDeviceCommand,
    address: (command) => ({ deviceId: command.instrumentDevice.id, trackId: command.trackId }),
    prepare: prepareReplaceInstrumentDeviceCommand,
  },
  [PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD]: {
    normalize: (command) =>
      createAddInstrumentTrackCommand({
        baseRevision: command.baseRevision,
        trackId: command.track.id,
        name: command.track.name,
        color: command.track.color,
        channel: command.track.channel,
        instrumentDevice: command.instrumentDevice,
        insertAt: command.insertAt,
      }),
    address: (command) => ({ deviceId: command.instrumentDevice.id, trackId: command.track.id }),
    prepare: prepareAddInstrumentTrackCommand,
  },
  [PROJECT_COMMAND_TYPE.INSTRUMENT_TRACK.ADD_COLLECTION]: {
    normalize: (command) =>
      createAddInstrumentTrackCollectionCommand({
        baseRevision: command.baseRevision,
        entries: command.entries,
        insertAt: command.insertAt,
      }),
    address: (command) => ({ insertAt: command.insertAt, trackId: command.entries[0]?.track.id }),
    prepare: prepareAddInstrumentTrackCollectionCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD]: {
    normalize: (command) =>
      createAddMidiClipCommand({
        baseRevision: command.baseRevision,
        clipId: command.clip.id,
        trackId: command.clip.trackId,
        name: command.clip.name,
        color: command.clip.color,
        muted: command.clip.muted,
        startTick: command.clip.startTick,
        spanTick: command.clip.spanTick,
        sourceId: command.source.id,
        sourceLengthTick: command.source.lengthTick,
        sourceOffsetTick: command.clip.sourceOffsetTick,
        loop: command.clip.loop,
      }),
    address: (command) => ({
      clipId: command.clip.id,
      sourceId: command.source.id,
      trackId: command.clip.trackId,
    }),
    prepare: prepareAddMidiClipCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.ADD_WITH_NOTE]: {
    normalize: (command) => {
      if (command.clip.loop !== null) {
        throw new ProjectCommandError(
          'looped-midi-clip-unsupported',
          `AddMidiClipWithNoteCommand cannot normalize looped MIDI Clip ${command.clip.id}`,
          {
            baseRevision: command.baseRevision,
            clipId: command.clip.id,
            commandType: command.type,
            noteId: command.note.id,
            sourceId: command.source.id,
            trackId: command.clip.trackId,
          },
        )
      }
      return createAddMidiClipWithNoteCommand({
        baseRevision: command.baseRevision,
        clipId: command.clip.id,
        trackId: command.clip.trackId,
        name: command.clip.name,
        color: command.clip.color,
        muted: command.clip.muted,
        startTick: command.clip.startTick,
        spanTick: command.clip.spanTick,
        sourceId: command.source.id,
        sourceLengthTick: command.source.lengthTick,
        sourceOffsetTick: command.clip.sourceOffsetTick,
        loop: command.clip.loop,
        noteId: command.note.id,
        noteStartTick: command.note.startTick,
        noteDurationTick: command.note.durationTick,
        notePitch: command.note.pitch,
        noteVelocity: command.note.velocity,
        noteChannel: command.note.channel,
      })
    },
    address: (command) => ({
      clipId: command.clip.id,
      noteId: command.note.id,
      sourceId: command.source.id,
      trackId: command.clip.trackId,
    }),
    prepare: prepareAddMidiClipWithNoteCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_CLIP.EXTEND_WITH_NOTE]: {
    normalize: (command) =>
      createExtendMidiClipWithNoteCommand({
        baseRevision: command.baseRevision,
        clipId: command.clipId,
        spanTick: command.spanTick,
        noteId: command.note.id,
        noteStartTick: command.note.startTick,
        noteDurationTick: command.note.durationTick,
        notePitch: command.note.pitch,
        noteVelocity: command.note.velocity,
        noteChannel: command.note.channel,
      }),
    address: (command) => ({ clipId: command.clipId, noteId: command.note.id }),
    prepare: prepareExtendMidiClipWithNoteCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD]: {
    normalize: createAddNoteCommand,
    address: (command) => ({ noteId: command.noteId, sourceId: command.sourceId }),
    prepare: prepareAddNoteCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE]: {
    normalize: createMoveNotesCommand,
    address: (command) => ({ sourceId: command.sourceId }),
    prepare: prepareMoveNotesCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE]: {
    normalize: createRemoveNotesCommand,
    address: (command) => ({ sourceId: command.sourceId }),
    prepare: prepareRemoveNotesCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE]: {
    normalize: createResizeNoteCommand,
    address: (command) => ({ noteId: command.noteId, sourceId: command.sourceId }),
    prepare: prepareResizeNoteCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.ADD]: {
    normalize: (command) =>
      createAddMidiSustainPedalEventCommand({
        baseRevision: command.baseRevision,
        sourceId: command.sourceId,
        eventId: command.event.id,
        tick: command.event.tick,
        value: command.event.value,
        channel: command.event.channel,
      }),
    address: (command) => ({
      sourceId: command.sourceId,
      sustainPedalEventId: command.event.id,
      sustainPedalEventTick: command.event.tick,
    }),
    prepare: prepareAddMidiSustainPedalEventCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.MOVE]: {
    normalize: createMoveMidiSustainPedalEventsCommand,
    address: (command) => ({ sourceId: command.sourceId }),
    prepare: prepareMoveMidiSustainPedalEventsCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REMOVE]: {
    normalize: createRemoveMidiSustainPedalEventsCommand,
    address: (command) => ({ sourceId: command.sourceId }),
    prepare: prepareRemoveMidiSustainPedalEventsCommand,
  },
  [PROJECT_COMMAND_TYPE.MIDI_SUSTAIN_PEDAL_EVENT.REPLACE_VALUE]: {
    normalize: createReplaceMidiSustainPedalEventValueCommand,
    address: (command) => ({ sourceId: command.sourceId, sustainPedalEventId: command.eventId }),
    prepare: prepareReplaceMidiSustainPedalEventValueCommand,
  },
}

function definitionOf(command: ProjectCommand): ProjectCommandDefinition<ProjectCommand> {
  const type: unknown = (command as { readonly type?: unknown }).type
  if (typeof type !== 'string' || !Object.hasOwn(PROJECT_COMMANDS, type)) {
    throw new ProjectCommandError(
      'unknown-command-type',
      `ProjectCommand has an unknown type: ${String(type)}`,
      { commandType: String(type) },
    )
  }
  return PROJECT_COMMANDS[type as ProjectCommandType] as ProjectCommandDefinition<ProjectCommand>
}

/**
 * Converts one complete product intent into a closed plan without acquiring write access.
 * The ProjectSession applies only the ready branch through MutationApplier.
 */
export function prepareProjectCommand(
  reader: ModelStoreReader,
  command: ProjectCommand,
): ProjectCommandPreparation {
  const definition = definitionOf(command)
  const normalizedCommand = definition.normalize(command)

  if (normalizedCommand.baseRevision !== reader.modelRevision) {
    throw new ProjectCommandError(
      'base-revision-mismatch',
      `ProjectCommand revision ${normalizedCommand.baseRevision} does not match model revision ${reader.modelRevision}`,
      {
        baseRevision: normalizedCommand.baseRevision,
        commandType: normalizedCommand.type,
        currentRevision: reader.modelRevision,
        ...definition.address(normalizedCommand),
      },
    )
  }

  return definition.prepare(reader, normalizedCommand)
}
