import { describe, expect, expectTypeOf, it } from 'vitest'

import * as projectCore from '#internal/index'
import {
  DomainValueError,
  PROJECT_COMMAND_TYPE,
  ProjectCommandError,
  ZERO_TICK,
  createAddNoteCommand,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTickDelta,
  type AddNoteCommand,
  type AddInstrumentTrackCommand,
  type AddMidiClipCommand,
  type ModelRevision,
  type MoveNotesCommand,
  type ProjectCommand,
  type RemoveNotesCommand,
  type ResizeNoteCommand,
} from '#internal/index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { prepareProjectCommand } from '#internal/commands/project-command-preparer'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { createMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'

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
  overrides: Partial<Parameters<typeof createMoveNotesCommand>[0]> = {},
): MoveNotesCommand {
  return createMoveNotesCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteIds: [noteId],
    deltaTick: parseTickDelta(720),
    deltaPitch: parseMidiPitchDelta(5),
    ...overrides,
  })
}

function createSingleRemoveCommand(
  store: ModelStore,
  sourceId: ReturnType<typeof parseMidiSourceId>,
  noteId: ReturnType<typeof parseNoteId>,
): RemoveNotesCommand {
  return createRemoveNotesCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteIds: [noteId],
  })
}

function createResizeCommand(
  store: ModelStore,
  sourceId: ReturnType<typeof parseMidiSourceId>,
  noteId: ReturnType<typeof parseNoteId>,
  overrides: Partial<Parameters<typeof createResizeNoteCommand>[0]> = {},
): ResizeNoteCommand {
  return createResizeNoteCommand({
    baseRevision: store.modelRevision,
    sourceId,
    noteId,
    startTick: parseTick(120),
    durationTick: parseTick(600),
    ...overrides,
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
    const remove = createRemoveNotesCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id, fixture.records.nonLoopHarmonyNote.id],
    })
    const resize = createResizeCommand(
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
    expect(Object.isFrozen(move.noteIds)).toBe(true)
    expect(remove).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id, fixture.records.nonLoopHarmonyNote.id],
    })
    expect(Object.isFrozen(remove.noteIds)).toBe(true)
    expect(resize).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteId: fixture.records.nonLoopNote.id,
      startTick: parseTick(120),
      durationTick: parseTick(600),
    })
    expectTypeOf(add).toEqualTypeOf<AddNoteCommand>()
    expectTypeOf(move).toEqualTypeOf<MoveNotesCommand>()
    expectTypeOf(remove).toEqualTypeOf<RemoveNotesCommand>()
    expectTypeOf(resize).toEqualTypeOf<ResizeNoteCommand>()
    expectTypeOf<ProjectCommand>().toEqualTypeOf<
      | AddInstrumentTrackCommand
      | AddMidiClipCommand
      | AddNoteCommand
      | MoveNotesCommand
      | RemoveNotesCommand
      | ResizeNoteCommand
    >()
  })

  it('rejects empty or duplicate MIDI Note collection targets', () => {
    const fixture = createCompleteProjectFixture()
    const input = {
      baseRevision: 0 as ModelRevision,
      sourceId: fixture.records.nonLoopSource.id,
    }

    expect(() =>
      createRemoveNotesCommand({
        ...input,
        noteIds: [],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'empty-note-id-list',
      }),
    )
    expect(() =>
      createRemoveNotesCommand({
        ...input,
        noteIds: [fixture.records.nonLoopNote.id, fixture.records.nonLoopNote.id],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'duplicate-note-id',
        noteId: fixture.records.nonLoopNote.id,
      }),
    )

    expect(() =>
      createMoveNotesCommand({
        ...input,
        noteIds: [],
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(1),
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'empty-note-id-list',
      }),
    )
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
        createRemoveNotesCommand({
          baseRevision: revision as ModelRevision,
          sourceId: fixture.records.nonLoopSource.id,
          noteIds: [fixture.records.nonLoopNote.id],
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

    expect(() =>
      createResizeNoteCommand({
        baseRevision: 0 as ModelRevision,
        sourceId: fixture.records.nonLoopSource.id,
        noteId: fixture.records.nonLoopNote.id,
        startTick: ZERO_TICK,
        durationTick: ZERO_TICK,
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
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
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
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
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
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBeUndefined()
  })
})

describe('RemoveNotesCommand', () => {
  it('prepares one NOTE.REMOVE with the current Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createSingleRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
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
    const command = createSingleRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      parseNoteId('note-command-missing'),
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-note-not-found')
    expect(error.noteId).toBe(command.noteIds[0])
  })

  it('applies the removal and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createSingleRemoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, fixture.records.nonLoopNote.id)).toBe(
      fixture.records.nonLoopNote,
    )
  })
})

