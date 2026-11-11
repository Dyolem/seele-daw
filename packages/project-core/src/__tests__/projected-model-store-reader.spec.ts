import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  createInstrumentTrackRecord,
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
    }),
    track: createInstrumentTrackRecord({
      id: records.bassTrack.id,
      name: 'Projected Bass Track',
      color: records.bassTrack.color,
      channel: records.bassTrack.channel,
      instrumentDeviceId: records.bassTrack.instrumentDeviceId,
    }),
    clip: createMidiClipRecord({
      ...records.verseClip,
      name: 'Projected MIDI Clip',
    }),
    source: createMidiSourceRecord({
      id: records.verseSource.id,
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
      ...records.verseNote,
      velocity: parseMidiVelocity(116),
    }),
    sustainPedalEvent: createMidiSustainPedalEventRecord({
      ...records.versePedalDown,
      value: parseMidiControlValue(96),
    }),
  }
}

function capturePreconditionError(operation: () => unknown): Error {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(Error)

  if (!(caughtError instanceof Error)) {
    throw new Error('Expected an Error')
  }

  return caughtError
}

describe('ProjectedModelStoreReader complete projection', () => {
  it('implements ModelStoreReader and applies every mutation branch without changing the base', () => {
    const fixture = createCompleteProjectFixture()
    const base: ModelStoreReader = new ModelStore(fixture.seed)
    const beforeBase = snapshotReader(base)
    const replacement = createReplacementRecords(fixture)
    const partitionBefore = [fixture.records.verseHarmonyNote, fixture.records.verseNote]
    const partitionAfter = [fixture.records.verseNote, fixture.records.verseHarmonyNote]
    const sustainPedalEventPartitionBefore = [
      fixture.records.versePedalUp,
      fixture.records.versePedalDown,
    ]
    const sustainPedalEventPartitionAfter = [
      fixture.records.versePedalDown,
      fixture.records.versePedalUp,
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
        before: fixture.records.bassTrack,
      },
      {
        op: 'insert',
        table: 'tracks',
        after: fixture.records.bassTrack,
      },
      {
        op: 'replace',
        table: 'tracks',
        before: fixture.records.bassTrack,
        after: replacement.track,
      },
      {
        op: 'remove',
        table: 'clips',
        before: fixture.records.verseClip,
      },
      {
        op: 'insert',
        table: 'clips',
        after: fixture.records.verseClip,
      },
      {
        op: 'replace',
        table: 'clips',
        before: fixture.records.verseClip,
        after: replacement.clip,
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: fixture.records.verseSource,
      },
      {
        op: 'insert',
        table: 'midiSources',
        after: fixture.records.verseSource,
      },
      {
        op: 'replace',
        table: 'midiSources',
        before: fixture.records.verseSource,
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
        sourceId: fixture.records.verseSource.id,
        records: partitionBefore,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: partitionAfter,
      },
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseNote,
      },
      {
        op: 'insert',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        after: fixture.records.verseNote,
      },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseNote,
        after: replacement.note,
      },
      {
        op: 'remove-partition',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        records: sustainPedalEventPartitionBefore,
      },
      {
        op: 'insert-partition',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        records: sustainPedalEventPartitionAfter,
      },
      {
        op: 'remove',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.versePedalDown,
      },
      {
        op: 'insert',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        after: fixture.records.versePedalDown,
      },
      {
        op: 'replace',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.versePedalDown,
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
    expect(projected.getMidiNote(fixture.records.verseSource.id, replacement.note.id)).toBe(
      replacement.note,
    )
    expect(
      projected.getMidiSustainPedalEvent(
        fixture.records.verseSource.id,
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
    const notes = [fixture.records.verseNote, fixture.records.verseHarmonyNote]
    const projected = createProjection(base, [
      {
        op: 'remove',
        table: 'clips',
        before: fixture.records.verseClip,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: notes,
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: fixture.records.verseSource,
      },
      {
        op: 'insert',
        table: 'midiSources',
        after: fixture.records.verseSource,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: notes,
      },
      {
        op: 'insert',
        table: 'clips',
        after: fixture.records.verseClip,
      },
    ])

    expect(projected.getClip(fixture.records.verseClip.id)).toBe(fixture.records.verseClip)
    expect(projected.getMidiSource(fixture.records.verseSource.id)).toBe(
      fixture.records.verseSource,
    )
    expect(projected.hasMidiNotePartition(fixture.records.verseSource.id)).toBe(true)
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

    expect(error.message).toMatch(/^Change at index 0 \(tracks\.insert\) cannot insert existing /)
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
          sourceId: fixture.records.verseSource.id,
          before: fixture.records.verseNote,
        },
        {
          op: 'remove',
          table: 'midiNotes',
          sourceId: fixture.records.verseSource.id,
          before: fixture.records.verseNote,
        },
      ]),
    )

    expect(error.message).toMatch(/^Change at index 1 \(midiNotes\.remove\) cannot remove missing /)
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

    expect(error.message).toBe(
      'Change at index 0 (project.replace) Project no longer matches the expected before record',
    )
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

    expect(error.message).toMatch(
      /^Change at index 0 \(trackOrder\.insert\) cannot insert Track .+ at index 3 for length /,
    )
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
          trackId: fixture.records.bassTrack.id,
        },
      ]),
    )

    expect(error.message).toMatch(/^Change at index 0 \(trackOrder\.remove\) expected Track /)
  })

  it('requires Note partition before payloads to contain the exact IDs and references', () => {
    const fixture = createCompleteProjectFixture()
    const staleNote = createMidiNoteRecord({ ...fixture.records.verseNote })
    const mismatches: readonly (readonly MidiNoteRecord[])[] = [
      [staleNote, fixture.records.verseHarmonyNote],
      [fixture.records.verseNote],
    ]

    for (const before of mismatches) {
      const base = new ModelStore(fixture.seed)
      const error = capturePreconditionError(() =>
        createProjection(base, [
          {
            op: 'remove-partition',
            table: 'midiNotes',
            sourceId: fixture.records.verseSource.id,
            records: before,
          },
        ]),
      )

      expect(error.message).toMatch(
        /^Change at index 0 \(midiNotes\.remove-partition\) .+ no longer matches the expected before records$/,
      )
    }
  })

  it('requires Sustain Pedal Event partition payloads to contain exact IDs and references', () => {
    const fixture = createCompleteProjectFixture()
    const staleEvent = createMidiSustainPedalEventRecord({
      ...fixture.records.versePedalDown,
    })
    const base = new ModelStore(fixture.seed)
    const error = capturePreconditionError(() =>
      createProjection(base, [
        {
          op: 'remove-partition',
          table: 'midiSustainPedalEvents',
          sourceId: fixture.records.verseSource.id,
          records: [staleEvent, fixture.records.versePedalUp],
        },
      ]),
    )

    expect(error.message).toMatch(
      /^Change at index 0 \(midiSustainPedalEvents\.remove-partition\) .+ no longer matches the expected before records$/,
    )
  })
})

