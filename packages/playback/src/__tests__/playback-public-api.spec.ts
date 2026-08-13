import { expectTypeOf, it } from 'vitest'

import type { AudibleMidiProjectPlan, ScheduledSampleVoicePlan } from '#internal/index'

it('exports the browser-independent plan types required by Audio Web consumers', () => {
  expectTypeOf<AudibleMidiProjectPlan>().toHaveProperty('midiNoteSpans')
  expectTypeOf<ScheduledSampleVoicePlan>().toHaveProperty('startPlaybackClockSecond')
})
