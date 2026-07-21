import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMIT_ORIGIN_KIND,
  PROJECT_HISTORY_DIRECTION,
  PROJECT_SUBSCRIPTION_TYPE,
  ProjectCommandError,
  ProjectSubscriptionError,
  createAddNoteCommand,
  createAllProjectCommitsSubscription,
  createMidiNoteChangesSubscription,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type MidiSourceId,
  type ModelRevision,
  type NoteId,
  type ProjectCommit,
  type ProjectSession,
  type ProjectSubscription,
  type ProjectSubscriptionDeliveryFailure,
  type ProjectSubscriptionObserver,
  type ProjectUnsubscribe,
  type Tick,
} from '#internal/index'
import { MutationApplyError } from '#internal/mutation/mutation-apply-error'
import { ChangePublisher } from '#internal/subscriptions/change-publisher'
import { withAuthoritativeMapSetInterceptor } from './support/map-set-interceptor'
import { createFixtureProjectSession } from './support/project-session-test-support'

function createObserver(
  onCommit: ProjectSubscriptionObserver['onCommit'],
  onError: ProjectSubscriptionObserver['onError'] = (failure) => {
    void failure
  },
): ProjectSubscriptionObserver {
  return { onCommit, onError }
}

function executeAddNote(
  session: ProjectSession,
  sourceId: MidiSourceId,
  noteId: NoteId,
  startTick: Tick = parseTick(1_200),
): ProjectCommit {
  const result = session.execute(
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId,
      noteId,
      startTick,
      durationTick: parseTick(120),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
  )

  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Expected AddNote to commit in subscription test')
  }

  return result.commit
}

async function flushCommitDeliveries(turns = 1): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await Promise.resolve()
}

