import { assertMidiNoteWithinSource } from '#internal/commands/midi-note/command-validation'
import type {
  AddInstrumentTrackCollectionCommand,
  InstrumentTrackCollectionClip,
  InstrumentTrackCollectionEntry,
} from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type { ReadyProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import type { ClipId, DeviceId, MidiSourceId, NoteId, TrackId } from '#internal/model/ids'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { addTicks } from '#internal/time/tick'

function commandDetails(
  command: AddInstrumentTrackCollectionCommand,
  entry?: InstrumentTrackCollectionEntry,
  clipGraph?: InstrumentTrackCollectionClip,
) {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    deviceId: entry?.instrumentDevice.id,
    insertAt: command.insertAt,
    trackId: entry?.track.id,
    clipId: clipGraph?.clip.id,
    sourceId: clipGraph?.source.id,
  } as const
}

function rejectReusedId(
  code:
    | 'track-id-already-exists'
    | 'device-id-already-exists'
    | 'clip-id-already-exists'
    | 'midi-source-id-already-exists',
  entityName: string,
  id: string,
  details: ReturnType<typeof commandDetails>,
): never {
  throw new ProjectCommandError(
    code,
    `${entityName} ID ${id} is already used by the project or this collection`,
    details,
  )
}

function assertTrackOrderInsertion(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCollectionCommand,
): void {
  const trackOrderLength = Array.from(reader.orderedTrackIds()).length

  if (command.insertAt <= trackOrderLength) return

  throw new ProjectCommandError(
    'track-order-index-out-of-bounds',
    `Cannot insert Instrument Track collection at index ${command.insertAt} for Track Order length ${trackOrderLength}`,
    { ...commandDetails(command), trackOrderLength },
  )
}

function assertClipWithinSource(
  command: AddInstrumentTrackCollectionCommand,
  entry: InstrumentTrackCollectionEntry,
  clipGraph: InstrumentTrackCollectionClip,
): void {
  const sourceReadEndTick =
    clipGraph.clip.loop === null
      ? addTicks(clipGraph.clip.sourceOffsetTick, clipGraph.clip.spanTick)
      : addTicks(clipGraph.clip.loop.sourceStartTick, clipGraph.clip.loop.sourceSpanTick)

  if (sourceReadEndTick <= clipGraph.source.lengthTick) return

  throw new ProjectCommandError(
    'midi-clip-out-of-source-range',
    `MIDI Clip ${clipGraph.clip.id} reads through Tick ${sourceReadEndTick}, beyond MidiSource ${clipGraph.source.id} length ${clipGraph.source.lengthTick}`,
    {
      ...commandDetails(command, entry, clipGraph),
      sourceLengthTick: clipGraph.source.lengthTick,
      sourceReadEndTick,
    },
  )
}

function collectExistingNoteIds(reader: ModelStoreReader): Set<NoteId> {
  const noteIds = new Set<NoteId>()

  for (const sourceId of reader.midiNotePartitionIds()) {
    for (const [noteId] of reader.midiNoteEntries(sourceId)) noteIds.add(noteId)
  }

  return noteIds
}

