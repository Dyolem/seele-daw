import { expect, expectTypeOf, it } from 'vitest'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  AUDIBLE_MIDI_RECONCILIATION_SCOPE,
  AUDIBLE_MIDI_SCHEDULER_OUTCOME,
  AUDIBLE_MIDI_TRANSPORT_OUTCOME,
  compileAudibleMidiProject,
  createAudibleMidiSchedulerPlanner,
  createAudibleMidiReconciliationPlan,
  createAudibleMidiTransport,
  parsePlaybackClockDurationSecond,
  parsePlaybackClockSecond,
  type AudibleMidiProjectPlan,
  type PlaybackClock,
  type ScheduledSampleVoicePlan,
} from '#internal/index'

it('exports the browser-independent playback slice required by Studio and Audio Web', () => {
  expectTypeOf<AudibleMidiProjectPlan>().toHaveProperty('midiNoteSpans')
  expectTypeOf<ScheduledSampleVoicePlan>().toHaveProperty('startPlaybackClockSecond')
  expectTypeOf<PlaybackClock>().toHaveProperty('now')
  expectTypeOf<ReturnType<typeof createAudibleMidiTransport>>().toHaveProperty('handoffPlan')

  expect(compileAudibleMidiProject).toBeTypeOf('function')
  expect(createAudibleMidiTransport).toBeTypeOf('function')
  expect(createAudibleMidiSchedulerPlanner).toBeTypeOf('function')
  expect(createAudibleMidiReconciliationPlan).toBeTypeOf('function')
  expect(parsePlaybackClockSecond).toBeTypeOf('function')
  expect(parsePlaybackClockDurationSecond).toBeTypeOf('function')
  expect(AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE).toBe('playable')
  expect(AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE).toBe('selective')
  expect(AUDIBLE_MIDI_TRANSPORT_OUTCOME.PLAYED).toBe('played')
  expect(AUDIBLE_MIDI_TRANSPORT_OUTCOME.HANDED_OFF).toBe('handed-off')
  expect(AUDIBLE_MIDI_SCHEDULER_OUTCOME.PLANNED).toBe('planned')
})
