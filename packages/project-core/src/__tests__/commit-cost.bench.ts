// Run with `pnpm --filter @seele-daw/project-core bench`. Backs ADR-008: one small commit on a
// large project costs what it writes, while a full invariant validation costs the whole project.
import {
  DEVICE_DEFINITION_VERSION_MIN,
  createAddInstrumentTrackCollectionCommand,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMoveNotesCommand,
  parseBipolarValue,
  parseClipId,
  parseDeviceId,
  parseDeviceTypeId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiPitchDelta,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTickDelta,
  parseTrackId,
  type InstrumentTrackCollectionEntry,
} from '#internal/index'
import { bench, describe } from 'vitest'

import { assertModelInvariants } from '#internal/model/invariant-validator'
import { createFixtureProjectSession } from './support/project-session-test-support'

const NOTE_SPACING_TICK = 120

function importedTrack(index: number, noteCount: number): InstrumentTrackCollectionEntry {
  const device = createDeviceDescriptor({
    id: parseDeviceId(`device-${index}`),
    typeId: parseDeviceTypeId('seele.sample-instrument'),
    definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
    enabled: true,
    parameters: {},
    opaqueState: { soundbankId: 'studio-grand' },
  })
  const track = createInstrumentTrackRecord({
    id: parseTrackId(`track-${index}`),
    name: `Track ${index}`,
    color: null,
    channel: { gain: parseLinearGain(1), pan: parseBipolarValue(0), muted: false, soloed: false },
    instrumentDeviceId: device.id,
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

/** Imports the tracks the way a Standard MIDI File import does: one collection Command. */
function createImportedProject(trackCount: number, notesPerTrack: number) {
  const { session, store } = createFixtureProjectSession()
  session.execute(
    createAddInstrumentTrackCollectionCommand({
      baseRevision: session.modelRevision,
      entries: Array.from({ length: trackCount }, (_, index) =>
        importedTrack(index, notesPerTrack),
      ),
      insertAt: 0,
    }),
  )
  return { session, store }
}

for (const [trackCount, notesPerTrack] of [
  [16, 5_000],
  [1, 80_000],
] as const) {
  describe(`${trackCount} × ${notesPerTrack} notes`, () => {
    const { session, store } = createImportedProject(trackCount, notesPerTrack)
    const sourceId = parseMidiSourceId('source-0')
    const noteIds = [parseNoteId('note-0-0')]
    let deltaTick = 1

    bench('move one note', () => {
      session.execute(
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId,
          noteIds,
          deltaTick: parseTickDelta(deltaTick),
          deltaPitch: parseMidiPitchDelta(0),
        }),
      )
      deltaTick = -deltaTick
    })

    let snapshotDeltaTick = 1
    bench('move one note, then read the Snapshot', () => {
      session.execute(
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId,
          noteIds: [parseNoteId('note-0-1')],
          deltaTick: parseTickDelta(snapshotDeltaTick),
          deltaPitch: parseMidiPitchDelta(0),
        }),
      )
      session.getSnapshot()
      snapshotDeltaTick = -snapshotDeltaTick
    })

    bench('validate the whole model', () => {
      assertModelInvariants(store)
    })
  })
}
