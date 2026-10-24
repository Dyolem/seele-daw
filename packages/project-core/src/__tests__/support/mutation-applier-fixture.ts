import {
  createAudioTrackRecord,
  createDeviceDescriptor,
  createMasterChannelRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  createProjectRecord,
  createTempoEventRecord,
  createTimeSignatureEventRecord,
  parseLinearGain,
  parseMidiControlValue,
  parseMidiVelocity,
  parseTempoBpm,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from '#internal/index'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './complete-project-fixture'
import type { ModelStoreReader } from '#internal/model/model-store'
import type { ProjectChange } from '#internal/mutation/project-change'

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
  const sustainPedalEventPartitionIds = [...reader.midiSustainPedalEventPartitionIds()]

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
    sustainPedalEventPartitionIds,
    sustainPedalEvents: sustainPedalEventPartitionIds.map((sourceId) => [
      sourceId,
      [...reader.midiSustainPedalEventEntries(sourceId)],
    ]),
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
  const sustainPedalEventPartitionIds = [...reader.midiSustainPedalEventPartitionIds()].sort()

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
    sustainPedalEventPartitionIds,
    sustainPedalEvents: sustainPedalEventPartitionIds.map(
      (sourceId) =>
        [sourceId, sortedEntries(reader.midiSustainPedalEventEntries(sourceId))] as const,
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
    sustainPedalEvent: createMidiSustainPedalEventRecord({
      ...records.nonLoopPedalDown,
      value: parseMidiControlValue(96),
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
  const sustainPedalEventPartitionBefore = [
    fixture.records.nonLoopPedalUp,
    fixture.records.nonLoopPedalDown,
  ]
  const sustainPedalEventPartitionAfter = [
    fixture.records.nonLoopPedalDown,
    fixture.records.nonLoopPedalUp,
  ]
  const mutations: readonly ProjectChange[] = [
    {
      op: 'replace',
      table: 'project',
      before: fixture.records.project,
      after: replacement.project,
    },
    {
      op: 'replace',
      table: 'master',
      before: fixture.records.master,
      after: replacement.master,
    },
    {
      op: 'remove',
      table: 'tracks',
      before: fixture.records.audioTrack,
    },
    {
      op: 'insert',
      table: 'tracks',
      after: fixture.records.audioTrack,
    },
    {
      op: 'replace',
      table: 'tracks',
      before: fixture.records.audioTrack,
      after: replacement.track,
    },
    {
      op: 'remove',
      table: 'clips',
      before: fixture.records.nonLoopClip,
    },
    {
      op: 'insert',
      table: 'clips',
      after: fixture.records.nonLoopClip,
    },
    {
      op: 'replace',
      table: 'clips',
      before: fixture.records.nonLoopClip,
      after: replacement.clip,
    },
    {
      op: 'remove',
      table: 'midiSources',
      before: fixture.records.nonLoopSource,
    },
    {
      op: 'insert',
      table: 'midiSources',
      after: fixture.records.nonLoopSource,
    },
    {
      op: 'replace',
      table: 'midiSources',
      before: fixture.records.nonLoopSource,
      after: replacement.source,
    },
    {
      op: 'remove',
      table: 'tempoEvents',
      before: fixture.records.laterTempoEvent,
    },
    {
      op: 'insert',
      table: 'tempoEvents',
      after: fixture.records.laterTempoEvent,
    },
    {
      op: 'replace',
      table: 'tempoEvents',
      before: fixture.records.laterTempoEvent,
      after: replacement.tempoEvent,
    },
    {
      op: 'remove',
      table: 'timeSignatureEvents',
      before: fixture.records.laterTimeSignatureEvent,
    },
    {
      op: 'insert',
      table: 'timeSignatureEvents',
      after: fixture.records.laterTimeSignatureEvent,
    },
    {
      op: 'replace',
      table: 'timeSignatureEvents',
      before: fixture.records.laterTimeSignatureEvent,
      after: replacement.timeSignatureEvent,
    },
    {
      op: 'remove',
      table: 'devices',
      before: fixture.records.instrumentDevice,
    },
    {
      op: 'insert',
      table: 'devices',
      after: fixture.records.instrumentDevice,
    },
    {
      op: 'replace',
      table: 'devices',
      before: fixture.records.instrumentDevice,
      after: replacement.device,
    },
    {
      op: 'remove',
      table: 'trackOrder',
      index: 0,
      trackId: fixture.records.instrumentTrack.id,
    },
    {
      op: 'insert',
      table: 'trackOrder',
      index: 0,
      trackId: fixture.records.instrumentTrack.id,
    },
    {
      op: 'remove-partition',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      records: partitionBefore,
    },
    {
      op: 'insert-partition',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      records: partitionAfter,
    },
    {
      op: 'remove',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopNote,
    },
    {
      op: 'insert',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      after: fixture.records.nonLoopNote,
    },
    {
      op: 'replace',
      table: 'midiNotes',
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopNote,
      after: replacement.note,
    },
    {
      op: 'remove-partition',
      table: 'midiSustainPedalEvents',
      sourceId: fixture.records.nonLoopSource.id,
      records: sustainPedalEventPartitionBefore,
    },
    {
      op: 'insert-partition',
      table: 'midiSustainPedalEvents',
      sourceId: fixture.records.nonLoopSource.id,
      records: sustainPedalEventPartitionAfter,
    },
    {
      op: 'remove',
      table: 'midiSustainPedalEvents',
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopPedalDown,
    },
    {
      op: 'insert',
      table: 'midiSustainPedalEvents',
      sourceId: fixture.records.nonLoopSource.id,
      after: fixture.records.nonLoopPedalDown,
    },
    {
      op: 'replace',
      table: 'midiSustainPedalEvents',
      sourceId: fixture.records.nonLoopSource.id,
      before: fixture.records.nonLoopPedalDown,
      after: replacement.sustainPedalEvent,
    },
  ]

  return { fixture, replacement, mutations }
}
