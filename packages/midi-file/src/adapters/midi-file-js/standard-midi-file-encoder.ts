import type { MidiFileEncoder } from '#internal/contract/midi-file-codec'
import type {
  MidiFileDocument,
  MidiFileKeySignatureEvent,
  MidiFileTextEvent,
  MidiFileTrack,
} from '#internal/contract/midi-file-document'
import { MidiFileCodecError } from '#internal/errors/midi-file-codec-error'
import { assertEncodableMidiFileDocument } from '#internal/adapters/midi-file-js/midi-file-document-validator'
import { parseSmfKeySignatureOffset } from '#internal/adapters/midi-file-js/smf-key-signature'
import { writeMidi } from 'midi-file'
import type {
  MidiData,
  MidiEvent,
  MidiLyricsEvent,
  MidiMarkerEvent,
  MidiCuePointEvent,
  MidiTextEvent as SmfTextEvent,
} from 'midi-file'

const TRACK_NAME_PRIORITY = 0
const PROGRAM_CHANGE_PRIORITY = 10
const CONTINUOUS_EVENT_PRIORITY = 20
const NOTE_OFF_PRIORITY = 30
const NOTE_ON_PRIORITY = 40
const MAX_VARIABLE_LENGTH_QUANTITY = 0x0fffffff

interface ScheduledMidiEvent {
  readonly absoluteTick: number
  readonly priority: number
  readonly sequence: number
  readonly event: MidiEvent
}

export class StandardMidiFileEncoder implements MidiFileEncoder {
  encode(document: MidiFileDocument): Uint8Array {
    assertEncodableMidiFileDocument(document)

    try {
      const tracks = [encodeConductorTrack(document), ...document.tracks.map(encodeMusicTrack)]
      const midiData: MidiData = {
        header: {
          format: 1,
          numTracks: tracks.length,
          ticksPerBeat: document.ppq,
        },
        tracks,
      }
      return new Uint8Array(writeMidi(midiData, { running: true }))
    } catch (error) {
      if (error instanceof MidiFileCodecError) throw error
      throw new MidiFileCodecError(
        'encode-failed',
        'The MIDI document could not be encoded as a Standard MIDI File.',
        { operation: 'encode', format: document.format },
        { cause: error },
      )
    }
  }
}

function encodeConductorTrack(document: MidiFileDocument): MidiEvent[] {
  const events: ScheduledMidiEvent[] = []
  schedule(events, 0, TRACK_NAME_PRIORITY, {
    deltaTime: 0,
    meta: true,
    type: 'trackName',
    text: document.name,
  })
  for (const tempo of document.tempos) {
    schedule(events, tempo.tick, CONTINUOUS_EVENT_PRIORITY, {
      deltaTime: 0,
      meta: true,
      type: 'setTempo',
      microsecondsPerBeat: Math.floor(60_000_000 / tempo.bpm),
    })
  }
  for (const timeSignature of document.timeSignatures) {
    schedule(events, timeSignature.tick, CONTINUOUS_EVENT_PRIORITY, {
      deltaTime: 0,
      meta: true,
      type: 'timeSignature',
      numerator: timeSignature.numerator,
      denominator: timeSignature.denominator,
      metronome: 24,
      thirtyseconds: 8,
    })
  }
  for (const keySignature of document.keySignatures) {
    schedule(events, keySignature.tick, CONTINUOUS_EVENT_PRIORITY, encodeKeySignature(keySignature))
  }
  for (const textEvent of document.textEvents) {
    schedule(events, textEvent.tick, CONTINUOUS_EVENT_PRIORITY, encodeTextEvent(textEvent))
  }
  return finalizeTrack(events)
}

function encodeMusicTrack(track: MidiFileTrack): MidiEvent[] {
  const events: ScheduledMidiEvent[] = []
  schedule(events, 0, TRACK_NAME_PRIORITY, {
    deltaTime: 0,
    meta: true,
    type: 'trackName',
    text: track.name,
  })
  schedule(events, 0, PROGRAM_CHANGE_PRIORITY, {
    deltaTime: 0,
    type: 'programChange',
    channel: track.channel,
    programNumber: track.programNumber,
  })

  for (const note of track.notes) {
    schedule(events, note.tick, NOTE_ON_PRIORITY, {
      deltaTime: 0,
      type: 'noteOn',
      channel: track.channel,
      noteNumber: note.pitch,
      velocity: note.velocity,
    })
    schedule(events, note.tick + note.durationTicks, NOTE_OFF_PRIORITY, {
      deltaTime: 0,
      type: 'noteOff',
      channel: track.channel,
      noteNumber: note.pitch,
      velocity: note.releaseVelocity,
    })
  }
  for (const controlChange of track.controlChanges) {
    schedule(events, controlChange.tick, CONTINUOUS_EVENT_PRIORITY, {
      deltaTime: 0,
      type: 'controller',
      channel: track.channel,
      controllerType: controlChange.controller,
      value: controlChange.value,
    })
  }
  for (const pitchBend of track.pitchBends) {
    schedule(events, pitchBend.tick, CONTINUOUS_EVENT_PRIORITY, {
      deltaTime: 0,
      type: 'pitchBend',
      channel: track.channel,
      value: pitchBend.value,
    })
  }

  return finalizeTrack(events, track.endTick)
}

function encodeKeySignature(event: MidiFileKeySignatureEvent): MidiEvent {
  return {
    deltaTime: 0,
    meta: true,
    type: 'keySignature',
    key: parseSmfKeySignatureOffset(event.key),
    scale: event.scale === 'major' ? 0 : 1,
  }
}

function encodeTextEvent(
  event: MidiFileTextEvent,
): SmfTextEvent | MidiMarkerEvent | MidiLyricsEvent | MidiCuePointEvent {
  const common = { deltaTime: 0, meta: true as const, text: event.text }
  switch (event.kind) {
    case 'text':
      return { ...common, type: 'text' }
    case 'marker':
      return { ...common, type: 'marker' }
    case 'lyrics':
      return { ...common, type: 'lyrics' }
    case 'cuePoint':
      return { ...common, type: 'cuePoint' }
  }
}

function schedule(
  events: ScheduledMidiEvent[],
  absoluteTick: number,
  priority: number,
  event: MidiEvent,
): void {
  events.push({ absoluteTick, priority, sequence: events.length, event })
}

function finalizeTrack(events: ScheduledMidiEvent[], requestedEndTick?: number): MidiEvent[] {
  events.sort(
    (left, right) =>
      left.absoluteTick - right.absoluteTick ||
      left.priority - right.priority ||
      left.sequence - right.sequence,
  )

  let previousTick = 0
  const encodedEvents = events.map(({ absoluteTick, event }) => {
    event.deltaTime = readEncodableDelta(absoluteTick - previousTick)
    previousTick = absoluteTick
    return event
  })
  const endTick = Math.max(previousTick, requestedEndTick ?? 0)
  encodedEvents.push({
    deltaTime: readEncodableDelta(endTick - previousTick),
    meta: true,
    type: 'endOfTrack',
  })
  return encodedEvents
}

function readEncodableDelta(delta: number): number {
  if (delta > MAX_VARIABLE_LENGTH_QUANTITY) {
    throw new MidiFileCodecError(
      'invalid-midi-document',
      `SMF delta ${delta} exceeds the four-byte variable-length quantity range.`,
      { operation: 'encode' },
    )
  }
  return delta
}
