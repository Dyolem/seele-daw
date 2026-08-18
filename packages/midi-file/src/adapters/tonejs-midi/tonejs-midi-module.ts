import toneJsMidiModule from '@tonejs/midi'
import type { Midi as ToneJsMidiInstance } from '@tonejs/midi'

interface ToneJsMidiConstructor {
  new (bytes?: ArrayLike<number> | ArrayBuffer): ToneJsMidiInstance
}

// @tonejs/midi publishes CommonJS at its main entry while its declarations expose named exports.
// Keep the narrow interop assertion inside the adapter so neither consumers nor domain types inherit it.
const interopModule = toneJsMidiModule as unknown as {
  readonly Midi: ToneJsMidiConstructor
}

export const ToneJsMidi = interopModule.Midi
