import { expect, it } from 'vitest'

import {
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
})
