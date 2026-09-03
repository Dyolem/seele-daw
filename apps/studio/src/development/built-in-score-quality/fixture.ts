import {
  StandardMidiFileEncoder,
  ToneJsMidiFileDecoder,
  type MidiFileControlChange,
  type MidiFileDocument,
  type MidiFileNote,
  type MidiFileTrack,
} from '@seele-daw/midi-file'
import type { ProjectSnapshot } from '@seele-daw/project-core'
import {
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  compileAudibleMidiProject,
  createAudibleMidiSchedulerPlanner,
  createAudibleMidiTransport,
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  parseSoundbankId,
  type AudibleMidiProjectPlan,
  type ScheduledSampleVoicePlan,
  type SoundbankId,
} from '@seele-daw/playback'
import {
  createProjectMidiImportDraft,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiImportIdFactory,
} from '@seele-daw/project-midi'

import { createStudioMidiImportInstrumentDevice } from '@/workbench/instrument/midi-import-instrument-policy'

export const BUILT_IN_SCORE_QUALITY_FIXTURE_SCHEMA =
  'seele.built-in-multi-instrument-score-quality-fixture'
export const BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND = 6
export const BUILT_IN_SCORE_QUALITY_TAIL_WINDOW = Object.freeze({
  fromSecond: 5.5,
  toSecond: BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND,
})

export interface BuiltInScoreQualityRouteExpectation {
  readonly channel: number
  readonly gain: number
  readonly pan: number
  readonly programNumber: number
  readonly soundbankId: SoundbankId
}

export const BUILT_IN_SCORE_QUALITY_ROUTE_EXPECTATIONS = Object.freeze([
  Object.freeze({
    channel: 0,
    gain: 108 / 127,
    pan: 0,
    programNumber: 0,
    soundbankId: parseSoundbankId('studio-grand'),
  }),
  Object.freeze({
    channel: 1,
    gain: 80 / 127,
    pan: -0.5,
    programNumber: 48,
    soundbankId: parseSoundbankId('string-ensemble'),
  }),
  Object.freeze({
    channel: 2,
    gain: 76 / 127,
    pan: 32 / 63,
    programNumber: 56,
    soundbankId: parseSoundbankId('trumpet'),
  }),
  Object.freeze({
    channel: 3,
    gain: 70 / 127,
    pan: 16 / 63,
    programNumber: 73,
    soundbankId: parseSoundbankId('flute'),
  }),
  Object.freeze({
    channel: 4,
    gain: 88 / 127,
    pan: -0.25,
    programNumber: 32,
    soundbankId: parseSoundbankId('acoustic-bass'),
  }),
  Object.freeze({
    channel: 5,
    gain: 82 / 127,
    pan: 0,
    programNumber: 47,
    soundbankId: parseSoundbankId('timpani'),
  }),
  Object.freeze({
    channel: 9,
    gain: 96 / 127,
    pan: 0,
    programNumber: 0,
    soundbankId: parseSoundbankId('general-midi-percussion'),
  }),
] satisfies readonly BuiltInScoreQualityRouteExpectation[])

export const BUILT_IN_SCORE_QUALITY_PLACEHOLDER = Object.freeze({
  channel: 6,
  programNumber: 80,
})

export interface BuiltInScoreQualityPlaybackFixture {
  readonly decodedDocument: MidiFileDocument
  readonly encodedMidiBytes: Uint8Array
  readonly importDiagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly projectPlan: AudibleMidiProjectPlan
  readonly snapshot: ProjectSnapshot
  readonly voicePlans: readonly ScheduledSampleVoicePlan[]
}

function note(tick: number, durationTicks: number, pitch: number, velocity: number): MidiFileNote {
  return Object.freeze({ durationTicks, pitch, releaseVelocity: 0, tick, velocity })
}

function controlChange(tick: number, controller: number, value: number): MidiFileControlChange {
  return Object.freeze({ controller, tick, value })
}

function track(input: {
  readonly channel: number
  readonly controlChanges: readonly MidiFileControlChange[]
  readonly name: string
  readonly notes: readonly MidiFileNote[]
  readonly programNumber: number
}): MidiFileTrack {
  return Object.freeze({
    ...input,
    controlChanges: Object.freeze([...input.controlChanges]),
    endTick: 3_840,
    notes: Object.freeze([...input.notes]),
    pitchBends: Object.freeze([]),
  })
}