describe('MoveNotesCommand', () => {
  it('prepares one NOTE.REPLACE while preserving identity and non-move fields', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        deltaTick: parseTickDelta(960),
        deltaPitch: parseMidiPitchDelta(14),
      },
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(mutation?.type).toBe(PROJECT_MUTATION_TYPE.NOTE.REPLACE)
    if (mutation?.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE) {
      throw new Error('Expected NOTE.REPLACE')
    }
    expect(mutation.before).toBe(fixture.records.nonLoopNote)
    expect(mutation.after).not.toBe(mutation.before)
    expect(mutation.after).toEqual({
      ...fixture.records.nonLoopNote,
      startTick: parseTick(fixture.records.nonLoopNote.startTick + command.deltaTick),
      pitch: parseMidiPitch(fixture.records.nonLoopNote.pitch + command.deltaPitch),
    })
  })

  it('prepares one ordered replacement per Note with a shared delta', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNotesCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id, fixture.records.nonLoopHarmonyNote.id],
      deltaTick: parseTickDelta(240),
      deltaPitch: parseMidiPitchDelta(2),
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    expect(plan.forward).toHaveLength(2)
    expect(plan.forward).toEqual([
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: command.sourceId,
        before: fixture.records.nonLoopNote,
        after: {
          ...fixture.records.nonLoopNote,
          startTick: parseTick(480),
          pitch: parseMidiPitch(62),
        },
      },
      {
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: command.sourceId,
        before: fixture.records.nonLoopHarmonyNote,
        after: {
          ...fixture.records.nonLoopHarmonyNote,
          startTick: parseTick(960),
          pitch: parseMidiPitch(66),
        },
      },
    ])
  })

  it('rejects the whole Selection when one moved Note crosses the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNotesCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.nonLoopSource.id,
      noteIds: [fixture.records.nonLoopNote.id, fixture.records.nonLoopHarmonyNote.id],
      deltaTick: parseTickDelta(961),
      deltaPitch: parseMidiPitchDelta(0),
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
    expect(error.noteId).toBe(fixture.records.nonLoopHarmonyNote.id)
    expect(store.getMidiNote(command.sourceId, fixture.records.nonLoopNote.id)).toBe(
      fixture.records.nonLoopNote,
    )
    expect(store.getMidiNote(command.sourceId, fixture.records.nonLoopHarmonyNote.id)).toBe(
      fixture.records.nonLoopHarmonyNote,
    )
  })

  it('returns no-change for an unchanged absolute target without creating a plan', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
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
      { deltaTick: parseTickDelta(1_201) },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
    expect(error.noteEndTick).toBe(1_921)
    expect(error.sourceLengthTick).toBe(fixture.records.nonLoopSource.lengthTick)
  })

  it('rejects a shared Pitch delta that moves any Note outside MIDI 0–127', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      { deltaPitch: parseMidiPitchDelta(68) },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-pitch-out-of-range')
    expect(error.noteId).toBe(fixture.records.nonLoopNote.id)
    expect(error.notePitch).toBe(128)
  })

  it('applies the replacement and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteIds[0]!)).toBe(
      fixture.records.nonLoopNote,
    )
  })
})

describe('ResizeNoteCommand', () => {
  it('prepares one NOTE.REPLACE while preserving identity and non-resize fields', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createResizeCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(mutation?.type).toBe(PROJECT_MUTATION_TYPE.NOTE.REPLACE)
    if (mutation?.type !== PROJECT_MUTATION_TYPE.NOTE.REPLACE) {
      throw new Error('Expected NOTE.REPLACE')
    }
    expect(mutation.before).toBe(fixture.records.nonLoopNote)
    expect(mutation.after).toEqual({
      ...fixture.records.nonLoopNote,
      startTick: command.startTick,
      durationTick: command.durationTick,
    })
    expect(plan.inverse[0]).toEqual({
      type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
      sourceId: command.sourceId,
      before: mutation.after,
      after: mutation.before,
    })
  })

  it('returns no-change when both target geometry facts already match', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const before = fixture.records.nonLoopNote
    const command = createResizeCommand(store, fixture.records.nonLoopSource.id, before.id, {
      startTick: before.startTick,
      durationTick: before.durationTick,
    })

    expect(prepareProjectCommand(store, command)).toEqual({
      status: 'no-change',
      reason: 'already-at-target',
      baseRevision: store.modelRevision,
    })
    expect(store.modelRevision).toBe(0)
  })

  it('rejects a stale unchanged target before returning no-change', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const before = fixture.records.nonLoopNote
    const command = createResizeCommand(store, fixture.records.nonLoopSource.id, before.id, {
      baseRevision: 1 as ModelRevision,
      startTick: before.startTick,
      durationTick: before.durationTick,
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('base-revision-mismatch')
    expect(error.baseRevision).toBe(command.baseRevision)
    expect(error.currentRevision).toBe(store.modelRevision)
    expect(error.noteId).toBe(command.noteId)
  })

  it('rejects missing targets and a target geometry beyond the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingNoteId = parseNoteId('note-resize-missing')
    const missingCommand = createResizeCommand(
      store,
      fixture.records.nonLoopSource.id,
      missingNoteId,
    )
    const missingError = captureCommandError(() => prepareProjectCommand(store, missingCommand))

    expect(missingError.code).toBe('midi-note-not-found')
    expect(missingError.noteId).toBe(missingNoteId)

    const outOfRangeCommand = createResizeCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        startTick: parseTick(1_680),
        durationTick: parseTick(241),
      },
    )
    const rangeError = captureCommandError(() => prepareProjectCommand(store, outOfRangeCommand))

    expect(rangeError.code).toBe('note-out-of-source-range')
    expect(rangeError.noteEndTick).toBe(1_921)
    expect(rangeError.sourceLengthTick).toBe(fixture.records.nonLoopSource.lengthTick)
  })

  it('applies the replacement and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createResizeCommand(
      store,
      fixture.records.nonLoopSource.id,
      fixture.records.nonLoopNote.id,
      {
        startTick: parseTick(1_680),
        durationTick: parseTick(240),
      },
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(fixture.records.nonLoopNote)
  })
})
