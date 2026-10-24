import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
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
  type MidiNoteRecord,
} from '#internal/index'
import {
  createCompleteProjectFixture,
  type CompleteProjectFixture,
} from './support/complete-project-fixture'
import { ModelInvariantError } from '#internal/model/invariant-validator'
import { ModelStore, type ModelStoreReader } from '#internal/model/model-store'
import { MutationPreconditionError } from '#internal/mutation/mutation-precondition-error'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectChange } from '#internal/mutation/project-change'
import { ProjectedModelStoreReader } from '#internal/mutation/projected-model-store-reader'

function snapshotReader(reader: ModelStoreReader) {
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

function createProjection(
  base: ModelStoreReader,
  mutations: readonly ProjectChange[],
): ProjectedModelStoreReader {
  const plan = createMutationPlan(base.modelRevision, mutations)

  return new ProjectedModelStoreReader(base, plan.forward)
}

function createReplacementRecords(fixture: CompleteProjectFixture) {
  const { records } = fixture

  return {
    project: createProjectRecord({
      id: records.project.id,
      name: 'Projected Project',
    }),
    master: createMasterChannelRecord({
      gain: parseLinearGain(0.7),
      muted: true,
      audioEffectIds: records.master.audioEffectIds,
    }),
    track: createAudioTrackRecord({
      id: records.audioTrack.id,
      name: 'Projected Audio Track',
      color: records.audioTrack.color,
      channel: records.audioTrack.channel,
      audioEffectIds: records.audioTrack.audioEffectIds,
    }),
    clip: createMidiClipRecord({
      ...records.nonLoopClip,
      name: 'Projected MIDI Clip',
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

function capturePreconditionError(operation: () => unknown): MutationPreconditionError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(MutationPreconditionError)

  if (!(caughtError instanceof MutationPreconditionError)) {
    throw new Error('Expected a MutationPreconditionError')
  }

  return caughtError
}

describe('ProjectedModelStoreReader complete projection', () => {
  it('implements ModelStoreReader and applies every mutation branch without changing the base', () => {
    const fixture = createCompleteProjectFixture()
    const base: ModelStoreReader = new ModelStore(fixture.seed)
    const beforeBase = snapshotReader(base)
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

    const projected: ModelStoreReader = createProjection(base, mutations)

    expectTypeOf<ProjectedModelStoreReader>().toMatchTypeOf<ModelStoreReader>()
    expect(projected.modelRevision).toBe(base.modelRevision)
    expect(projected.project).toBe(replacement.project)
    expect(projected.master).toBe(replacement.master)
    expect(projected.getTrack(replacement.track.id)).toBe(replacement.track)
    expect(projected.getClip(replacement.clip.id)).toBe(replacement.clip)
    expect(projected.getMidiSource(replacement.source.id)).toBe(replacement.source)
    expect(projected.getTempoEvent(replacement.tempoEvent.id)).toBe(replacement.tempoEvent)
    expect(projected.getTimeSignatureEvent(replacement.timeSignatureEvent.id)).toBe(
      replacement.timeSignatureEvent,
    )
    expect(projected.getDevice(replacement.device.id)).toBe(replacement.device)
    expect(projected.getMidiNote(fixture.records.nonLoopSource.id, replacement.note.id)).toBe(
      replacement.note,
    )
    expect(
      projected.getMidiSustainPedalEvent(
        fixture.records.nonLoopSource.id,
        replacement.sustainPedalEvent.id,
      ),
    ).toBe(replacement.sustainPedalEvent)
    expect(snapshotReader(base)).toEqual(beforeBase)
    expect(base.project).toBe(fixture.records.project)
    expect(base.master).toBe(fixture.records.master)
  })

  it('allows a relationally invalid cascade when its final projected graph is valid', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const beforeBase = snapshotReader(base)
    const notes = [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote]
    const projected = createProjection(base, [
      {
        op: 'remove',
        table: 'clips',
        before: fixture.records.nonLoopClip,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: notes,
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
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: notes,
      },
      {
        op: 'insert',
        table: 'clips',
        after: fixture.records.nonLoopClip,
      },
    ])

    expect(projected.getClip(fixture.records.nonLoopClip.id)).toBe(fixture.records.nonLoopClip)
    expect(projected.getMidiSource(fixture.records.nonLoopSource.id)).toBe(
      fixture.records.nonLoopSource,
    )
    expect(projected.hasMidiNotePartition(fixture.records.nonLoopSource.id)).toBe(true)
    expect(snapshotReader(base)).toEqual(beforeBase)
  })

  it('throws the original ModelInvariantError for a final invalid graph and preserves base', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const beforeBase = snapshotReader(base)
    let caughtError: unknown

    try {
      createProjection(base, [
        {
          op: 'remove',
          table: 'tracks',
          before: fixture.records.instrumentTrack,
        },
      ])
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(ModelInvariantError)

    if (!(caughtError instanceof ModelInvariantError)) {
      throw new Error('Expected a ModelInvariantError')
    }

    expect(caughtError.violations.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['clip-missing-track', 'track-order-missing-track']),
    )
    expect(snapshotReader(base)).toEqual(beforeBase)
  })
})

describe('ProjectedModelStoreReader local preconditions', () => {
  it('reports insert existing with index and mutation type', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'insert',
          table: 'tracks',
          after: fixture.records.instrumentTrack,
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'insert-target-exists',
      changeIndex: 0,
      change: 'tracks.insert',
    })
  })

  it('reports a missing target after an earlier projected removal and preserves base', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const beforeBase = snapshotReader(base)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'remove',
          table: 'midiNotes',
          sourceId: fixture.records.nonLoopSource.id,
          before: fixture.records.nonLoopNote,
        },
        {
          op: 'remove',
          table: 'midiNotes',
          sourceId: fixture.records.nonLoopSource.id,
          before: fixture.records.nonLoopNote,
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'target-missing',
      changeIndex: 1,
      change: 'midiNotes.remove',
    })
    expect(snapshotReader(base)).toEqual(beforeBase)
  })

  it('reports before reference mismatch', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const staleProject = createProjectRecord({
      id: fixture.records.project.id,
      name: fixture.records.project.name,
    })
    const nextProject = createProjectRecord({
      id: fixture.records.project.id,
      name: 'Next Project',
    })
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'replace',
          table: 'project',
          before: staleProject,
          after: nextProject,
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'before-reference-mismatch',
      changeIndex: 0,
      change: 'project.replace',
    })
  })

  it('reports a track-order index outside the current projected bounds', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'insert',
          table: 'trackOrder',
          index: 3,
          trackId: fixture.records.instrumentTrack.id,
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'track-order-index-out-of-bounds',
      changeIndex: 0,
      change: 'trackOrder.insert',
    })
  })

  it('reports a track-order entry mismatch', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'remove',
          table: 'trackOrder',
          index: 0,
          trackId: fixture.records.audioTrack.id,
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'track-order-entry-mismatch',
      changeIndex: 0,
      change: 'trackOrder.remove',
    })
  })

  it('requires Note partition before payloads to contain the exact IDs and references', () => {
    const fixture = createCompleteProjectFixture()
    const staleNote = createMidiNoteRecord({ ...fixture.records.nonLoopNote })
    const mismatches: readonly (readonly MidiNoteRecord[])[] = [
      [staleNote, fixture.records.nonLoopHarmonyNote],
      [fixture.records.nonLoopNote],
    ]

    for (const before of mismatches) {
      const base = new ModelStore(fixture.seed)
      const error = capturePreconditionError(() =>
        createProjection(base, [
          {
            op: 'remove-partition',
            table: 'midiNotes',
            sourceId: fixture.records.nonLoopSource.id,
            records: before,
          },
        ]),
      )

      expect(error).toMatchObject({
        code: 'partition-content-mismatch',
        changeIndex: 0,
        change: 'midiNotes.remove-partition',
      })
    }
  })

  it('requires Sustain Pedal Event partition payloads to contain exact IDs and references', () => {
    const fixture = createCompleteProjectFixture()
    const staleEvent = createMidiSustainPedalEventRecord({
      ...fixture.records.nonLoopPedalDown,
    })
    const base = new ModelStore(fixture.seed)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'remove-partition',
          table: 'midiSustainPedalEvents',
          sourceId: fixture.records.nonLoopSource.id,
          records: [staleEvent, fixture.records.nonLoopPedalUp],
        },
      ]),
    )

    expect(error).toMatchObject({
      code: 'partition-content-mismatch',
      changeIndex: 0,
      change: 'midiSustainPedalEvents.remove-partition',
    })
  })
})

