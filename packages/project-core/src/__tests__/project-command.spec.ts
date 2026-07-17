import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '~/index'
import {
  DomainValueError,
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  ZERO_TICK,
  createAddNoteCommand,
  createMoveNoteCommand,
  createRemoveNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  type AddNoteCommand,
  type ModelRevision,
  type MoveNoteCommand,
  type ProjectCommand,
  type RemoveNoteCommand,
} from '~/index'
import { createCompleteProjectFixture } from './fixtures/complete-project-fixture'
import { prepareProjectCommand } from '@/commands/project-command-preparer'
import type { ProjectCommandPreparation } from '@/commands/project-command-preparation'
import { ModelStore } from '@/model/model-store'
import { MutationApplier } from '@/mutation/mutation-applier'
import { createMutationPlan, type MutationPlan } from '@/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '@/mutation/mutation-type'

function captureCommandError(operation: () => unknown): ProjectCommandError {
  let caughtError: unknown

  try {
    operation()
  } catch (error) {
    caughtError = error
  }

  expect(caughtError).toBeInstanceOf(ProjectCommandError)

  if (!(caughtError instanceof ProjectCommandError)) {
    throw new Error('Expected a ProjectCommandError')
  }

  return caughtError
}

function requireReady(preparation: ProjectCommandPreparation): MutationPlan {
  expect(preparation.status).toBe('ready')

  if (preparation.status !== 'ready') {
    throw new Error('Expected a ready ProjectCommand preparation')
  }

  return preparation.plan
}

function createAddCommand(
  store: ModelStore,
  sourceId: ReturnType<typeof parseMidiSourceId>,
  overrides: Partial<Parameters<typeof createAddNoteCommand>[0]> = {},
): AddNoteCommand {
  return createAddNoteCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteId: parseNoteId('note-command-added'),
    startTick: parseTick(960),
    durationTick: parseTick(240),
    pitch: parseMidiPitch(72),
    velocity: parseMidiVelocity(104),
    channel: parseMidiChannel(2),
    ...overrides,
  })
}

function createMoveCommand(
  store: ModelStore,
  sourceId: ReturnType<typeof parseMidiSourceId>,
  noteId: ReturnType<typeof parseNoteId>,
  overrides: Partial<Parameters<typeof createMoveNoteCommand>[0]> = {},
): MoveNoteCommand {
  return createMoveNoteCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteId,
    nextStartTick: parseTick(960),
    nextPitch: parseMidiPitch(65),
    ...overrides,
  })
}

function createRemoveCommand(
  store: ModelStore,
  sourceId: ReturnType<typeof parseMidiSourceId>,
  noteId: ReturnType<typeof parseNoteId>,
): RemoveNoteCommand {
  return createRemoveNoteCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteId,
  })
}

function applyAndInverse(store: ModelStore, plan: MutationPlan): void {
  const applier = new MutationApplier(store)
  const committedRevision = applier.apply(plan)
  const inversePlan = createMutationPlan(committedRevision, plan.inverse)

  applier.apply(inversePlan)
}

describe('ProjectCommand public contract', () => {
  it('constructs complete readonly MIDI Note commands from the package root', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const add = createAddCommand(store, fixture.records.nonLoopSource.id)
    const move = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const remove = createRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )

    expect(add).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: parseNoteId('note-command-added'),
      startTick: parseTick(960),
      durationTick: parseTick(240),
      pitch: parseMidiPitch(72),
      velocity: parseMidiVelocity(104),
      channel: parseMidiChannel(2),
    })
    expect(move.type).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE)
    expect(remove.type).toBe(PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE)
    expectTypeOf(add).toEqualTypeOf<AddNoteCommand>()
    expectTypeOf(move).toEqualTypeOf<MoveNoteCommand>()
    expectTypeOf(remove).toEqualTypeOf<RemoveNoteCommand>()
    expectTypeOf<ProjectCommand>().toEqualTypeOf<
      AddNoteCommand | MoveNoteCommand | RemoveNoteCommand
    >()
  })

  it('keeps planning and write capabilities out of the package root', () => {
    expect('prepareProjectCommand' in projectCore).toBe(false)
    expect('createMutationPlan' in projectCore).toBe(false)
    expect('MutationApplier' in projectCore).toBe(false)
    expect('ModelStore' in projectCore).toBe(false)
  })

  it.each([-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid command base revision: %s',
    (revision) => {
      const fixture = createCompleteProjectFixture()
      const error = captureCommandError(() =>
        createRemoveNoteCommand({
          baseRevision: revision as ModelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteId: fixture.records.nonLoopNote.id,
        }),
      )

      expect(error.code).toBe('invalid-base-revision')
      expect(error.baseRevision).toBe(revision)
    },
  )

  it('reuses domain factories for local Note value validation', () => {
    const fixture = createCompleteProjectFixture()

    expect(() =>
      createAddNoteCommand({
        baseRevision: 0 as ModelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: parseNoteId('note-invalid-duration'),
        startTick: ZERO_TICK,
        durationTick: ZERO_TICK,
        pitch: parseMidiPitch(60),
        velocity: parseMidiVelocity(100),
        channel: parseMidiChannel(0),
      }),
    ).toThrow(DomainValueError)
  })
})

