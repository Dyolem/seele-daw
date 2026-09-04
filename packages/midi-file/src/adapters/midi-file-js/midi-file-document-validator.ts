import type { MidiFileDocument } from '#internal/contract/midi-file-document'
import { assertMidiSourceEnvelope } from '#internal/contract/midi-source-envelope'
import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'
import { parseSmfKeySignatureOffset } from '#internal/adapters/midi-file-js/smf-key-signature'

const MAX_MIDI_7_BIT_VALUE = 127
const MIN_PITCH_BEND_VALUE = -8192
const MAX_PITCH_BEND_VALUE = 8191
const MAX_PPQ = 0x7fff
const MAX_TEMPO_MICROSECONDS = 0xffffff
const MAX_MUSICAL_TRACKS = 0xfffe

export function assertEncodableMidiFileDocument(document: MidiFileDocument): void {
  if (document.format !== 1) {
    throw new MidiFileCodecError(
      'unsupported-midi-format',
      'The built-in MIDI encoder emits Standard MIDI File format 1 only.',
      { operation: 'encode', format: document.format },
    )
  }

  try {
    assertMidiSourceEnvelope(document.sourceEnvelope, document.format)
  } catch {
    fail('Invalid or inconsistent MIDI Source Envelope')
  }

  assertIntegerInRange(document.ppq, 1, MAX_PPQ, 'PPQ')
  assertByteString(document.name, 'document name')
  if (document.tracks.length > MAX_MUSICAL_TRACKS) {
    fail(`SMF Type 1 cannot contain ${document.tracks.length + 1} tracks`)
  }

  for (const tempo of document.tempos) {
    assertTick(tempo.tick, 'tempo tick')
    if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0) fail(`Invalid tempo BPM: ${tempo.bpm}`)
    const microseconds = Math.floor(60_000_000 / tempo.bpm)
    if (microseconds < 1 || microseconds > MAX_TEMPO_MICROSECONDS) {
      fail(`Tempo BPM cannot be represented by an SMF Set Tempo event: ${tempo.bpm}`)
    }
  }

  for (const timeSignature of document.timeSignatures) {
    assertTick(timeSignature.tick, 'time-signature tick')
    assertIntegerInRange(timeSignature.numerator, 1, 255, 'time-signature numerator')
    if (
      !Number.isSafeInteger(timeSignature.denominator) ||
      timeSignature.denominator <= 0 ||
      !Number.isSafeInteger(Math.log2(timeSignature.denominator))
    ) {
      fail(`Invalid time-signature denominator: ${timeSignature.denominator}`)
    }
  }

  for (const event of document.keySignatures) {
    assertTick(event.tick, 'key-signature tick')
    parseSmfKeySignatureOffset(event.key)
  }
  for (const event of document.textEvents) assertTick(event.tick, 'text-event tick')
  for (const event of document.textEvents) assertByteString(event.text, 'text-event content')

  for (const track of document.tracks) {
    assertByteString(track.name, 'track name')
    assertIntegerInRange(track.channel, 0, 15, 'track channel')
    assertIntegerInRange(track.programNumber, 0, MAX_MIDI_7_BIT_VALUE, 'program number')
    if (track.endTick !== undefined) assertTick(track.endTick, 'end-of-track tick')

    let lastEventTick = 0
    for (const note of track.notes) {
      assertTick(note.tick, 'note tick')
      assertIntegerInRange(note.durationTicks, 1, Number.MAX_SAFE_INTEGER, 'note duration')
      assertTick(note.tick + note.durationTicks, 'note end tick')
      assertIntegerInRange(note.pitch, 0, MAX_MIDI_7_BIT_VALUE, 'note pitch')
      assertIntegerInRange(note.velocity, 1, MAX_MIDI_7_BIT_VALUE, 'note velocity')
      assertIntegerInRange(note.releaseVelocity, 0, MAX_MIDI_7_BIT_VALUE, 'note release velocity')
      lastEventTick = Math.max(lastEventTick, note.tick + note.durationTicks)
    }

    for (const controlChange of track.controlChanges) {
      assertTick(controlChange.tick, 'control-change tick')
      assertIntegerInRange(controlChange.controller, 0, MAX_MIDI_7_BIT_VALUE, 'controller number')
      assertIntegerInRange(controlChange.value, 0, MAX_MIDI_7_BIT_VALUE, 'control-change value')
      lastEventTick = Math.max(lastEventTick, controlChange.tick)
    }

    for (const pitchBend of track.pitchBends) {
      assertTick(pitchBend.tick, 'pitch-bend tick')
      assertIntegerInRange(
        pitchBend.value,
        MIN_PITCH_BEND_VALUE,
        MAX_PITCH_BEND_VALUE,
        'pitch-bend value',
      )
      lastEventTick = Math.max(lastEventTick, pitchBend.tick)
    }

    if (track.endTick !== undefined && track.endTick < lastEventTick) {
      fail(`End-of-track tick ${track.endTick} precedes the last event at tick ${lastEventTick}`)
    }
  }
}

function assertTick(value: number, label: string): void {
  assertIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER, label)
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`Invalid ${label}: ${value}`)
  }
}

function assertByteString(value: string, label: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined || codePoint > 0xff) {
      fail(`Invalid ${label}: the current SMF text codec accepts byte-range characters only`)
    }
  }
}

function fail(message: string): never {
  throw new MidiFileCodecError('invalid-midi-document', message, { operation: 'encode' })
}
