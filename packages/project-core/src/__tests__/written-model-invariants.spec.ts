// A commit validates only what it wrote. These sequences, valid and invalid, check that it still
// reports exactly what a full validation of the same final model reports.
import { describe, expect, it } from 'vitest'

import {
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  createTempoEventRecord,
  parseClipId,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
  type ClipRecord,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type MidiSustainPedalEventRecord,
} from '#internal/index'
import {
  ModelInvariantError,
  validateModelInvariants,
  type ModelInvariantViolation,
} from '#internal/model/invariant-validator'
import { ModelStore, type ModelStoreSeed } from '#internal/model/model-store'
import type { PartitionedTableName, StoredRecord } from '#internal/model/model-tables'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectChange } from '#internal/mutation/project-change'
import { ProjectedModelStoreReader } from '#internal/mutation/projected-model-store-reader'
import { createCompleteProjectFixture } from './support/complete-project-fixture'

type Table = Map<string, StoredRecord>

// The generator works with record types erased; these are its only casts back.
const asSeed = (seed: object) => seed as ModelStoreSeed
const asChange = (change: object) => change as ProjectChange

/** The model as plain Maps, written directly: the oracle builds a Store from it. */
interface Draft {
  readonly seed: ModelStoreSeed
  readonly tables: Readonly<Record<string, Table>>
  readonly partitions: Readonly<Record<PartitionedTableName, Map<MidiSourceId, Table>>>
}

function createDraft(seed: ModelStoreSeed): Draft {
  const copy = (table: ReadonlyMap<string, StoredRecord>): Table => new Map(table)
  const copyPartitions = (
    partitions: ReadonlyMap<MidiSourceId, ReadonlyMap<string, StoredRecord>>,
  ): Map<MidiSourceId, Table> =>
    new Map([...partitions].map(([sourceId, records]) => [sourceId, copy(records)]))
  const tables = {
    tracks: copy(seed.tracks),
    clips: copy(seed.clips),
    midiSources: copy(seed.midiSources),
    tempoEvents: copy(seed.tempoEvents),
    timeSignatureEvents: copy(seed.timeSignatureEvents),
    devices: copy(seed.devices),
  }
  const partitions = {
    midiNotes: copyPartitions(seed.midiNotes),
    midiSustainPedalEvents: copyPartitions(seed.midiSustainPedalEvents),
  }
  return {
    seed: asSeed({ ...seed, trackOrder: [...seed.trackOrder], ...tables, ...partitions }),
    tables,
    partitions,
  }
}

function write(draft: Draft, change: ProjectChange): void {
  if (change.table === 'project' || change.table === 'master' || change.table === 'trackOrder') {
    throw new Error(`The generator does not write ${change.table}`)
  }
  if (!('sourceId' in change)) {
    const table = draft.tables[change.table]!
    if (change.op === 'remove') table.delete(change.before.id)
    else table.set(change.after.id, change.after)
    return
  }
  const partitions = draft.partitions[change.table]
  if (change.op === 'insert-partition') {
    partitions.set(change.sourceId, new Map(change.records.map((record) => [record.id, record])))
  } else if (change.op === 'remove-partition') {
    partitions.delete(change.sourceId)
  } else {
    const partition = partitions.get(change.sourceId)!
    if (change.op === 'remove') partition.delete(change.before.id)
    else partition.set(change.after.id, change.after)
  }
}

/** mulberry32: small, seedable and good enough to spread choices. */
function createRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

class Generator {
  readonly #random: () => number
  #nextId = 0

  constructor(seed: number) {
    this.#random = createRandom(seed)
  }

