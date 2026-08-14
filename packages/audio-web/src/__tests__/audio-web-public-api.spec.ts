import { expect, it } from 'vitest'

import {
  AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE,
  SampleInstrumentResourceCache,
  SampleInstrumentVoiceRuntime,
  WebAudioContextRuntime,
  prepareAudibleMidiSampleResources,
} from '#internal/index'

it('exports the Audio Web capabilities consumed by the Studio Composition Root', () => {
  expect(WebAudioContextRuntime).toBeTypeOf('function')
  expect(SampleInstrumentResourceCache).toBeTypeOf('function')
  expect(prepareAudibleMidiSampleResources).toBeTypeOf('function')
  expect(SampleInstrumentVoiceRuntime).toBeTypeOf('function')
  expect(AUDIBLE_MIDI_SAMPLE_PREPARATION_FAILURE_MODE).toEqual({
    FAIL_FAST: 'fail-fast',
    SKIP_UNAVAILABLE_INSTRUMENTS: 'skip-unavailable-instruments',
  })
})