describe('Projected Note partition behavior', () => {
  it('compares partition removal by ID and reference set while ignoring payload order', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const reversedBefore = [fixture.records.verseHarmonyNote, fixture.records.verseNote]
    const projected = createProjection(base, [
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: reversedBefore,
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: reversedBefore,
      },
    ])

    expect([...projected.midiNoteEntries(fixture.records.verseSource.id)]).toEqual([
      [fixture.records.verseHarmonyNote.id, fixture.records.verseHarmonyNote],
      [fixture.records.verseNote.id, fixture.records.verseNote],
    ])
  })

  it('distinguishes an existing empty partition from a missing partition', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const emptyPartition = createProjection(base, [
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseNote,
      },
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseHarmonyNote,
      },
    ])
    const missingPartition = createProjection(base, [
      {
        op: 'remove',
        table: 'clips',
        before: fixture.records.verseClip,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: [fixture.records.verseNote, fixture.records.verseHarmonyNote],
      },
      {
        op: 'remove-partition',
        table: 'midiSustainPedalEvents',
        sourceId: fixture.records.verseSource.id,
        records: [fixture.records.versePedalDown, fixture.records.versePedalUp],
      },
      {
        op: 'remove',
        table: 'midiSources',
        before: fixture.records.verseSource,
      },
    ])

    expect(emptyPartition.hasMidiNotePartition(fixture.records.verseSource.id)).toBe(true)
    expect([...emptyPartition.midiNoteEntries(fixture.records.verseSource.id)]).toEqual([])
    expect(missingPartition.hasMidiNotePartition(fixture.records.verseSource.id)).toBe(false)
    expect([...missingPartition.midiNoteEntries(fixture.records.verseSource.id)]).toEqual([])
  })

  it('changes only the addressed partition when replacing one Note', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const replacement = createMidiNoteRecord({
      ...fixture.records.verseNote,
      velocity: parseMidiVelocity(120),
    })
    const baseChorusNotes = [...base.midiNoteEntries(fixture.records.chorusSource.id)]
    const projected = createProjection(base, [
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseNote,
        after: replacement,
      },
    ])

    expect(projected.getMidiNote(fixture.records.verseSource.id, replacement.id)).toBe(replacement)
    expect(
      projected.getMidiNote(fixture.records.verseSource.id, fixture.records.verseHarmonyNote.id),
    ).toBe(fixture.records.verseHarmonyNote)
    expect([...projected.midiNoteEntries(fixture.records.chorusSource.id)]).toEqual(baseChorusNotes)
  })

  it('moves a Note across partitions through remove then insert', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const projected = createProjection(base, [
      {
        op: 'remove',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        before: fixture.records.verseNote,
      },
      {
        op: 'insert',
        table: 'midiNotes',
        sourceId: fixture.records.chorusSource.id,
        after: fixture.records.verseNote,
      },
    ])

    expect(
      projected.getMidiNote(fixture.records.verseSource.id, fixture.records.verseNote.id),
    ).toBeUndefined()
    expect(
      projected.getMidiNote(fixture.records.chorusSource.id, fixture.records.verseNote.id),
    ).toBe(fixture.records.verseNote)
    expect(
      [...projected.midiNoteEntries(fixture.records.chorusSource.id)].map(([id]) => id),
    ).toEqual([
      fixture.records.chorusNote.id,
      fixture.records.chorusHarmonyNote.id,
      fixture.records.verseNote.id,
    ])
  })
})

