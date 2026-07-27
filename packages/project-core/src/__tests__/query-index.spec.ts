import { describe, expect, it } from 'vitest'

import {
  createAddNoteCommand,
  createMidiNoteByIdQuery,
  createMoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type ProjectCommand,
} from '#internal/index'
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import { createProjectCommitCandidate } from '#internal/commit/project-commit-candidate'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { executeProjectQueryByScan } from '#internal/queries/project-query-executor'
import { QueryIndex, QueryIndexError } from '#internal/queries/query-index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'

function requireReady(command: ProjectCommand, store: ModelStore) {
  const preparation = prepareProjectCommand(store, command)

  expect(preparation.status).toBe('ready')
  if (preparation.status !== 'ready') throw new Error('Expected a ready ProjectCommand preparation')

  return preparation
}

describe('QueryIndex lifecycle', () => {
  it('stages one incremental root and enforces transition ownership', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const index = new QueryIndex(store)
    const noteId = parseNoteId('note-index-transition')
    const command = createAddNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const preparation = requireReady(command, store)
    const commit = createProjectCommitCandidate(preparation.command, preparation.plan)
    const transition = index.prepare(store, commit.delta)

    expect(index.modelRevision).toBe(0)
    transition.stage()
    expect(index.modelRevision).toBe(1)
    expect(() => transition.stage()).toThrowError(
      expect.objectContaining<Partial<QueryIndexError>>({ code: 'transition-state-invalid' }),
    )
    transition.rollback()
    expect(index.modelRevision).toBe(0)
    expect(() => transition.rollback()).toThrowError(
      expect.objectContaining<Partial<QueryIndexError>>({ code: 'transition-state-invalid' }),
    )
  })

  it('falls back to authoritative scanning while stale, then rebuilds equivalently', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const index = new QueryIndex(store)
    const applier = new MutationApplier(store)
    const before = fixture.records.nonLoopNote
    const command = createMoveNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: before.id,
      nextStartTick: parseTick(960),
      nextPitch: parseMidiPitch(67),
    })
    const preparation = requireReady(command, store)
    const query = createMidiNoteByIdQuery({
      sourceId: fixture.records.nonLoopSource.id,
      noteId: before.id,
    })

    applier.apply(preparation.plan)
    expect(index.modelRevision).toBe(0)

    const fallback = index.execute(store, query)
    const scanned = executeProjectQueryByScan(store, query)

    expect(fallback).toEqual(scanned)
    expect(fallback.modelRevision).toBe(1)
    expect(fallback.note).not.toBe(before)

    index.rebuild(store)
    const rebuilt = index.execute(store, query)

    expect(index.modelRevision).toBe(1)
    expect(rebuilt).toEqual(scanned)
    expect(rebuilt.note).toBe(fallback.note)
  })

  it('rebuilds the current Store once before retrying a drifted incremental partition', () => {
    const fixture = createCompleteProjectFixture()
    const driftedPartitions = new Map(fixture.seed.midiNotesBySource)
    driftedPartitions.delete(fixture.records.nonLoopSource.id)

    const driftedStore = new ModelStore({
      ...fixture.seed,
      midiNotesBySource: driftedPartitions,
    })
    const store = new ModelStore(fixture.seed)
    const index = new QueryIndex(driftedStore)
    const applier = new MutationApplier(store)
    const noteId = parseNoteId('note-index-rebuild-retry')
    const command = createAddNoteCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const preparation = requireReady(command, store)
    const commit = createProjectCommitCandidate(preparation.command, preparation.plan)
    const transition = index.prepare(store, commit.delta)

    transition.stage()
    applier.apply(preparation.plan)

    const result = index.execute(
      store,
      createMidiNoteByIdQuery({
        sourceId: fixture.records.nonLoopSource.id,
        noteId,
      }),
    )

    expect(index.modelRevision).toBe(1)
    expect(result.modelRevision).toBe(1)
    expect(result.note).toBe(store.getMidiNote(fixture.records.nonLoopSource.id, noteId))
  })
})
