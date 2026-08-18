import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  MidiFileCodecError,
  StandardMidiFileEncoder,
  ToneJsMidiFileDecoder,
  type MidiFileDecoder,
  type MidiFileDocument,
  type MidiFileEncoder,
} from '#internal/index'

describe('@seele-daw/midi-file public API', () => {
  it('exposes replaceable codec contracts and the bundled adapter', () => {
    expectTypeOf<ToneJsMidiFileDecoder>().toMatchTypeOf<MidiFileDecoder>()
    expectTypeOf<StandardMidiFileEncoder>().toMatchTypeOf<MidiFileEncoder>()
    expectTypeOf<MidiFileDecoder['decode']>().returns.toEqualTypeOf<MidiFileDocument>()
    expect(ToneJsMidiFileDecoder).toBeTypeOf('function')
    expect(StandardMidiFileEncoder).toBeTypeOf('function')
    expect(MidiFileCodecError).toBeTypeOf('function')
  })
})
