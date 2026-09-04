import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  MIDI_SOURCE_CONTAINER_KIND,
  MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION,
  MidiFileCodecError,
  StandardMidiFileEncoder,
  ToneJsMidiFileDecoder,
  createStandardMidiFileSourceEnvelope,
  type MidiFileDecoder,
  type MidiFileDocument,
  type MidiFileEncoder,
  type MidiSourceEnvelope,
} from '#internal/index'

describe('@seele-daw/midi-file public API', () => {
  it('exposes replaceable codec contracts and the bundled adapter', () => {
    expectTypeOf<ToneJsMidiFileDecoder>().toMatchTypeOf<MidiFileDecoder>()
    expectTypeOf<StandardMidiFileEncoder>().toMatchTypeOf<MidiFileEncoder>()
    expectTypeOf<MidiFileDecoder['decode']>().returns.toEqualTypeOf<MidiFileDocument>()
    expectTypeOf(createStandardMidiFileSourceEnvelope(1)).toEqualTypeOf<MidiSourceEnvelope>()
    expect(MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION).toBe(1)
    expect(MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE).toBe('standard-midi-file')
    expect(ToneJsMidiFileDecoder).toBeTypeOf('function')
    expect(StandardMidiFileEncoder).toBeTypeOf('function')
    expect(MidiFileCodecError).toBeTypeOf('function')
  })
})
