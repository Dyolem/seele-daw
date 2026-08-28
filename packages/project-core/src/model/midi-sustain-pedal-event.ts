import {
  parseMidiSustainPedalEventId,
  type MidiSourceId,
  type MidiSustainPedalEventId,
} from './ids'
import {
  parseMidiChannel,
  parseMidiControlValue,
  type MidiChannel,
  type MidiControlValue,
} from './scalars'
import { parseTick, type Tick } from '#internal/time/tick'

export const MIDI_SUSTAIN_PEDAL_CONTROLLER_NUMBER = 64 as const
export const MIDI_SUSTAIN_PEDAL_DOWN_VALUE_MIN = 64 as const

/** One raw MIDI CC64 fact owned by a MidiSource. */
export interface MidiSustainPedalEventRecord {
  readonly id: MidiSustainPedalEventId
  readonly tick: Tick
  readonly value: MidiControlValue
  readonly channel: MidiChannel
}

export interface CreateMidiSustainPedalEventRecordInput {
  readonly id: MidiSustainPedalEventId
  readonly tick: Tick
  readonly value: MidiControlValue
  readonly channel: MidiChannel
}

export interface MidiSustainPedalEventAddress {
  readonly sourceId: MidiSourceId
  readonly eventId: MidiSustainPedalEventId
}

export function createMidiSustainPedalEventRecord(
  input: CreateMidiSustainPedalEventRecordInput,
): MidiSustainPedalEventRecord {
  return {
    id: parseMidiSustainPedalEventId(input.id),
    tick: parseTick(input.tick),
    value: parseMidiControlValue(input.value),
    channel: parseMidiChannel(input.channel),
  }
}

export function isMidiSustainPedalDown(value: MidiControlValue): boolean {
  return value >= MIDI_SUSTAIN_PEDAL_DOWN_VALUE_MIN
}
