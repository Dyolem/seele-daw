import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  PROJECT_COMMAND_TYPE,
  createAddInstrumentTrackCommand,
  createAddMidiClipCommand,
  createAddNoteCommand,
  createChannelStripDescriptor,
  createInitialProjectSession,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createReplaceInstrumentDeviceCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseProjectColor,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  parseTrackId,
  type ProjectCommand,
  type ProjectCommit,
  type ProjectSession,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import {
  AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND,
  AUDIBLE_MIDI_RECONCILIATION_REASON,
  AUDIBLE_MIDI_RECONCILIATION_SCOPE,
  AUDIBLE_MIDI_TRACK_CHANGE_KIND,
  AudibleMidiReconciliationError,
  createAudibleMidiReconciliationPlan,
} from '#internal/reconciliation/audible-midi-reconciliation'
import {
  createSampleInstrumentDeviceDescriptor,
  parseSoundbankId,
} from '#internal/sample-instrument-device'

const TRACK_ID = parseTrackId('track-reconciliation')
const CLIP_ID = parseClipId('clip-reconciliation')
const SOURCE_ID = parseMidiSourceId('source-reconciliation')
const NOTE_ID = parseNoteId('note-reconciliation')

function executeCommitted(session: ProjectSession, command: ProjectCommand): ProjectCommit {
  const result = session.execute(command)
  expect(result.status).toBe(PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
    throw new Error('Fixture command unexpectedly produced no change')
  }
  return result.commit
}

