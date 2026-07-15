import { parseNoteId, type MidiSourceId, type NoteId } from './ids'
import {
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  type MidiChannel,
  type MidiPitch,
  type MidiVelocity,
} from './scalars'
import { addTicks, parsePositiveTick, parseTick, type Tick } from '../time/tick'

export interface MidiNoteRecord {
  readonly id: NoteId
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface CreateMidiNoteRecordInput {
  readonly id: NoteId
  readonly startTick: Tick
  readonly durationTick: Tick
  readonly pitch: MidiPitch
  readonly velocity: MidiVelocity
  readonly channel: MidiChannel
}

export interface MidiNoteAddress {
  readonly sourceId: MidiSourceId
  readonly noteId: NoteId
}

export function createMidiNoteRecord(input: CreateMidiNoteRecordInput): MidiNoteRecord {
  const startTick = parseTick(input.startTick)
  const durationTick = parsePositiveTick(input.durationTick)

  addTicks(startTick, durationTick)

  return {
    id: parseNoteId(input.id),
    startTick,
    durationTick,
    pitch: parseMidiPitch(input.pitch),
    velocity: parseMidiVelocity(input.velocity),
    channel: parseMidiChannel(input.channel),
  }
}