function assertCollectionGraphCanBeAdded(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCollectionCommand,
): void {
  assertTrackOrderInsertion(reader, command)

  const trackIds = new Set<TrackId>()
  const deviceIds = new Set<DeviceId>()
  const clipIds = new Set<ClipId>()
  const sourceIds = new Set<MidiSourceId>()
  const noteIds = collectExistingNoteIds(reader)

  for (const entry of command.entries) {
    const details = commandDetails(command, entry)

    if (reader.getTrack(entry.track.id) !== undefined || trackIds.has(entry.track.id)) {
      rejectReusedId('track-id-already-exists', 'Track', entry.track.id, details)
    }
    trackIds.add(entry.track.id)

    if (
      reader.getDevice(entry.instrumentDevice.id) !== undefined ||
      deviceIds.has(entry.instrumentDevice.id)
    ) {
      rejectReusedId('device-id-already-exists', 'Device', entry.instrumentDevice.id, details)
    }
    deviceIds.add(entry.instrumentDevice.id)

    if (entry.track.instrumentDeviceId !== entry.instrumentDevice.id) {
      throw new ProjectCommandError(
        'instrument-device-id-mismatch',
        `Instrument Track ${entry.track.id} owns Device ${entry.track.instrumentDeviceId}, not supplied Device ${entry.instrumentDevice.id}`,
        details,
      )
    }

    if (entry.track.midiEffectIds.length > 0 || entry.track.audioEffectIds.length > 0) {
      throw new ProjectCommandError(
        'instrument-track-device-chain-unsupported',
        `Instrument Track ${entry.track.id} collection entry cannot reference Device chains that the command does not carry`,
        details,
      )
    }

    for (const clipGraph of entry.clips) {
      const clipDetails = commandDetails(command, entry, clipGraph)

      if (clipGraph.clip.trackId !== entry.track.id) {
        throw new ProjectCommandError(
          'midi-clip-track-kind-mismatch',
          `MIDI Clip ${clipGraph.clip.id} does not belong to supplied Instrument Track ${entry.track.id}`,
          clipDetails,
        )
      }

      if (clipGraph.clip.sourceId !== clipGraph.source.id) {
        throw new ProjectCommandError(
          'midi-clip-source-id-mismatch',
          `MIDI Clip ${clipGraph.clip.id} owns Source ${clipGraph.clip.sourceId}, not supplied Source ${clipGraph.source.id}`,
          clipDetails,
        )
      }

      if (reader.getClip(clipGraph.clip.id) !== undefined || clipIds.has(clipGraph.clip.id)) {
        rejectReusedId('clip-id-already-exists', 'Clip', clipGraph.clip.id, clipDetails)
      }
      clipIds.add(clipGraph.clip.id)

      if (
        reader.getMidiSource(clipGraph.source.id) !== undefined ||
        reader.hasMidiNotePartition(clipGraph.source.id) ||
        sourceIds.has(clipGraph.source.id)
      ) {
        rejectReusedId(
          'midi-source-id-already-exists',
          'MidiSource',
          clipGraph.source.id,
          clipDetails,
        )
      }
      sourceIds.add(clipGraph.source.id)

      assertClipWithinSource(command, entry, clipGraph)

      for (const note of clipGraph.notes) {
        if (noteIds.has(note.id)) {
          throw new ProjectCommandError(
            'note-id-already-exists',
            `MIDI Note ID ${note.id} is already used by the project or this collection`,
            { ...clipDetails, noteId: note.id },
          )
        }
        noteIds.add(note.id)

        assertMidiNoteWithinSource(
          {
            baseRevision: command.baseRevision,
            commandType: command.type,
            noteId: note.id,
            sourceId: clipGraph.source.id,
          },
          clipGraph.source,
          note,
        )
      }
    }
  }
}

function createCollectionMutations(
  command: AddInstrumentTrackCollectionCommand,
): readonly ProjectMutation[] {
  const mutations: ProjectMutation[] = []

  command.entries.forEach((entry, trackIndex) => {
    mutations.push(
      {
        type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
        after: entry.instrumentDevice,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
        after: entry.track,
      },
      {
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: command.insertAt + trackIndex,
        trackId: entry.track.id,
      },
    )

    for (const clipGraph of entry.clips) {
      mutations.push(
        {
          type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
          after: clipGraph.source,
        },
        {
          type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
          sourceId: clipGraph.source.id,
          after: clipGraph.notes,
        },
        {
          type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
          after: clipGraph.clip,
        },
      )
    }
  })

  return mutations
}

/**
 * Validates every imported ownership graph before planning any authoritative write.
 * The resulting single plan makes a multi-Track import one atomic History step.
 */
export function prepareAddInstrumentTrackCollectionCommand(
  reader: ModelStoreReader,
  command: AddInstrumentTrackCollectionCommand,
): ReadyProjectCommandPreparation {
  assertCollectionGraphCanBeAdded(reader, command)

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, createCollectionMutations(command)),
  }
}