describe('ProjectSubscription public contract', () => {
  it('exports normalized frozen descriptors while keeping publisher internals private', () => {
    const { fixture, session } = createFixtureProjectSession()
    const sourceIds = [fixture.records.nonLoopSource.id, fixture.records.nonLoopSource.id]
    const noteIds = [fixture.records.nonLoopNote.id, fixture.records.nonLoopNote.id]
    const affected = { startTick: parseTick(240), endTick: parseTick(720) }
    const allCommits = createAllProjectCommitsSubscription()
    const midiNotes = createMidiNoteChangesSubscription({ sourceIds, noteIds, affected })
    const unsubscribe = session.subscribe(
      allCommits,
      createObserver(() => undefined),
    )

    sourceIds.push(fixture.records.loopingSource.id)
    noteIds.push(fixture.records.loopingNote.id)
    affected.startTick = parseTick(0)

    expect(PROJECT_SUBSCRIPTION_TYPE).toEqual({
      ALL_COMMITS: 'project-commit.all',
      MIDI_NOTE_CHANGES: 'midi-note.changes',
    })
    expect(allCommits).toEqual({ type: PROJECT_SUBSCRIPTION_TYPE.ALL_COMMITS })
    expect(midiNotes).toEqual({
      type: PROJECT_SUBSCRIPTION_TYPE.MIDI_NOTE_CHANGES,
      sourceIds: [fixture.records.nonLoopSource.id],
      noteIds: [fixture.records.nonLoopNote.id],
      affected: { startTick: 240, endTick: 720 },
    })
    expect(Object.isFrozen(allCommits)).toBe(true)
    expect(Object.isFrozen(midiNotes)).toBe(true)
    expect(Object.isFrozen(midiNotes.sourceIds)).toBe(true)
    expect(Object.isFrozen(midiNotes.noteIds)).toBe(true)
    expect(Object.isFrozen(midiNotes.affected)).toBe(true)
    expect(Object.isFrozen(unsubscribe)).toBe(true)
    expectTypeOf(unsubscribe).toEqualTypeOf<ProjectUnsubscribe>()
    expect('ChangePublisher' in projectCore).toBe(false)
    expect('PreparedChangePublication' in projectCore).toBe(false)
    expect('normalizeProjectSubscription' in projectCore).toBe(false)
  })

  it('rejects ambiguous identity filters, invalid ranges, unknown types, and invalid observers', () => {
    const { session } = createFixtureProjectSession()
    const observer = createObserver(() => undefined)

    expect(() => createMidiNoteChangesSubscription({ sourceIds: [] })).toThrowError(
      expect.objectContaining<Partial<ProjectSubscriptionError>>({ code: 'empty-source-ids' }),
    )
    expect(() => createMidiNoteChangesSubscription({ noteIds: [] })).toThrowError(
      expect.objectContaining<Partial<ProjectSubscriptionError>>({ code: 'empty-note-ids' }),
    )
    expect(() =>
      createMidiNoteChangesSubscription({
        affected: { startTick: parseTick(480), endTick: parseTick(480) },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectSubscriptionError>>({ code: 'invalid-tick-range' }),
    )
    expect(() =>
      session.subscribe(
        { type: 'project-commit.unknown' } as unknown as ProjectSubscription,
        observer,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectSubscriptionError>>({
        code: 'unknown-subscription-type',
      }),
    )
    expect(() =>
      session.subscribe(createAllProjectCommitsSubscription(), {
        onCommit: () => undefined,
      } as unknown as ProjectSubscriptionObserver),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectSubscriptionError>>({ code: 'invalid-observer' }),
    )
  })
})

describe('ProjectSession commit publication', () => {
  it('publishes Command, Undo, and Redo commits asynchronously in revision order', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const received: ProjectCommit[] = []

    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => received.push(commit)),
    )

    const commandCommit = executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-history'),
    )
    const undoCommit = session.undo()
    const redoCommit = session.redo()

    expect(received).toEqual([])
    await flushCommitDeliveries()

    expect(received).toEqual([commandCommit, undoCommit, redoCommit])
    expect(received.map((commit) => commit.modelRevision)).toEqual([1, 2, 3])
    expect(received.map((commit) => commit.origin)).toEqual([
      {
        kind: PROJECT_COMMIT_ORIGIN_KIND.COMMAND,
        commandType: commandCommit.origin.commandType,
      },
      {
        kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
        direction: PROJECT_HISTORY_DIRECTION.UNDO,
        commandType: commandCommit.origin.commandType,
      },
      {
        kind: PROJECT_COMMIT_ORIGIN_KIND.HISTORY,
        direction: PROJECT_HISTORY_DIRECTION.REDO,
        commandType: commandCommit.origin.commandType,
      },
    ])
  })

  it('does not publish no-change, rejected, or empty History operations', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const received: ProjectCommit[] = []

    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => received.push(commit)),
    )

    expect(session.undo()).toBeNull()
    expect(session.redo()).toBeNull()
    session.execute(
      createMoveNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: fixture.records.nonLoopNote.id,
        nextStartTick: fixture.records.nonLoopNote.startTick,
        nextPitch: fixture.records.nonLoopNote.pitch,
      }),
    )
    expect(() =>
      session.execute(
        createRemoveNoteCommand({
          baseRevision: 1 as ModelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: fixture.records.nonLoopNote.id,
        }),
      ),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({ code: 'base-revision-mismatch' }),
    )

    await flushCommitDeliveries()
    expect(received).toEqual([])
  })

  it('filters MIDI Note changes by source, note, and half-open affected range', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const noteId = parseNoteId('note-subscription-filter')
    const counts = {
      allNotes: 0,
      source: 0,
      wrongSource: 0,
      note: 0,
      endingAtStart: 0,
      overlapping: 0,
      combined: 0,
      wrongCombined: 0,
    }
    const subscribe = (
      subscription: ProjectSubscription,
      key: keyof typeof counts,
    ): ProjectUnsubscribe =>
      session.subscribe(
        subscription,
        createObserver(() => {
          counts[key] += 1
        }),
      )

    subscribe(createMidiNoteChangesSubscription(), 'allNotes')
    subscribe(
      createMidiNoteChangesSubscription({ sourceIds: [fixture.records.nonLoopSource.id] }),
      'source',
    )
    subscribe(
      createMidiNoteChangesSubscription({ sourceIds: [fixture.records.loopingSource.id] }),
      'wrongSource',
    )
    subscribe(createMidiNoteChangesSubscription({ noteIds: [noteId] }), 'note')
    subscribe(
      createMidiNoteChangesSubscription({
        affected: { startTick: parseTick(960), endTick: parseTick(1_200) },
      }),
      'endingAtStart',
    )
    subscribe(
      createMidiNoteChangesSubscription({
        affected: { startTick: parseTick(1_319), endTick: parseTick(1_321) },
      }),
      'overlapping',
    )
    subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [fixture.records.nonLoopSource.id],
        noteIds: [noteId],
        affected: { startTick: parseTick(1_200), endTick: parseTick(1_320) },
      }),
      'combined',
    )
    subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [fixture.records.nonLoopSource.id],
        noteIds: [fixture.records.nonLoopNote.id],
        affected: { startTick: parseTick(1_200), endTick: parseTick(1_320) },
      }),
      'wrongCombined',
    )

    executeAddNote(session, fixture.records.nonLoopSource.id, noteId)
    await flushCommitDeliveries()

    expect(counts).toEqual({
      allNotes: 1,
      source: 1,
      wrongSource: 0,
      note: 1,
      endingAtStart: 0,
      overlapping: 1,
      combined: 1,
      wrongCombined: 0,
    })
  })

  it('matches constraints on the same change and calls once for a multi-change Commit', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const firstCommit = executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-multi-change-first'),
    )
    const secondCommit = executeAddNote(
      session,
      fixture.records.loopingSource.id,
      parseNoteId('note-subscription-multi-change-second'),
    )
    const firstChange = firstCommit.delta.changes[0]!
    const secondChange = secondCommit.delta.changes[0]!
    const syntheticCommit = Object.freeze<ProjectCommit>({
      ...secondCommit,
      delta: Object.freeze({
        modelRevision: secondCommit.modelRevision,
        changes: Object.freeze([firstChange, secondChange]),
      }),
    })
    const publisher = new ChangePublisher()
    const received: ProjectCommit[] = []
    const crossedConstraints: ProjectCommit[] = []

    publisher.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [fixture.records.nonLoopSource.id, fixture.records.loopingSource.id],
      }),
      createObserver((published) => received.push(published)),
    )
    publisher.subscribe(
      createMidiNoteChangesSubscription({
        sourceIds: [firstChange.sourceId],
        noteIds: [secondChange.noteId],
      }),
      createObserver((published) => crossedConstraints.push(published)),
    )
    publisher.prepare(syntheticCommit)

    await flushCommitDeliveries()
    expect(received).toEqual([syntheticCommit])
    expect(crossedConstraints).toEqual([])
  })

  it('supports idempotent cancellation before a queued delivery runs', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const received: ProjectCommit[] = []
    const unsubscribe = session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => received.push(commit)),
    )

    executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-cancelled'),
    )
    unsubscribe()
    unsubscribe()

    await flushCommitDeliveries()
    expect(received).toEqual([])
  })

  it('does not replay old commits and honors cancellation during an observer batch', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const firstObserverRevisions: number[] = []
    const secondObserverRevisions: number[] = []

    executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-before-registration'),
    )

    let unsubscribeSecond: ProjectUnsubscribe = () => undefined
    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => {
        firstObserverRevisions.push(commit.modelRevision)
        unsubscribeSecond()
      }),
    )
    unsubscribeSecond = session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => secondObserverRevisions.push(commit.modelRevision)),
    )

    await flushCommitDeliveries()
    expect(firstObserverRevisions).toEqual([])
    expect(secondObserverRevisions).toEqual([])

    executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-after-registration'),
      parseTick(1_440),
    )
    await flushCommitDeliveries()

    expect(firstObserverRevisions).toEqual([2])
    expect(secondObserverRevisions).toEqual([])
  })

  it('keeps reentrant commits after the current observer batch', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const order: string[] = []
    const firstNoteId = parseNoteId('note-subscription-reentrant-first')
    const secondNoteId = parseNoteId('note-subscription-reentrant-second')

    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => {
        order.push(`a:${commit.modelRevision}`)

        if (commit.modelRevision === 1) {
          session.subscribe(
            createAllProjectCommitsSubscription(),
            createObserver((laterCommit) => order.push(`c:${laterCommit.modelRevision}`)),
          )
          executeAddNote(session, fixture.records.nonLoopSource.id, secondNoteId, parseTick(1_440))
        }
      }),
    )
    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => order.push(`b:${commit.modelRevision}`)),
    )

    executeAddNote(session, fixture.records.nonLoopSource.id, firstNoteId)
    await flushCommitDeliveries(2)

    expect(order).toEqual(['a:1', 'b:1', 'a:2', 'b:2', 'c:2'])
    expect(session.modelRevision).toBe(2)
  })

  it('isolates listener errors, reports a frozen failure, and terminates only that observer', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const cause = new Error('injected subscription listener failure')
    const failingCommits: ProjectCommit[] = []
    const healthyCommits: ProjectCommit[] = []
    const failures: ProjectSubscriptionDeliveryFailure[] = []
    const subscription = createAllProjectCommitsSubscription()

    session.subscribe(
      subscription,
      createObserver(
        (commit) => {
          failingCommits.push(commit)
          throw cause
        },
        (failure) => {
          failures.push(failure)
          throw new Error('injected subscription error-handler failure')
        },
      ),
    )
    session.subscribe(
      subscription,
      createObserver((commit) => healthyCommits.push(commit)),
    )

    const firstCommit = executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-failure-first'),
    )
    await flushCommitDeliveries()
    const secondCommit = executeAddNote(
      session,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-subscription-failure-second'),
      parseTick(1_440),
    )
    await flushCommitDeliveries()

    expect(failingCommits).toEqual([firstCommit])
    expect(healthyCommits).toEqual([firstCommit, secondCommit])
    expect(failures).toHaveLength(1)
    expect(failures[0]).toEqual({ subscription, commit: firstCommit, cause })
    expect(Object.isFrozen(failures[0])).toBe(true)
  })

  it('cancels a prepared publication when authoritative apply fails', async () => {
    const { fixture, session } = createFixtureProjectSession()
    const noteId = parseNoteId('note-subscription-write-failure')
    const command = createAddNoteCommand({
      baseRevision: session.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId,
      startTick: parseTick(1_200),
      durationTick: parseTick(120),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    })
    const received: ProjectCommit[] = []

    session.subscribe(
      createAllProjectCommitsSubscription(),
      createObserver((commit) => received.push(commit)),
    )

    expect(() =>
      withAuthoritativeMapSetInterceptor(
        (key) => {
          if (key === noteId) throw new Error('injected subscription write failure')
        },
        () => session.execute(command),
      ),
    ).toThrowError(expect.objectContaining<Partial<MutationApplyError>>({ code: 'write-failed' }))

    const successfulCommit = executeAddNote(session, fixture.records.nonLoopSource.id, noteId)
    await flushCommitDeliveries()

    expect(received).toEqual([successfulCommit])
  })
})