describe('Projected iterator ordering', () => {
  it('appends delete-then-insert entries while replacement retains the base position', () => {
    const fixture = createCompleteProjectFixture()
    const base = new ModelStore(fixture.seed)
    const replacement = createReplacementRecords(fixture)
    const replacementChorusNote = createMidiNoteRecord({
      ...fixture.records.chorusNote,
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
        before: fixture.records.bassTrack,
        after: replacement.track,
      },
      {
        op: 'remove-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: [fixture.records.verseNote, fixture.records.verseHarmonyNote],
      },
      {
        op: 'insert-partition',
        table: 'midiNotes',
        sourceId: fixture.records.verseSource.id,
        records: [fixture.records.verseNote, fixture.records.verseHarmonyNote],
      },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: fixture.records.chorusSource.id,
        before: fixture.records.chorusNote,
        after: replacementChorusNote,
      },
    ])

    expect([...projected.trackEntries()]).toEqual([
      [replacement.track.id, replacement.track],
      [fixture.records.instrumentTrack.id, fixture.records.instrumentTrack],
    ])
    expect([...projected.midiNotePartitionIds()]).toEqual([
      fixture.records.chorusSource.id,
      fixture.records.verseSource.id,
    ])
    expect([...projected.midiNoteEntries(fixture.records.chorusSource.id)]).toEqual([
      [replacementChorusNote.id, replacementChorusNote],
      [fixture.records.chorusHarmonyNote.id, fixture.records.chorusHarmonyNote],
    ])
    expect([...base.trackEntries()].map(([id]) => id)).toEqual([
      fixture.records.instrumentTrack.id,
      fixture.records.bassTrack.id,
    ])
    expect([...base.midiNotePartitionIds()]).toEqual([
      fixture.records.verseSource.id,
      fixture.records.chorusSource.id,
    ])
  })
})

describe('projected mutation module boundary', () => {
  it('does not export the projected reader from the package root', () => {
    expect(projectCore).not.toHaveProperty('ProjectedModelStoreReader')
  })
})
