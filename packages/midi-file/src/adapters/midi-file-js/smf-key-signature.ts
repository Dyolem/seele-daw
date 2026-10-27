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
    throw new Error(`Invalid key signature: ${key}`)
  }
  return index - 7
}
