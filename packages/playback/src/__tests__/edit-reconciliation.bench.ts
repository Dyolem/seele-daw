// Run with `pnpm --filter @seele-daw/playback bench`. What playback does with every commit while it
// plays: compile the whole plan again, then compare it with the previous one.
import {
  createAddInstrumentTrackCollectionCommand,
  createInitialProjectSession,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMoveNotesCommand,
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
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  parseTrackId,
  PROJECT_COMMAND_EXECUTION_STATUS,
  type InstrumentTrackCollectionEntry,
  type ProjectCommit,
} from '@seele-daw/project-core'
import { bench, describe } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import { createAudibleMidiReconciliationPlan } from '#internal/reconciliation/audible-midi-reconciliation'
import { createStudioGrandDeviceDescriptor } from '#internal/studio-grand-device'

const NOTE_SPACING_TICK = 120

function importedTrack(index: number, noteCount: number): InstrumentTrackCollectionEntry {
  const device = createStudioGrandDeviceDescriptor(parseDeviceId(`device-${index}`))
  const track = createInstrumentTrackRecord({
    id: parseTrackId(`track-${index}`),
    name: `Track ${index}`,
    color: null,
    channel: { gain: parseLinearGain(1), pan: parseBipolarValue(0), muted: false, soloed: false },
    midiEffectIds: [],
    instrumentDeviceId: device.id,
    audioEffectIds: [],
  })
  const lengthTick = parseTick((noteCount + 2) * NOTE_SPACING_TICK)
  const source = createMidiSourceRecord({ id: parseMidiSourceId(`source-${index}`), lengthTick })
  const clip = createMidiClipRecord({
    id: parseClipId(`clip-${index}`),
    trackId: track.id,
    name: track.name,
    color: null,
    muted: false,
    startTick: parseTick(0),
    spanTick: lengthTick,
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    loop: null,
  })
  const notes = Array.from({ length: noteCount }, (_, noteIndex) =>
    createMidiNoteRecord({
      id: parseNoteId(`note-${index}-${noteIndex}`),
      startTick: parseTick(noteIndex * NOTE_SPACING_TICK),
      durationTick: parseTick(NOTE_SPACING_TICK * 2),
      pitch: parseMidiPitch(36 + (noteIndex % 48)),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(0),
    }),
  )
  return {
    track,
    instrumentDevice: device,
    clips: [{ clip, source, notes, sustainPedalEvents: [] }],
  }
}

function requireCommit(
  result: ReturnType<ReturnType<typeof createInitialProjectSession>['execute']>,
): ProjectCommit {
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED)
    throw new Error('Expected a commit')
  return result.commit
}

for (const [trackCount, notesPerTrack] of [
  [16, 5_000],
  [1, 80_000],
] as const) {
  describe(`${trackCount} × ${notesPerTrack} notes`, () => {
    const session = createInitialProjectSession({
      projectId: parseProjectId('playback-bench'),
      projectName: 'Playback bench',
      tempoEventId: parseTempoEventId('tempo-playback-bench'),
      timeSignatureEventId: parseTimeSignatureEventId('meter-playback-bench'),
    })
    requireCommit(
      session.execute(
        createAddInstrumentTrackCollectionCommand({
          baseRevision: session.modelRevision,
          entries: Array.from({ length: trackCount }, (_, index) =>
            importedTrack(index, notesPerTrack),
          ),
          insertAt: 0,
        }),
      ),
    )
    let previousPlan = compileAudibleMidiProject(session.getSnapshot())
    let deltaTick = 1

    bench('compile the whole plan', () => {
      compileAudibleMidiProject(session.getSnapshot())
    })

    const settledPlan = compileAudibleMidiProject(session.getSnapshot())
    const movedCommit = requireCommit(
      session.execute(
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: parseMidiSourceId('source-0'),
          noteIds: [parseNoteId('note-0-0')],
          deltaTick: parseTickDelta(1),
          deltaPitch: parseMidiPitchDelta(0),
        }),
      ),
    )
    const movedPlan = compileAudibleMidiProject(session.getSnapshot())
    previousPlan = movedPlan
    deltaTick = -1

    bench('reconcile one moved note', () => {
      createAudibleMidiReconciliationPlan({
        commits: [movedCommit],
        nextPlan: movedPlan,
        previousPlan: settledPlan,
      })
    })

    let commitOnlyDeltaTick = 1
    bench('move one note: commit only', () => {
      requireCommit(
        session.execute(
          createMoveNotesCommand({
            baseRevision: session.modelRevision,
            sourceId: parseMidiSourceId('source-0'),
            noteIds: [parseNoteId('note-0-1')],
            deltaTick: parseTickDelta(commitOnlyDeltaTick),
            deltaPitch: parseMidiPitchDelta(0),
          }),
        ),
      )
      commitOnlyDeltaTick = -commitOnlyDeltaTick
    })

    bench('move one note: compile and reconcile', () => {
      const commit = requireCommit(
        session.execute(
          createMoveNotesCommand({
            baseRevision: session.modelRevision,
            sourceId: parseMidiSourceId('source-0'),
            noteIds: [parseNoteId('note-0-0')],
            deltaTick: parseTickDelta(deltaTick),
            deltaPitch: parseMidiPitchDelta(0),
          }),
        ),
      )
      deltaTick = -deltaTick
      const nextPlan = compileAudibleMidiProject(session.getSnapshot())
      createAudibleMidiReconciliationPlan({ commits: [commit], nextPlan, previousPlan })
      previousPlan = nextPlan
    })
  })
}