describe('ProjectCommand preparation boundary', () => {
  it('rejects stale commands before treating an unchanged Move as no-change', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const staleRevision = 1 as ModelRevision
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        baseRevision: staleRevision,
        nextStartTick: fixture.records.nonLoopNote.startTick,
        nextPitch: fixture.records.nonLoopNote.pitch,
      },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('base-revision-mismatch')
    expect(error.baseRevision).toBe(staleRevision)
    expect(error.currentRevision).toBe(store.modelRevision)
  })

  it('rejects an unknown runtime command discriminant', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = {
      type: 'midi-note.unknown',
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
    } as unknown as ProjectCommand
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('unknown-command-type')
    expect(error.commandType).toBe('midi-note.unknown')
  })

  it('rejects a missing MidiSource with address details', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingSourceId = parseMidiSourceId('source-command-missing')
    const command = createAddCommand(store, missingSourceId)
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-source-not-found')
    expect(error.sourceId).toBe(missingSourceId)
    expect(error.noteId).toBe(command.noteId)
  })

  it('defensively rejects a missing Note partition', () => {
    const fixture = createCompleteProjectFixture()
    fixture.containers.midiNotesBySource.delete(fixture.records.nonLoopSource.id)
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.nonLoopSource.id)
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-note-partition-missing')
    expect(error.sourceId).toBe(fixture.records.nonLoopSource.id)
  })
})

describe('AddNoteCommand', () => {
  it('prepares one NOTE.INSERT and accepts an end exactly at the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.nonLoopSource.id, {
      startTick: parseTick(1_680),
      durationTick: parseTick(240),
    })
    const plan = requireReady(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(plan.baseRevision).toBe(store.modelRevision)
    expect(plan.forward).toHaveLength(1)
    expect(mutation).toEqual({
      type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
      sourceId: command.sourceId,
      after: {
        id: command.noteId,
        startTick: command.startTick,
        durationTick: command.durationTick,
        pitch: command.pitch,
        velocity: command.velocity,
        channel: command.channel,
      },
    })
    if (mutation?.type !== PROJECT_MUTATION_TYPE.NOTE.INSERT) {
      throw new Error('Expected NOTE.INSERT')
    }
    expect(plan.inverse[0]).toEqual({
      type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
      sourceId: command.sourceId,
      before: mutation.after,
    })
  })

  it('rejects a Note whose end exceeds the strict Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.nonLoopSource.id, {
      startTick: parseTick(1_681),
      durationTick: parseTick(240),
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
    expect(error.noteEndTick).toBe(1_921)
    expect(error.sourceLengthTick).toBe(fixture.records.nonLoopSource.lengthTick)
  })

  it('rejects a Note ID already used in another Source partition', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.loopingSource.id, {
      noteId: fixture.records.nonLoopNote.id,
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-id-already-exists')
    expect(error.noteId).toBe(fixture.records.nonLoopNote.id)
  })

  it('applies and inverses the prepared insertion as two atomic revisions', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.nonLoopSource.id)
    const plan = requireReady(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBeUndefined()
  })
})

describe('RemoveNoteCommand', () => {
  it('prepares one NOTE.REMOVE with the current Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReady(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(mutation?.type).toBe(PROJECT_MUTATION_TYPE.NOTE.REMOVE)
    if (mutation?.type !== PROJECT_MUTATION_TYPE.NOTE.REMOVE) {
      throw new Error('Expected NOTE.REMOVE')
    }
    expect(mutation.before).toBe(fixture.records.nonLoopNote)
  })

  it('rejects a missing Note instead of treating removal as idempotent', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-command-missing'),
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-note-not-found')
    expect(error.noteId).toBe(command.noteId)
  })

  it('applies the removal and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReady(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(fixture.records.nonLoopNote)
  })
})

describe('MoveNoteCommand', () => {
  it('prepares one NOTE.REPLACE while preserving identity and non-move fields', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        nextStartTick: parseTick(1_200),
        nextPitch: parseMidiPitch(74),
      },
    )
    const plan = requireReady(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(mutation?.type).toBe(PROJECT_MUTATION_TYPE.NOTE.REPLACE)
    if (mutation?.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE) {
      throw new Error('Expected NOTE.REPLACE')
    }
    expect(mutation.before).toBe(fixture.records.nonLoopNote)
    expect(mutation.after).not.toBe(mutation.before)
    expect(mutation.after).toEqual({
      ...fixture.records.nonLoopNote,
      startTick: command.nextStartTick,
      pitch: command.nextPitch,
    })
  })

  it('returns no-change for an unchanged absolute target without creating a plan', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        nextStartTick: fixture.records.nonLoopNote.startTick,
        nextPitch: fixture.records.nonLoopNote.pitch,
      },
    )
    const preparation = prepareProjectCommand(store, command)

    expect(preparation).toEqual({
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
    expect(store.modelRevision).toBe(0)
    expect('plan' in preparation).toBe(false)
  })

  it('rejects a moved Note whose unchanged duration would exceed the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      { nextStartTick: parseTick(1_441) },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
    expect(error.noteEndTick).toBe(1_921)
    expect(error.sourceLengthTick).toBe(fixture.records.nonLoopSource.lengthTick)
  })

  it('applies the replacement and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReady(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(fixture.records.nonLoopNote)
  })
})
