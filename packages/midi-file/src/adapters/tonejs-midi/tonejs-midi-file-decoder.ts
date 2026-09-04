import type {
  MidiFileControlChange,
  MidiFileDocument,
  MidiFileKeySignatureScale,
  MidiFilePitchBend,
  MidiFileTextEventKind,
  MidiFileTrack,
} from '#internal/contract/midi-file-document'
import type { MidiFileDecoder } from '#internal/contract/midi-file-codec'
import { createStandardMidiFileSourceEnvelope } from '#internal/contract/midi-source-envelope'
import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'
import { readSupportedSmfHeader } from '#internal/adapters/tonejs-midi/smf-header'
import { ToneJsMidi } from '#internal/adapters/tonejs-midi/tonejs-midi-module'
import type { Track as ToneJsMidiTrack } from '@tonejs/midi'

const MAX_MIDI_7_BIT_VALUE = 127
const PITCH_BEND_CENTER = 8192

export class ToneJsMidiFileDecoder implements MidiFileDecoder {
  decode(bytes: Uint8Array): MidiFileDocument {
    const smfHeader = readSupportedSmfHeader(bytes)

    try {
      const midi = new ToneJsMidi(bytes)
      return {
        format: smfHeader.format,
        sourceEnvelope: createStandardMidiFileSourceEnvelope(smfHeader.format),
        name: midi.name,
        ppq: smfHeader.ppq,
        tempos: midi.header.tempos.map((event) => ({
          tick: readNonNegativeInteger(event.ticks, 'tempo tick'),
          bpm: readPositiveNumber(event.bpm, 'tempo BPM'),
        })),
        timeSignatures: midi.header.timeSignatures.map((event) => ({
          tick: readNonNegativeInteger(event.ticks, 'time-signature tick'),
          numerator: readPositiveInteger(event.timeSignature[0], 'time-signature numerator'),
          denominator: readPositiveInteger(event.timeSignature[1], 'time-signature denominator'),
        })),
        keySignatures: midi.header.keySignatures.map((event) => ({
          tick: readNonNegativeInteger(event.ticks, 'key-signature tick'),
          key: event.key,
          scale: readKeySignatureScale(event.scale),
        })),
        textEvents: midi.header.meta.map((event) => ({
          tick: readNonNegativeInteger(event.ticks, 'text-event tick'),
          kind: readTextEventKind(event.type),
          text: event.text,
        })),
        tracks: midi.tracks.map(mapTrack),
      }
    } catch (error) {
      if (error instanceof MidiFileCodecError) throw error
      throw new MidiFileCodecError(
        'decode-failed',
        'The Standard MIDI File could not be decoded.',
        { operation: 'decode', format: smfHeader.format },
        { cause: error },
      )
    }
  }
}

function mapTrack(track: ToneJsMidiTrack): MidiFileTrack {
  return {
    name: track.name,
    channel: readIntegerInRange(track.channel, 0, 15, 'track channel'),
    programNumber: readIntegerInRange(
      track.instrument.number,
      0,
      MAX_MIDI_7_BIT_VALUE,
      'program number',
    ),
    ...(track.endOfTrackTicks === undefined
      ? {}
      : { endTick: readNonNegativeInteger(track.endOfTrackTicks, 'end-of-track tick') }),
    notes: track.notes.map((note) => ({
      tick: readNonNegativeInteger(note.ticks, 'note tick'),
      durationTicks: readNonNegativeInteger(note.durationTicks, 'note duration'),
      pitch: readIntegerInRange(note.midi, 0, MAX_MIDI_7_BIT_VALUE, 'note pitch'),
      velocity: readIntegerInRange(
        Math.round(note.velocity * MAX_MIDI_7_BIT_VALUE),
        1,
        MAX_MIDI_7_BIT_VALUE,
        'note velocity',
      ),
      releaseVelocity: readIntegerInRange(
        Math.round(note.noteOffVelocity * MAX_MIDI_7_BIT_VALUE),
        0,
        MAX_MIDI_7_BIT_VALUE,
        'note release velocity',
      ),
    })),
    controlChanges: readControlChanges(track),
    pitchBends: track.pitchBends.map(mapPitchBend),
  }
}

function readControlChanges(track: ToneJsMidiTrack): MidiFileControlChange[] {
  const controlChanges: MidiFileControlChange[] = []
  for (let controller = 0; controller <= MAX_MIDI_7_BIT_VALUE; controller += 1) {
    const events = track.controlChanges[controller]
    if (!events) continue
    for (const event of events) {
      controlChanges.push({
        tick: readNonNegativeInteger(event.ticks, 'control-change tick'),
        controller,
        value: readIntegerInRange(
          Math.round(event.value * MAX_MIDI_7_BIT_VALUE),
          0,
          MAX_MIDI_7_BIT_VALUE,
          'control-change value',
        ),
      })
    }
  }
  return controlChanges.sort(
    (left, right) => left.tick - right.tick || left.controller - right.controller,
  )
}

function mapPitchBend(event: {
  readonly ticks: number
  readonly value: number
}): MidiFilePitchBend {
  return {
    tick: readNonNegativeInteger(event.ticks, 'pitch-bend tick'),
    value: readIntegerInRange(
      Math.round(event.value * PITCH_BEND_CENTER),
      -PITCH_BEND_CENTER,
      PITCH_BEND_CENTER - 1,
      'pitch-bend value',
    ),
  }
}

function readKeySignatureScale(scale: string): MidiFileKeySignatureScale {
  if (scale === 'major' || scale === 'minor') return scale
  throw new TypeError(`Unexpected key-signature scale: ${scale}`)
}

function readTextEventKind(kind: string): MidiFileTextEventKind {
  if (kind === 'text' || kind === 'marker' || kind === 'lyrics' || kind === 'cuePoint') {
    return kind
  }
  throw new TypeError(`Unexpected MIDI text-event kind: ${kind}`)
}

function readPositiveInteger(value: number | undefined, label: string): number {
  return readIntegerInRange(value, 1, Number.MAX_SAFE_INTEGER, label)
}

function readNonNegativeInteger(value: number, label: string): number {
  return readIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER, label)
}

function readIntegerInRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(`Unexpected ${label}: ${String(value)}`)
  }
  return value
}

function readPositiveNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Unexpected ${label}: ${String(value)}`)
  }
  return value
}
