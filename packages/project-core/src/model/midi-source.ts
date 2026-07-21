import { parseMidiSourceId, type MidiSourceId } from './ids'
import { parsePositiveTick, type Tick } from '#internal/time/tick'

export interface MidiSourceRecord {
  readonly id: MidiSourceId
  readonly lengthTick: Tick
}

export interface CreateMidiSourceRecordInput {
  readonly id: MidiSourceId
  readonly lengthTick: Tick
}

export function createMidiSourceRecord(input: CreateMidiSourceRecordInput): MidiSourceRecord {
  return {
    id: parseMidiSourceId(input.id),
    lengthTick: parsePositiveTick(input.lengthTick),
  }
}
