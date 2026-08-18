import type { MidiFileDocument } from '#internal/contract/midi-file-document'

/** Converts Standard MIDI File bytes into a library-neutral document. */
export interface MidiFileDecoder {
  decode(bytes: Uint8Array): MidiFileDocument
}

/** Converts a library-neutral document into Standard MIDI File bytes. */
export interface MidiFileEncoder {
  encode(document: MidiFileDocument): Uint8Array
}