function createFixture() {
  const session = createInitialProjectSession({
    projectId: parseProjectId('project-reconciliation'),
    projectName: 'Reconciliation',
    tempoEventId: parseTempoEventId('tempo-reconciliation'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-reconciliation'),
  })
  const originalDevice = createSampleInstrumentDeviceDescriptor(
    parseDeviceId('device-reconciliation-original'),
    parseSoundbankId('studio-grand'),
  )
  executeCommitted(
    session,
    createAddInstrumentTrackCommand({
      baseRevision: session.modelRevision,
      channel: createChannelStripDescriptor({
        gain: parseLinearGain(0.8),
        muted: false,
        pan: parseBipolarValue(0),
        soloed: false,
      }),
      color: parseProjectColor('#445566'),
      insertAt: 0,
      instrumentDevice: originalDevice,
      name: 'Track',
      trackId: TRACK_ID,
    }),
  )
  executeCommitted(
    session,
    createAddMidiClipCommand({
      baseRevision: session.modelRevision,
      clipId: CLIP_ID,
      color: null,
      loop: null,
      muted: false,
      name: 'Clip',
      sourceId: SOURCE_ID,
      sourceLengthTick: parseTick(1_920),
      sourceOffsetTick: parseTick(0),
      spanTick: parseTick(1_920),
      startTick: parseTick(0),
      trackId: TRACK_ID,
    }),
  )
  executeCommitted(
    session,
    createAddNoteCommand({
      baseRevision: session.modelRevision,
      channel: parseMidiChannel(0),
      durationTick: parseTick(960),
      noteId: NOTE_ID,
      pitch: parseMidiPitch(60),
      sourceId: SOURCE_ID,
      startTick: parseTick(240),
      velocity: parseMidiVelocity(100),
    }),
  )
  return { originalDevice, session }
}

describe('Audible MIDI reconciliation', () => {
  it('describes a moved occurrence as a selective invalidation with its command cause', () => {
    const { session } = createFixture()
    const previousPlan = compileAudibleMidiProject(session.getSnapshot())
    const commit = executeCommitted(
      session,
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        deltaPitch: parseMidiPitchDelta(2),
        deltaTick: parseTickDelta(120),
        noteIds: [NOTE_ID],
        sourceId: SOURCE_ID,
      }),
    )
    const nextPlan = compileAudibleMidiProject(session.getSnapshot())

    const plan = createAudibleMidiReconciliationPlan({
      commits: [commit],
      nextPlan,
      previousPlan,
    })

    expect(plan.scope).toBe(AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE)
    expect(plan.reasons).toEqual([])
    expect(plan.occurrenceChanges).toHaveLength(1)
    expect(plan.occurrenceChanges[0]).toMatchObject({
      changedFields: ['startTick', 'endTick', 'pitch'],
      commandTypes: [PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE],
      kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.UPDATED,
    })
    expect(plan.invalidatedPreviousOccurrenceKeys).toEqual([
      previousPlan.midiNoteSpans[0]?.occurrenceKey,
    ])
    expect(plan.affectedTrackIds).toEqual([TRACK_ID])
  })

  it('keeps unchanged occurrences valid when a different Note is added', () => {
    const { session } = createFixture()
    const previousPlan = compileAudibleMidiProject(session.getSnapshot())
    const commit = executeCommitted(
      session,
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        channel: parseMidiChannel(0),
        durationTick: parseTick(240),
        noteId: parseNoteId('note-reconciliation-added'),
        pitch: parseMidiPitch(64),
        sourceId: SOURCE_ID,
        startTick: parseTick(1_200),
        velocity: parseMidiVelocity(90),
      }),
    )
    const nextPlan = compileAudibleMidiProject(session.getSnapshot())

    const plan = createAudibleMidiReconciliationPlan({
      commits: [commit],
      nextPlan,
      previousPlan,
    })

    expect(plan.occurrenceChanges).toHaveLength(1)
    expect(plan.occurrenceChanges[0]).toMatchObject({
      commandTypes: [PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD],
      kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.ADDED,
    })
    expect(plan.invalidatedPreviousOccurrenceKeys).toEqual([])
    expect(plan.unchangedOccurrenceKeys).toEqual([previousPlan.midiNoteSpans[0]?.occurrenceKey])
  })

  it('invalidates a whole Track route when its Instrument is replaced', () => {
    const { session } = createFixture()
    const previousPlan = compileAudibleMidiProject(session.getSnapshot())
    const replacement = createSampleInstrumentDeviceDescriptor(
      parseDeviceId('device-reconciliation-original'),
      parseSoundbankId('12-string-guitar-v2-v4'),
    )
    const commit = executeCommitted(
      session,
      createReplaceInstrumentDeviceCommand({
        baseRevision: session.modelRevision,
        instrumentDevice: replacement,
        trackId: TRACK_ID,
      }),
    )
    const nextPlan = compileAudibleMidiProject(session.getSnapshot())

    const plan = createAudibleMidiReconciliationPlan({
      commits: [commit],
      nextPlan,
      previousPlan,
    })

    expect(plan.trackChanges).toEqual([
      expect.objectContaining({
        changedFields: ['soundbankId'],
        commandTypes: [PROJECT_COMMAND_TYPE.INSTRUMENT_DEVICE.REPLACE],
        kind: AUDIBLE_MIDI_TRACK_CHANGE_KIND.UPDATED,
        trackId: TRACK_ID,
      }),
    ])
    expect(plan.invalidatedPreviousOccurrenceKeys).toEqual([
      previousPlan.midiNoteSpans[0]?.occurrenceKey,
    ])
  })

  it('requires a global reset for a missing Commit or an unplayable target Plan', () => {
    const { session } = createFixture()
    const previousPlan = compileAudibleMidiProject(session.getSnapshot())
    const commit = executeCommitted(
      session,
      createRemoveNotesCommand({
        baseRevision: session.modelRevision,
        noteIds: [NOTE_ID],
        sourceId: SOURCE_ID,
      }),
    )
    const nextPlan = compileAudibleMidiProject(session.getSnapshot())

    const missingCommitPlan = createAudibleMidiReconciliationPlan({
      commits: [],
      nextPlan,
      previousPlan,
    })
    expect(missingCommitPlan.scope).toBe(AUDIBLE_MIDI_RECONCILIATION_SCOPE.GLOBAL_RESET)
    expect(missingCommitPlan.reasons).toEqual([
      AUDIBLE_MIDI_RECONCILIATION_REASON.REVISION_CHAIN_GAP,
      AUDIBLE_MIDI_RECONCILIATION_REASON.NEXT_PLAN_UNPLAYABLE,
    ])

    const continuousPlan = createAudibleMidiReconciliationPlan({
      commits: [commit],
      nextPlan,
      previousPlan,
    })
    expect(continuousPlan.reasons).toEqual([
      AUDIBLE_MIDI_RECONCILIATION_REASON.NEXT_PLAN_UNPLAYABLE,
    ])
  })

  it('rejects a non-forward Plan pair', () => {
    const { session } = createFixture()
    const plan = compileAudibleMidiProject(session.getSnapshot())

    expect(() =>
      createAudibleMidiReconciliationPlan({ commits: [], nextPlan: plan, previousPlan: plan }),
    ).toThrowError(AudibleMidiReconciliationError)
  })
})