  integer(min: number, max: number): number {
    return min + Math.floor(this.#random() * (max - min + 1))
  }

  chance(probability: number): boolean {
    return this.#random() < probability
  }

  pick<Value>(values: readonly Value[]): Value | undefined {
    return values.length === 0 ? undefined : values[this.integer(0, values.length - 1)]
  }

  freshId(prefix: string): string {
    this.#nextId += 1
    return `${prefix}-${this.#nextId}`
  }
}

function note(id: string, generator: Generator): MidiNoteRecord {
  return createMidiNoteRecord({
    id: parseNoteId(id),
    startTick: parseTick(generator.integer(0, 40) * 60),
    durationTick: parseTick(generator.integer(1, 16) * 60),
    pitch: parseMidiPitch(generator.integer(48, 72)),
    velocity: parseMidiVelocity(100),
    channel: parseMidiChannel(0),
  })
}

function pedalEvent(id: string, generator: Generator): MidiSustainPedalEventRecord {
  return createMidiSustainPedalEventRecord({
    id: parseMidiSustainPedalEventId(id),
    tick: parseTick(generator.integer(0, 35) * 60),
    value: parseMidiControlValue(generator.chance(0.5) ? 127 : 0),
    channel: parseMidiChannel(generator.integer(0, 1)),
  })
}

/** An ID for a new record: usually fresh, sometimes one another partition already uses. */
function insertedId(
  draft: Draft,
  table: PartitionedTableName,
  sourceId: MidiSourceId,
  prefix: string,
  generator: Generator,
): string {
  if (generator.chance(0.3)) {
    const elsewhere = [...draft.partitions[table]]
      .filter(([otherId]) => otherId !== sourceId)
      .flatMap(([, records]) => [...records.keys()])
    const reused = generator.pick(elsewhere)
    if (reused !== undefined) return reused
  }
  return generator.freshId(prefix)
}

const CREATE_RECORD = {
  midiNotes: note,
  midiSustainPedalEvents: pedalEvent,
} satisfies Record<PartitionedTableName, (id: string, generator: Generator) => StoredRecord>

const ID_PREFIX = { midiNotes: 'note-generated', midiSustainPedalEvents: 'sustain-generated' }

function partitionRecordChange(
  draft: Draft,
  table: PartitionedTableName,
  generator: Generator,
): ProjectChange | null {
  const sourceId = generator.pick([...draft.partitions[table].keys()])
  if (sourceId === undefined) return null
  const partition = draft.partitions[table].get(sourceId)!
  const before = generator.pick([...partition.values()])
  const operation = generator.integer(0, 2)

  if (operation === 0 || before === undefined) {
    const id = insertedId(draft, table, sourceId, ID_PREFIX[table], generator)
    if (partition.has(id)) return null
    return asChange({ op: 'insert', table, sourceId, after: CREATE_RECORD[table](id, generator) })
  }
  if (operation === 1) {
    return asChange({ op: 'remove', table, sourceId, before })
  }
  return asChange({
    op: 'replace',
    table,
    sourceId,
    before,
    after: CREATE_RECORD[table](before.id, generator),
  })
}

function sourceLengthChange(draft: Draft, generator: Generator): ProjectChange | null {
  const before = generator.pick([...draft.tables.midiSources!.values()]) as
    | MidiSourceRecord
    | undefined
  if (before === undefined) return null
  const after = createMidiSourceRecord({
    id: before.id,
    lengthTick: parseTick(generator.integer(8, 40) * 60),
  })
  return { op: 'replace', table: 'midiSources', before, after }
}

function clipWindowChange(draft: Draft, generator: Generator): ProjectChange | null {
  const before = generator.pick([...draft.tables.clips!.values()]) as ClipRecord | undefined
  if (before === undefined || before.loop !== null) return null
  const after = createMidiClipRecord({
    ...before,
    sourceOffsetTick: parseTick(generator.integer(0, 16) * 60),
    spanTick: parseTick(generator.integer(1, 32) * 60),
  })
  return { op: 'replace', table: 'clips', before, after }
}

/** A new Source with its partitions and Clip, any of which may be left out or collide. */
function sourceInsertion(draft: Draft, generator: Generator): ProjectChange[] {
  const sourceId = parseMidiSourceId(generator.freshId('source-generated'))
  const changes: ProjectChange[] = []
  if (generator.chance(0.9)) {
    changes.push({
      op: 'insert',
      table: 'midiSources',
      after: createMidiSourceRecord({ id: sourceId, lengthTick: parseTick(1_920) }),
    })
  }
  for (const table of ['midiNotes', 'midiSustainPedalEvents'] as const) {
    if (generator.chance(0.1)) continue
    const records = new Map<string, StoredRecord>()
    for (let count = generator.integer(0, 3); count > 0; count -= 1) {
      const id = insertedId(draft, table, sourceId, ID_PREFIX[table], generator)
      records.set(id, CREATE_RECORD[table](id, generator))
    }
    changes.push(
      asChange({ op: 'insert-partition', table, sourceId, records: [...records.values()] }),
    )
  }
  if (generator.chance(0.9)) {
    const trackId = generator.chance(0.9)
      ? draft.seed.trackOrder[0]!
      : draft.seed.trackOrder.at(-1)!
    changes.push({
      op: 'insert',
      table: 'clips',
      after: createMidiClipRecord({
        id: parseClipId(generator.freshId('clip-generated')),
        trackId,
        name: 'Generated',
        color: null,
        muted: false,
        startTick: parseTick(0),
        spanTick: parseTick(960),
        sourceId,
        sourceOffsetTick: parseTick(0),
        loop: null,
      }),
    })
  }
  return changes
}

/** Removes a Source's content, and usually the Source and its Clip with it. */
function sourceRemoval(draft: Draft, generator: Generator): ProjectChange[] {
  const sourceId = generator.pick([...draft.partitions.midiNotes.keys()])
  if (sourceId === undefined) return []
  const changes: ProjectChange[] = []
  for (const table of ['midiNotes', 'midiSustainPedalEvents'] as const) {
    const partition = draft.partitions[table].get(sourceId)
    if (partition === undefined || generator.chance(0.1)) continue
    changes.push(
      asChange({ op: 'remove-partition', table, sourceId, records: [...partition.values()] }),
    )
  }
  const source = draft.tables.midiSources!.get(sourceId) as MidiSourceRecord | undefined
  if (source !== undefined && generator.chance(0.8)) {
    changes.push({ op: 'remove', table: 'midiSources', before: source })
  }
  const clip = [...draft.tables.clips!.values()].find(
    (candidate) => (candidate as ClipRecord).sourceId === sourceId,
  ) as ClipRecord | undefined
  if (clip !== undefined && generator.chance(0.8)) {
    changes.push({ op: 'remove', table: 'clips', before: clip })
  }
  return changes
}

function tempoInsertion(generator: Generator): ProjectChange {
  return {
    op: 'insert',
    table: 'tempoEvents',
    after: createTempoEventRecord({
      id: parseTempoEventId(generator.freshId('tempo-generated')),
      tick: parseTick(generator.chance(0.3) ? 0 : generator.integer(1, 4) * 960),
      bpm: parseTempoBpm(100),
    }),
  }
}

function nextChanges(draft: Draft, generator: Generator): readonly ProjectChange[] {
  const kind = generator.integer(0, 9)
  if (kind <= 3) return [partitionRecordChange(draft, 'midiNotes', generator)].filter(isChange)
  if (kind <= 5) {
    return [partitionRecordChange(draft, 'midiSustainPedalEvents', generator)].filter(isChange)
  }
  if (kind === 6) return [sourceLengthChange(draft, generator)].filter(isChange)
  if (kind === 7) return [clipWindowChange(draft, generator)].filter(isChange)
  if (kind === 8)
    return generator.chance(0.5)
      ? sourceInsertion(draft, generator)
      : sourceRemoval(draft, generator)
  return [tempoInsertion(generator)]
}

function isChange(change: ProjectChange | null): change is ProjectChange {
  return change !== null
}

function projectedViolations(
  base: ModelStore,
  changes: readonly ProjectChange[],
): readonly ModelInvariantViolation[] {
  try {
    new ProjectedModelStoreReader(base, createMutationPlan(base.modelRevision, changes).forward)
    return []
  } catch (error) {
    if (error instanceof ModelInvariantError) return error.violations
    throw error
  }
}

describe('validation of what a commit wrote', () => {
  it('reports what full validation of the same final model reports', () => {
    const outcomes = { valid: 0, invalid: 0 }

    for (let seed = 1; seed <= 1_500; seed += 1) {
      const generator = new Generator(seed)
      const { seed: fixtureSeed } = createCompleteProjectFixture()
      const base = new ModelStore(fixtureSeed)
      const draft = createDraft(fixtureSeed)
      const changes: ProjectChange[] = []

      for (let step = generator.integer(1, 4); step > 0; step -= 1) {
        for (const change of nextChanges(draft, generator)) {
          write(draft, change)
          changes.push(change)
        }
      }
      if (changes.length === 0) continue

      const expected = validateModelInvariants(new ModelStore(draft.seed))
      expect({ seed, violations: projectedViolations(base, changes) }).toEqual({
        seed,
        violations: expected,
      })
      outcomes[expected.length === 0 ? 'valid' : 'invalid'] += 1
    }

    // Both outcomes must be common, or the sequences prove little.
    expect(outcomes.valid).toBeGreaterThan(200)
    expect(outcomes.invalid).toBeGreaterThan(200)
  })
})
