import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'

const SMF_KEY_SIGNATURES = Object.freeze([
  'Cb',
  'Gb',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
])

export function parseSmfKeySignatureOffset(key: string): number {
  const index = SMF_KEY_SIGNATURES.indexOf(key)
  if (index === -1) {
    throw new MidiFileCodecError('invalid-midi-document', `Invalid key signature: ${key}`, {
      operation: 'encode',
    })
  }
  return index - 7
}