describe('Projected Note partition behavior', () => {
  it('compares partition removal by ID and reference set while ignoring payload order', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const reversedBefore = [fixture.records.nonLoopHarmonyNote, fixture.records.nonLoopNote]
    const projected = createProjection(base, [
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: reversedBefore,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: reversedBefore,
      },
    ])

    expect([...projected.midiNoteEntries(fixture.records.nonLoopSource.id)]).toEqual([
      [fixture.records.nonLoopHarmonyNote.id, fixture.records.nonLoopHarmonyNote],
      [fixture.records.nonLoopNote.id, fixture.records.nonLoopNote],
    ])
  })

  it('distinguishes an existing empty partition from a missing partition', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const emptyPartition = createProjection(base, [
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
      },
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopHarmonyNote,
      },
    ])
    const missingPartition = createProjection(base, [
      {
        op: 'remove',
        table: 'clips',
        before: fixture.records.nonLoopClip,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote],
      },
      {
        op: 'remove-partition',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.nonLoopSource.id,
        records: [fixture.records.nonLoopPedalDown, fixture.records.nonLoopPedalUp],
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: fixture.records.nonLoopSource,
      },
    ])

    expect(emptyPartition.hasMidiNotePartition(fixture.records.nonLoopSource.id)).toBe(true)
    expect([...emptyPartition.midiNoteEntries(fixture.records.nonLoopSource.id)]).toEqual([])
    expect(missingPartition.hasMidiNotePartition(fixture.records.nonLoopSource.id)).toBe(false)
    expect([...missingPartition.midiNoteEntries(fixture.records.nonLoopSource.id)]).toEqual([])
  })

  it('changes only the addressed partition when replacing one Note', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const replacement = createMidiNoteRecord({
      ...fixture.records.nonLoopNote,
      velocity: parseMidiVelocity(120),
    })
    const baseLoopingNotes = [...base.midiNoteEntries(fixture.records.loopingSource.id)]
    const projected = createProjection(base, [
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
        after: replacement,
      },
    ])

    expect(projected.getMidiNote(fixture.records.nonLoopSource.id, replacement.id)).toBe(
      replacement,
    )
    expect(
      projected.getMidiNote(
        fixture.records.nonLoopSource.id,
        fixture.records.nonLoopHarmonyNote.id,
      ),
    ).toBe(fixture.records.nonLoopHarmonyNote)
    expect([...projected.midiNoteEntries(fixture.records.loopingSource.id)]).toEqual(
      baseLoopingNotes,
    )
  })

  it('moves a Note across partitions through remove then insert', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const projected = createProjection(base, [
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        before: fixture.records.nonLoopNote,
      },
      {
        op: 'insert',
        table: 'midiNotes',
        sourceId: fixture.records.loopingSource.id,
        after: fixture.records.nonLoopNote,
      },
    ])

    expect(
      projected.getMidiNote(fixture.records.nonLoopSource.id, fixture.records.nonLoopNote.id),
    ).toBeUndefined()
    expect(
      projected.getMidiNote(fixture.records.loopingSource.id, fixture.records.nonLoopNote.id),
    ).toBe(fixture.records.nonLoopNote)
    expect(
      [...projected.midiNoteEntries(fixture.records.loopingSource.id)].map(([id]) => id),
    ).toEqual([
      fixture.records.loopingNote.id,
      fixture.records.loopingHarmonyNote.id,
      fixture.records.nonLoopNote.id,
    ])
  })
})

