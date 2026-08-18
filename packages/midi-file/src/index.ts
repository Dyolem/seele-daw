/** Public API for parser-neutral Standard MIDI File decoding and encoding. */
export type { MidiFileDecoder, MidiFileEncoder } from './contract/midi-file-codec'
export type {
  MidiFileControlChange,
  MidiFileDocument,
  MidiFileFormat,
  MidiFileKeySignatureEvent,
  MidiFileKeySignatureScale,
  MidiFileNote,
  MidiFilePitchBend,
  MidiFileTempoEvent,
  MidiFileTextEvent,
  MidiFileTextEventKind,
  MidiFileTimeSignatureEvent,
  MidiFileTrack,
} from './contract/midi-file-document'
export { MidiFileCodecError } from './errors/midi-file-codec-error'
export type {
  MidiFileCodecErrorCode,
  MidiFileCodecErrorDetails,
  MidiFileCodecOperation,
} from './errors/midi-file-codec-error'
export { ToneJsMidiFileDecoder } from './adapters/tonejs-midi/tonejs-midi-file-decoder'
export { StandardMidiFileEncoder } from './adapters/midi-file-js/standard-midi-file-encoder'
