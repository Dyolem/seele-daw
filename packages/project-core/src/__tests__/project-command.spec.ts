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
  type AddMidiSustainPedalEventCommand,
  type AddTempoEventCommand,
  type AddInstrumentTrackCollectionCommand,
  type AddInstrumentTrackCommand,
  type AddMidiClipCommand,
  type AddMidiClipWithNoteCommand,
  type ExtendMidiClipWithNoteCommand,
  type ModelRevision,
  type MoveNotesCommand,
  type MoveMidiSustainPedalEventsCommand,
  type MoveTempoEventCommand,
  type ProjectCommand,
  type RemoveNotesCommand,
  type RemoveMidiSustainPedalEventsCommand,
  type RemoveTempoEventCommand,
  type ReplaceInstrumentDeviceCommand,
  type ReplaceMidiSustainPedalEventValueCommand,
  type ReplaceTempoEventBpmCommand,
  type ResizeNoteCommand,
} from '#internal/index'
import { createCompleteProjectFixture } from './support/complete-project-fixture'
import { requireReadyProjectCommandPlan } from './support/project-command-test-support'
import { prepareProjectCommand } from '#internal/commands/preparation/project-command-preparer'
import { ModelStore } from '#internal/model/model-store'
import { MutationApplier } from '#internal/mutation/mutation-applier'
import { createMutationPlan, type MutationPlan } from '#internal/mutation/mutation-plan'

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
    const add = createAddCommand(store, fixture.records.verseSource.id)
    const move = createMoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )
    const remove = createRemoveNotesCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.verseSource.id,
      noteIds: [fixture.records.verseNote.id, fixture.records.verseHarmonyNote.id],
    })
    const resize = createResizeCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )

    expect(add).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.verseSource.id,
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
      sourceId: fixture.records.verseSource.id,
      noteIds: [fixture.records.verseNote.id, fixture.records.verseHarmonyNote.id],
    })
    expect(Object.isFrozen(remove.noteIds)).toBe(true)
    expect(resize).toEqual({
      type: PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
      baseRevision: store.modelRevision,
      sourceId: fixture.records.verseSource.id,
      noteId: fixture.records.verseNote.id,
      startTick: parseTick(120),
      durationTick: parseTick(600),
    })
    expectTypeOf(add).toEqualTypeOf<AddNoteCommand>()
    expectTypeOf(move).toEqualTypeOf<MoveNotesCommand>()
    expectTypeOf(remove).toEqualTypeOf<RemoveNotesCommand>()
    expectTypeOf(resize).toEqualTypeOf<ResizeNoteCommand>()
    expectTypeOf<ProjectCommand>().toEqualTypeOf<
      | AddInstrumentTrackCollectionCommand
      | AddInstrumentTrackCommand
      | AddMidiClipCommand
      | AddMidiClipWithNoteCommand
      | AddNoteCommand
      | AddMidiSustainPedalEventCommand
      | AddTempoEventCommand
      | ExtendMidiClipWithNoteCommand
      | MoveNotesCommand
      | MoveMidiSustainPedalEventsCommand
      | MoveTempoEventCommand
      | RemoveNotesCommand
      | RemoveMidiSustainPedalEventsCommand
      | RemoveTempoEventCommand
      | ReplaceInstrumentDeviceCommand
      | ReplaceMidiSustainPedalEventValueCommand
      | ReplaceTempoEventBpmCommand
      | ResizeNoteCommand
    >()
  })

  it('rejects empty or duplicate MIDI Note collection targets', () => {
    const fixture = createCompleteProjectFixture()
    const input = {
      baseRevision: 0 as ModelRevision,
      sourceId: fixture.records.verseSource.id,
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
        noteIds: [fixture.records.verseNote.id, fixture.records.verseNote.id],
      }),
    ).toThrowError(
      expect.objectContaining<Partial<ProjectCommandError>>({
        code: 'duplicate-note-id',
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
          sourceId: fixture.records.verseSource.id,
          noteIds: [fixture.records.verseNote.id],
        }),
      )

      expect(error.code).toBe('invalid-base-revision')
    },
  )

  it('reuses domain factories for local Note value validation', () => {
    const fixture = createCompleteProjectFixture()

    expect(() =>
      createAddNoteCommand({
        baseRevision: 0 as ModelRevision,
        sourceId: fixture.records.verseSource.id,
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
        sourceId: fixture.records.verseSource.id,
        noteId: fixture.records.verseNote.id,
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
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      {
        baseRevision: staleRevision,
        deltaTick: parseTickDelta(0),
        deltaPitch: parseMidiPitchDelta(0),
      },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('base-revision-mismatch')
  })

  it('rejects a missing MidiSource', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingSourceId = parseMidiSourceId('source-command-missing')
    const command = createAddCommand(store, missingSourceId)
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-source-not-found')
  })
})

