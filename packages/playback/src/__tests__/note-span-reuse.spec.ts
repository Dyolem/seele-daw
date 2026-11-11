// A Clip whose Notes changed keeps the spans of its other Notes. These edit sequences check that
// the plan still equals one compiled from scratch, and that the untouched spans are the same objects.
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  ProjectCommandError,
  createAddInstrumentTrackCollectionCommand,
  createAddNoteCommand,
  createInitialProjectSession,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTickDelta,
  parseTimeSignatureEventId,
  type InstrumentTrackCollectionEntry,
  type MidiSourceId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { compileAudibleMidiProject } from '#internal/compiler/audible-midi-compiler'
import type { AudibleMidiProjectPlan } from '#internal/compiler/audible-midi-plan'
import {
  createSampleInstrumentDeviceDescriptor,
  parseSoundbankId,
} from '#internal/device/sample-instrument-device'
import { createAudibleMidiReconciliationPlan } from '#internal/reconciliation/audible-midi-reconciliation'

const SOURCE_LENGTH_TICK = 48_000
const NOTES_PER_TRACK = 200

function importedTrack(index: number): InstrumentTrackCollectionEntry {
  const device = createSampleInstrumentDeviceDescriptor(
    parseDeviceId(`device-reuse-${index}`),
    parseSoundbankId('studio-grand'),
  )
  const track = createInstrumentTrackRecord({
    id: `track-reuse-${index}` as InstrumentTrackCollectionEntry['track']['id'],
    name: `Track ${index}`,
    color: null,
    channel: { gain: parseLinearGain(1), pan: parseBipolarValue(0), muted: false, soloed: false },
    midiEffectIds: [],
    instrumentDeviceId: device.id,
    audioEffectIds: [],
  })
  const source = createMidiSourceRecord({
    id: parseMidiSourceId(`source-reuse-${index}`),
    lengthTick: parseTick(SOURCE_LENGTH_TICK),
  })
  const clip = createMidiClipRecord({
    id: parseClipId(`clip-reuse-${index}`),
    trackId: track.id,
    name: track.name,
    color: null,
    muted: false,
    startTick: parseTick(index * 960),
    spanTick: parseTick(SOURCE_LENGTH_TICK - 1_920),
    sourceId: source.id,
    sourceOffsetTick: parseTick(960),
    loop: null,
  })
  const notes = Array.from({ length: NOTES_PER_TRACK }, (_, noteIndex) =>
    createMidiNoteRecord({
      id: parseNoteId(`note-reuse-${index}-${noteIndex}`),
      startTick: parseTick(noteIndex * 210),
      durationTick: parseTick(240 + (noteIndex % 5) * 60),
      pitch: parseMidiPitch(40 + (noteIndex % 30)),
      velocity: parseMidiVelocity(100),
      channel: parseMidiChannel(noteIndex % 2),
    }),
  )
  const sustainPedalEvents = [0, 1].flatMap((channel) =>
    Array.from({ length: 20 }, (_, pedalIndex) =>
      createMidiSustainPedalEventRecord({
        id: parseMidiSustainPedalEventId(`pedal-reuse-${index}-${channel}-${pedalIndex}`),
        tick: parseTick(pedalIndex * 2_000 + channel * 300),
        value: parseMidiControlValue(pedalIndex % 2 === 0 ? 127 : 0),
        channel: parseMidiChannel(channel),
      }),
    ),
  )
  return { track, instrumentDevice: device, clips: [{ clip, source, notes, sustainPedalEvents }] }
}

function createSession() {
  const session = createInitialProjectSession({
    projectId: parseProjectId('project-note-span-reuse'),
    projectName: 'Note span reuse',
    tempoEventId: parseTempoEventId('tempo-reuse'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-reuse'),
  })
  const result = session.execute(
    createAddInstrumentTrackCollectionCommand({
      baseRevision: session.modelRevision,
      entries: [importedTrack(0), importedTrack(1)],
      insertAt: 0,
    }),
  )
  if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) throw new Error('No import')
  return session
}

/** Fresh objects share nothing with earlier compiles, so this is the plan compiled from scratch. */
function compileFromScratch(session: ReturnType<typeof createSession>): AudibleMidiProjectPlan {
  return compileAudibleMidiProject(structuredClone(session.getSnapshot()))
}