describe('Projected iterator ordering', () => {
  it('appends delete-then-insert entries while replacement retains the base position', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const replacement = createReplacementRecords(fixture)
    const replacementLoopingNote = createMidiNoteRecord({
      ...fixture.records.loopingNote,
      velocity: parseMidiVelocity(124),
    })
    const projected = createProjection(base, [
      {
        op: 'remove',
        table: 'tracks',
        before: fixture.records.instrumentTrack,
      },
      {
        op: 'insert',
        table: 'tracks',
        after: fixture.records.instrumentTrack,
      },
      {
        op: 'replace',
        table: 'tracks',
        before: fixture.records.audioTrack,
        after: replacement.track,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote],
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.nonLoopSource.id,
        records: [fixture.records.nonLoopNote, fixture.records.nonLoopHarmonyNote],
      },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: fixture.records.loopingSource.id,
        before: fixture.records.loopingNote,
        after: replacementLoopingNote,
      },
    ])

    expect([...projected.trackEntries()]).toEqual([
      [replacement.track.id, replacement.track],
      [fixture.records.instrumentTrack.id, fixture.records.instrumentTrack],
    ])
    expect([...projected.midiNotePartitionIds()]).toEqual([
      fixture.records.loopingSource.id,
      fixture.records.nonLoopSource.id,
    ])
    expect([...projected.midiNoteEntries(fixture.records.loopingSource.id)]).toEqual([
      [replacementLoopingNote.id, replacementLoopingNote],
      [fixture.records.loopingHarmonyNote.id, fixture.records.loopingHarmonyNote],
    ])
    expect([...base.trackEntries()].map(([id]) => id)).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.audioTrack.id,
    ])
    expect([...base.midiNotePartitionIds()]).toEqual([
      fixture.records.nonLoopSource.id,
      fixture.records.loopingSource.id,
    ])
  })
})

describe('projected mutation module boundary', () => {
  it('does not export the projected reader or precondition error from the package root', () => {
    expect(projectCore).not.toHaveProperty('ProjectedModelStoreReader')
    expect(projectCore).not.toHaveProperty('MutationPreconditionError')
  })
})
