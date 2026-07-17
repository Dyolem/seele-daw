import {
  createAudioTrackRecord,
  createDeviceDescriptor,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseLinearGain,
  parseMidiVelocity,
  parseTempoBpm,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from '~/index'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './complete-project-fixture'
import type { ModelStoreReader } from '@/model/model-store'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'
import type { ProjectMutation } from '@/mutation/project-mutation'

function compareEntryKeys(
  [leftKey]: readonly [string, unknown],
  [rightKey]: readonly [string, unknown],
): number {
  return leftKey.localeCompare(rightKey)
}

function sortedEntries<RecordType>(
  entries: Iterable<readonly [string, RecordType]>,
): readonly (readonly [string, RecordType])[] {
  return [...entries].sort(compareEntryKeys)
}

/** Captures storage traversal as-is, including Map insertion order. */
export function snapshotModelReader(reader: ModelStoreReader) {
  const partitionIds = [...reader.midiNotePartitionIds()]

  return {
    revision: reader.modelRevision,
    project: reader.project,
    master: reader.master,
    trackOrder: [...reader.orderedTrackIds()],
    tracks: [...reader.trackEntries()],
    clips: [...reader.clipEntries()],
    midiSources: [...reader.midiSourceEntries()],
    partitionIds,
    notes: partitionIds.map((sourceId) => [sourceId, [...reader.midiNoteEntries(sourceId)]]),
    tempoEvents: [...reader.tempoEventEntries()],
    timeSignatureEvents: [...reader.timeSignatureEventEntries()],
    devices: [...reader.deviceEntries()],
  }
}

/**
 * Captures project facts while sorting normalized tables by ID. Map insertion order is
 * intentionally excluded because only explicit order fields (such as trackOrder) are semantic.
 */
export function snapshotSemanticProjectFacts(reader: ModelStoreReader) {
  const partitionIds = [...reader.midiNotePartitionIds()].sort()

  return {
    project: reader.project,
    master: reader.master,
    trackOrder: [...reader.orderedTrackIds()],
    tracks: sortedEntries(reader.trackEntries()),
    clips: sortedEntries(reader.clipEntries()),
    midiSources: sortedEntries(reader.midiSourceEntries()),
    partitionIds,
    notes: partitionIds.map(
      (sourceId) => [sourceId, sortedEntries(reader.midiNoteEntries(sourceId))] as const,
    ),
    tempoEvents: sortedEntries(reader.tempoEventEntries()),
    timeSignatureEvents: sortedEntries(reader.timeSignatureEventEntries()),
    devices: sortedEntries(reader.deviceEntries()),
  }
}

function createReplacementRecords(fixture: CompleteProjectFixture) {
  const { records } = fixture

  return {
    project: createProjectRecord({
      id: records.project.id,
      name: 'Applied Project',
    }),
    master: createMasterChannelRecord({
      gain: parseLinearGain(0.7),
      muted: true,
      audioEffectIds: records.master.audioEffectIds,
    }),
    track: createAudioTrackRecord({
      id: records.audioTrack.id,
      name: 'Applied Audio Track',
      color: records.audioTrack.color,
      channel: records.audioTrack.channel,
      audioEffectIds: records.audioTrack.audioEffectIds,
    }),
    clip: createMidiClipRecord({
      ...records.nonLoopClip,
      name: 'Applied MIDI Clip',
    }),
    source: createMidiSourceRecord({
      id: records.nonLoopSource.id,
      lengthTick: parseTick(2_400),
    }),
    tempoEvent: createTempoEventRecord({
      ...records.laterTempoEvent,
      bpm: parseTempoBpm(136),
    }),
    timeSignatureEvent: createTimeSignatureEventRecord({
      ...records.laterTimeSignatureEvent,
      numerator: parseTimeSignatureNumerator(5),
      denominator: parseTimeSignatureDenominator(4),
    }),
    device: createDeviceDescriptor({
      ...records.instrumentDevice,
      enabled: false,
    }),
    note: createMidiNoteRecord({
      ...records.nonLoopNote,
      velocity: parseMidiVelocity(116),
    }),
  }
}

/**
 * Produces one valid cascade that visits every mutation dispatch branch exactly once.
 * Several entities are removed and reinserted before replacement so temporary relational
 * gaps exist, while the final projected graph remains valid.
 */
export function createCompleteMutationScenario() {
  const fixture = createCompleteProjectFixture()
  const replacement = createReplacementRecords(fixture)
  const partitionBefore = [fixture.records.nonLoopHarmonyNote, fixture.records.nonLoopNote]
  const partitionAfter = [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote]
  const mutations: readonly ProjectMutation[] = [
    {
      type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
      before: fixture.records.project,
      after: replacement.project,
    },
    {
      type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
      before: fixture.records.master,
      after: replacement.master,
    },
    {
      type: PROJECT_MUTATION_TYPE.TRACK.REMOVE,
      before: fixture.records.audioTrack,
    },
    {
      type: PROJECT_MUTATION_TYPE.TRACK.INSERT,
      after: fixture.records.audioTrack,
    },
    {
      type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
      before: fixture.records.audioTrack,
      after: replacement.track,
    },
    {
      type: PROJECT_MUTATION_TYPE.CLIP.REMOVE,
      before: fixture.records.nonLoopClip,
    },
    {
      type: PROJECT_MUTATION_TYPE.CLIP.INSERT,
      after: fixture.records.nonLoopClip,
    },
    {
      type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
      before: fixture.records.nonLoopClip,
      after: replacement.clip,
    },
    {
      type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE,
      before: fixture.records.nonLoopSource,
    },
    {
      type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
      after: fixture.records.nonLoopSource,
    },
    {
      type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
      before: fixture.records.nonLoopSource,
      after: replacement.source,
    },
    {
      type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
      before: fixture.records.laterTempoEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
      after: fixture.records.laterTempoEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
      before: fixture.records.laterTempoEvent,
      after: replacement.tempoEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE,
      before: fixture.records.laterTimeSignatureEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT,
      after: fixture.records.laterTimeSignatureEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE,
      before: fixture.records.laterTimeSignatureEvent,
      after: replacement.timeSignatureEvent,
    },
    {
      type: PROJECT_MUTATION_TYPE.DEVICE.REMOVE,
      before: fixture.records.instrumentDevice,
    },
    {
      type: PROJECT_MUTATION_TYPE.DEVICE.INSERT,
      after: fixture.records.instrumentDevice,
    },
    {
      type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
      before: fixture.records.instrumentDevice,
      after: replacement.device,
    },
    {
      type: PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
      index: 0,
      trackId: fixture.records.instrumentTrack.id,
    },
    {
      type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
      index: 0,
      trackId: fixture.records.instrumentTrack.id,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
      sourceId: fixture.records.nonLoopSource.id,
      before: partitionBefore,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
      sourceId: fixture.records.nonLoopSource.id,
      after: partitionAfter,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopNote,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
      sourceId: fixture.records.nonLoopSource.id,
      after: fixture.records.nonLoopNote,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopNote,
      after: replacement.note,
    },
  ]

  return { fixture, replacement, mutations }
}