describe('AddNoteCommand', () => {
  it('prepares one NOTE.INSERT and accepts an end exactly at the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.verseSource.id, {
      startTick: parseTick(1_680),
      durationTick: parseTick(240),
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]

    expect(plan.baseRevision).toBe(store.modelRevision)
    expect(plan.forward).toHaveLength(1)
    expect(mutation).toEqual({
      op: 'insert',
      table: 'midiNotes',
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
    if (mutation?.op !== 'insert' || mutation.table !== 'midiNotes') {
      throw new Error('Expected NOTE.INSERT')
    }
    expect(plan.inverse[0]).toEqual({
      op: 'remove',
      table: 'midiNotes',
      sourceId: command.sourceId,
      before: mutation.after,
    })
  })

  it('rejects a Note whose end exceeds the strict Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.verseSource.id, {
      startTick: parseTick(1_681),
      durationTick: parseTick(240),
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
  })

  it('rejects a Note ID already used in another Source partition', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.chorusSource.id, {
      noteId: fixture.records.verseNote.id,
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-id-already-exists')
  })

  it('applies and inverses the prepared insertion as two atomic revisions', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createAddCommand(store, fixture.records.verseSource.id)
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
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]
    if (mutation?.op !== 'remove' || mutation.table !== 'midiNotes') {
      throw new Error('Expected NOTE.REMOVE')
    }
    expect(mutation.before).toBe(fixture.records.verseNote)
  })

  it('rejects a missing Note instead of treating removal as idempotent', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createSingleRemoveCommand(
      store,
      fixture.records.verseSource.id,
      parseNoteId('note-command-missing'),
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('midi-note-not-found')
  })

  it('applies the removal and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createSingleRemoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, fixture.records.verseNote.id)).toBe(
      fixture.records.verseNote,
    )
  })
})

describe('MoveNotesCommand', () => {
  it('prepares one NOTE.REPLACE while preserving identity and non-move fields', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      {
        deltaTick: parseTickDelta(960),
        deltaPitch: parseMidiPitchDelta(14),
      },
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]
    if (mutation?.op !== 'replace' || mutation.table !== 'midiNotes') {
      throw new Error('Expected NOTE.REPLACE')
    }
    expect(mutation.before).toBe(fixture.records.verseNote)
    expect(mutation.after).not.toBe(mutation.before)
    expect(mutation.after).toEqual({
      ...fixture.records.verseNote,
      startTick: parseTick(fixture.records.verseNote.startTick + command.deltaTick),
      pitch: parseMidiPitch(fixture.records.verseNote.pitch + command.deltaPitch),
    })
  })

  it('prepares one ordered replacement per Note with a shared delta', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveNotesCommand({
      baseRevision: store.modelRevision,
      sourceId: fixture.records.verseSource.id,
      noteIds: [fixture.records.verseNote.id, fixture.records.verseHarmonyNote.id],
      deltaTick: parseTickDelta(240),
      deltaPitch: parseMidiPitchDelta(2),
    })
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    expect(plan.forward).toHaveLength(2)
    expect(plan.forward).toEqual([
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: command.sourceId,
        before: fixture.records.verseNote,
        after: {
          ...fixture.records.verseNote,
          startTick: parseTick(480),
          pitch: parseMidiPitch(62),
        },
      },
      {
        op: 'replace',
        table: 'midiNotes',
        sourceId: command.sourceId,
        before: fixture.records.verseHarmonyNote,
        after: {
          ...fixture.records.verseHarmonyNote,
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
      sourceId: fixture.records.verseSource.id,
      noteIds: [fixture.records.verseNote.id, fixture.records.verseHarmonyNote.id],
      deltaTick: parseTickDelta(961),
      deltaPitch: parseMidiPitchDelta(0),
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
    expect(store.getMidiNote(command.sourceId, fixture.records.verseNote.id)).toBe(
      fixture.records.verseNote,
    )
    expect(store.getMidiNote(command.sourceId, fixture.records.verseHarmonyNote.id)).toBe(
      fixture.records.verseHarmonyNote,
    )
  })

  it('returns no-change for an unchanged absolute target without creating a plan', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
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
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      { deltaTick: parseTickDelta(1_201) },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-out-of-source-range')
  })

  it('rejects a shared Pitch delta that moves any Note outside MIDI 0–127', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      { deltaPitch: parseMidiPitchDelta(68) },
    )
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('note-pitch-out-of-range')
  })

  it('applies the replacement and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createMoveCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteIds[0]!)).toBe(fixture.records.verseNote)
  })
})