/** A small original score that can be committed, regenerated, downloaded, and decoded losslessly. */
export function createBuiltInScoreQualityMidiDocument(): MidiFileDocument {
  return Object.freeze({
    format: 1,
    keySignatures: Object.freeze([]),
    name: 'Seele MI5 Multi-Instrument Quality Score',
    ppq: 480,
    tempos: Object.freeze([Object.freeze({ bpm: 120, tick: 0 })]),
    textEvents: Object.freeze([]),
    timeSignatures: Object.freeze([Object.freeze({ denominator: 4, numerator: 4, tick: 0 })]),
    tracks: Object.freeze([
      track({
        channel: 0,
        controlChanges: [
          controlChange(0, 7, 108),
          controlChange(0, 10, 64),
          controlChange(720, 64, 127),
          controlChange(1_680, 64, 0),
        ],
        name: 'Piano · CC64',
        notes: [
          note(96, 864, 60, 104),
          note(96, 864, 64, 92),
          note(96, 864, 67, 96),
          note(1_920, 480, 62, 96),
          note(1_920, 480, 65, 88),
          note(1_920, 480, 69, 92),
        ],
        programNumber: 0,
      }),
      track({
        channel: 1,
        controlChanges: [controlChange(0, 7, 80), controlChange(0, 10, 32)],
        name: 'String Ensemble · Continuous Loop',
        notes: [note(96, 3_264, 48, 78), note(96, 3_264, 55, 74), note(96, 3_264, 60, 70)],
        programNumber: 48,
      }),
      track({
        channel: 2,
        controlChanges: [controlChange(0, 7, 76), controlChange(0, 10, 96)],
        name: 'Trumpet · Continuous Loop',
        notes: [note(480, 2_400, 67, 88)],
        programNumber: 56,
      }),
      track({
        channel: 3,
        controlChanges: [controlChange(0, 7, 70), controlChange(0, 10, 80)],
        name: 'Flute · Continuous Loop',
        notes: [note(960, 1_920, 76, 82)],
        programNumber: 73,
      }),
      track({
        channel: 4,
        controlChanges: [controlChange(0, 7, 88), controlChange(0, 10, 48)],
        name: 'Acoustic Bass',
        notes: [
          note(96, 720, 36, 94),
          note(960, 720, 43, 88),
          note(1_920, 720, 41, 90),
          note(2_880, 480, 36, 84),
        ],
        programNumber: 32,
      }),
      track({
        channel: 5,
        controlChanges: [controlChange(0, 7, 82), controlChange(0, 10, 64)],
        name: 'Timpani · Gated',
        notes: [note(480, 240, 48, 106), note(1_440, 240, 50, 100), note(2_400, 240, 43, 104)],
        programNumber: 47,
      }),
      track({
        channel: 9,
        controlChanges: [
          controlChange(0, 7, 96),
          controlChange(0, 10, 64),
          controlChange(0, 64, 127),
          controlChange(1_440, 64, 0),
        ],
        name: 'General MIDI Percussion · One-shot and Hi-hat Choke',
        notes: [
          note(96, 60, 36, 112),
          note(240, 60, 42, 88),
          note(480, 60, 38, 104),
          note(720, 60, 46, 92),
          note(960, 60, 42, 96),
          note(1_920, 60, 36, 106),
          note(2_400, 60, 38, 100),
        ],
        programNumber: 0,
      }),
      track({
        channel: BUILT_IN_SCORE_QUALITY_PLACEHOLDER.channel,
        controlChanges: [],
        name: 'Unsupported Program · Silent Placeholder',
        notes: [note(96, 960, 72, 100)],
        programNumber: BUILT_IN_SCORE_QUALITY_PLACEHOLDER.programNumber,
      }),
    ]),
  })
}

export function createBuiltInScoreQualityMidiBytes(): Uint8Array {
  return new StandardMidiFileEncoder().encode(createBuiltInScoreQualityMidiDocument())
}

const createFixtureId: ProjectMidiImportIdFactory = ({ kind, ordinal }) =>
  `mi5-score-${kind}-${ordinal}`

/** Runs the same MIDI decode, Project import, Compiler, Transport, and Scheduler path as Studio. */
export function createBuiltInScoreQualityPlaybackFixture(): BuiltInScoreQualityPlaybackFixture {
  const encodedMidiBytes = createBuiltInScoreQualityMidiBytes()
  const decodedDocument = new ToneJsMidiFileDecoder().decode(encodedMidiBytes)
  const draft = createProjectMidiImportDraft({
    createId: createFixtureId,
    createInstrumentDevice: createStudioMidiImportInstrumentDevice,
    createTrackColor: () => null,
    document: decodedDocument,
  })
  const snapshot = draft.session.getSnapshot()
  const projectPlan = compileAudibleMidiProject(snapshot)
  const transport = createAudibleMidiTransport(projectPlan, {
    now: () => parsePlaybackClockSecond(0),
  })
  const scheduler = createAudibleMidiSchedulerPlanner(projectPlan, {
    lookAheadHorizonSecond: parsePlaybackClockDurationSecond(
      BUILT_IN_SCORE_QUALITY_RENDER_DURATION_SECOND,
    ),
    wakeCadenceSecond: parsePlaybackClockDurationSecond(0.05),
  })
  transport.play()
  const batch = scheduler.planNextWindow(transport.getSnapshot())
  if (batch.outcome !== AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED) {
    throw new TypeError(`MI5 score fixture was not scheduled: ${batch.outcome}`)
  }

  return Object.freeze({
    decodedDocument,
    encodedMidiBytes,
    importDiagnostics: draft.diagnostics,
    projectPlan,
    snapshot,
    voicePlans: batch.voicePlans,
  })
}
