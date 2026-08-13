import { expectTypeOf, it } from 'vitest'

import type { AudibleMidiProjectPlan } from '#internal/index'

it('exports the browser-independent Project Plan type for Audio Web consumers', () => {
  expectTypeOf<AudibleMidiProjectPlan>().toHaveProperty('midiNoteSpans')
})