describe('ResizeNoteCommand', () => {
  it('prepares one NOTE.REPLACE while preserving identity and non-resize fields', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createResizeCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))
    const mutation = plan.forward[0]
    if (mutation?.op !== 'replace' || mutation.table !== 'midiNotes') {
      throw new Error('Expected NOTE.REPLACE')
    }
    expect(mutation.before).toBe(fixture.records.verseNote)
    expect(mutation.after).toEqual({
      ...fixture.records.verseNote,
      startTick: command.startTick,
      durationTick: command.durationTick,
    })
    expect(plan.inverse[0]).toEqual({
      op: 'replace',
      table: 'midiNotes',
      sourceId: command.sourceId,
      before: mutation.after,
      after: mutation.before,
    })
  })

  it('returns no-change when both target geometry facts already match', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const before = fixture.records.verseNote
    const command = createResizeCommand(store, fixture.records.verseSource.id, before.id, {
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
    const before = fixture.records.verseNote
    const command = createResizeCommand(store, fixture.records.verseSource.id, before.id, {
      baseRevision: 1 as ModelRevision,
      startTick: before.startTick,
      durationTick: before.durationTick,
    })
    const error = captureCommandError(() => prepareProjectCommand(store, command))

    expect(error.code).toBe('base-revision-mismatch')
  })

  it('rejects missing targets and a target geometry beyond the Source boundary', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const missingNoteId = parseNoteId('note-resize-missing')
    const missingCommand = createResizeCommand(store, fixture.records.verseSource.id, missingNoteId)
    const missingError = captureCommandError(() => prepareProjectCommand(store, missingCommand))

    expect(missingError.code).toBe('midi-note-not-found')

    const outOfRangeCommand = createResizeCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      {
        startTick: parseTick(1_680),
        durationTick: parseTick(241),
      },
    )
    const rangeError = captureCommandError(() => prepareProjectCommand(store, outOfRangeCommand))

    expect(rangeError.code).toBe('note-out-of-source-range')
  })

  it('applies the replacement and inverses it with the original Record reference', () => {
    const fixture = createCompleteProjectFixture()
    const store = new ModelStore(fixture.seed)
    const command = createResizeCommand(
      store,
      fixture.records.verseSource.id,
      fixture.records.verseNote.id,
      {
        startTick: parseTick(1_680),
        durationTick: parseTick(240),
      },
    )
    const plan = requireReadyProjectCommandPlan(prepareProjectCommand(store, command))

    applyAndInverse(store, plan)

    expect(store.modelRevision).toBe(2)
    expect(store.getMidiNote(command.sourceId, command.noteId)).toBe(fixture.records.verseNote)
  })
})