describe('note span reuse inside a changed Clip', () => {
  it('keeps every other span of the Clip when one Note moves', () => {
    const session = createSession()
    const before = compileAudibleMidiProject(session.getSnapshot())
    const sourceId = parseMidiSourceId('source-reuse-0')
    const noteId = parseNoteId('note-reuse-0-100')

    session.execute(
      createMoveNotesCommand({
        baseRevision: session.modelRevision,
        sourceId,
        noteIds: [noteId],
        deltaTick: parseTickDelta(30),
        deltaPitch: parseMidiPitchDelta(0),
      }),
    )
    const after = compileAudibleMidiProject(session.getSnapshot())
    const previousSpans = new Set(before.clipSpans.get(parseClipId('clip-reuse-0')))
    const spans = after.clipSpans.get(parseClipId('clip-reuse-0'))!

    expect(spans.filter((span) => !previousSpans.has(span)).map((span) => span.noteId)).toEqual([
      noteId,
    ])
    expect(after).toEqual(compileFromScratch(session))
  })

  it('compiles and reconciles as from scratch after every edit, Undo and Redo', () => {
    const session = createSession()
    const sourceIds: MidiSourceId[] = [
      parseMidiSourceId('source-reuse-0'),
      parseMidiSourceId('source-reuse-1'),
    ]
    let seed = 11
    const next = (count: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return seed % count
    }
    let created = 0
    let previous = {
      plan: compileAudibleMidiProject(session.getSnapshot()),
      scratch: compileFromScratch(session),
    }

    for (let step = 0; step < 300; step += 1) {
      const sourceId = sourceIds[next(sourceIds.length)]!
      const notes = session.getSnapshot().midiNotes[sourceId] ?? []
      const note = notes.length === 0 ? undefined : notes[next(notes.length)]
      const base = { baseRevision: session.modelRevision, sourceId }
      try {
        switch (next(7)) {
          case 0:
            session.execute(
              createAddNoteCommand({
                ...base,
                noteId: parseNoteId(`note-reuse-added-${(created += 1)}`),
                startTick: parseTick(next(SOURCE_LENGTH_TICK / 60 - 8) * 60),
                durationTick: parseTick(60 * (1 + next(8))),
                pitch: parseMidiPitch(40 + next(30)),
                velocity: parseMidiVelocity(1 + next(127)),
                channel: parseMidiChannel(next(2)),
              }),
            )
            break
          case 1:
            if (note === undefined) break
            session.execute(
              createMoveNotesCommand({
                ...base,
                noteIds: [note.id],
                deltaTick: parseTickDelta((next(9) - 4) * 120),
                deltaPitch: parseMidiPitchDelta(next(3) - 1),
              }),
            )
            break
          case 2:
            if (note === undefined) break
            session.execute(
              createResizeNoteCommand({
                ...base,
                noteId: note.id,
                startTick: note.startTick,
                durationTick: parseTick(60 * (1 + next(12))),
              }),
            )
            break
          case 3:
            if (note !== undefined) {
              session.execute(createRemoveNotesCommand({ ...base, noteIds: [note.id] }))
            }
            break
          case 4:
            session.undo()
            break
          case 5:
            session.redo()
            break
          default:
            // Several edits may land between two compiles.
            continue
        }
      } catch (error) {
        if (!(error instanceof ProjectCommandError)) throw error
      }

      if (next(2) !== 0) continue
      const plan = compileAudibleMidiProject(session.getSnapshot())
      const scratch = compileFromScratch(session)
      expect(plan).toEqual(scratch)

      // Plans compiled from scratch share no spans, so their reconciliation matches every span
      // by key; the reused plans must report exactly the same changes.
      const reused = createAudibleMidiReconciliationPlan({
        commits: [],
        nextPlan: plan,
        previousPlan: previous.plan,
      })
      const fromScratch = createAudibleMidiReconciliationPlan({
        commits: [],
        nextPlan: scratch,
        previousPlan: previous.scratch,
      })
      expect(reused.occurrenceChanges).toEqual(fromScratch.occurrenceChanges)
      expect(reused.invalidatedPreviousOccurrenceKeys).toEqual(
        fromScratch.invalidatedPreviousOccurrenceKeys,
      )
      previous = { plan, scratch }
    }
  })
})
