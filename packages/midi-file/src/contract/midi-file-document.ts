export type MidiFileFormat = 0 | 1

export interface MidiFileTempoEvent {
  readonly tick: number
  readonly bpm: number
}

export interface MidiFileTimeSignatureEvent {
  readonly tick: number
  readonly numerator: number
  readonly denominator: number
}

export type MidiFileKeySignatureScale = 'major' | 'minor'

export interface MidiFileKeySignatureEvent {
  readonly tick: number
  readonly key: string
  readonly scale: MidiFileKeySignatureScale
}

export type MidiFileTextEventKind = 'text' | 'marker' | 'lyrics' | 'cuePoint'

export interface MidiFileTextEvent {
  readonly tick: number
  readonly kind: MidiFileTextEventKind
  readonly text: string
}

export interface MidiFileNote {
  readonly tick: number
  readonly durationTicks: number
  readonly pitch: number
  readonly velocity: number
  readonly releaseVelocity: number
}

export interface MidiFileControlChange {
  readonly tick: number
  readonly controller: number
  readonly value: number
}

export interface MidiFilePitchBend {
  readonly tick: number
  /** Signed 14-bit MIDI value in the inclusive range -8192..8191. */
  readonly value: number
}

/**
 * A normalized musical track produced by a MIDI file adapter.
 *
 * A source SMF track may become more than one normalized track when its channels or programs differ.
 */
export interface MidiFileTrack {
  readonly name: string
  readonly channel: number
  readonly programNumber: number
  readonly endTick?: number
  readonly notes: readonly MidiFileNote[]
  readonly controlChanges: readonly MidiFileControlChange[]
  readonly pitchBends: readonly MidiFilePitchBend[]
}

/**
 * The parser-neutral MIDI interchange document. It intentionally contains no Seele Project fields.
 */
export interface MidiFileDocument {
  readonly format: MidiFileFormat
  readonly name: string
  readonly ppq: number
  readonly tempos: readonly MidiFileTempoEvent[]
  readonly timeSignatures: readonly MidiFileTimeSignatureEvent[]
  readonly keySignatures: readonly MidiFileKeySignatureEvent[]
  readonly textEvents: readonly MidiFileTextEvent[]
  readonly tracks: readonly MidiFileTrack[]
}
