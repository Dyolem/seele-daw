import { rejectDomainValue } from './domain-value-error'
import {
  parseClipId,
  parseMidiSourceId,
  parseTrackId,
  type ClipId,
  type MidiSourceId,
  type TrackId,
} from './ids'
import { parseEntityName, parseProjectColor, type ProjectColor } from './scalars'
import { addTicks, parsePositiveTick, parseTick, type Tick } from '#internal/model/tick'

/** A window on the timeline that plays `spanTick` of its MIDI Source from `sourceOffsetTick`. */
export interface MidiClipRecord {
  readonly id: ClipId
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly startTick: Tick
  readonly spanTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceOffsetTick: Tick
}

/** Every Clip is a MIDI Clip until Audio Clips exist. */
export type ClipRecord = MidiClipRecord

export interface CreateMidiClipRecordInput {
  readonly id: ClipId
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly startTick: Tick
  readonly spanTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceOffsetTick: Tick
}

export function createMidiClipRecord(input: CreateMidiClipRecordInput): MidiClipRecord {
  const startTick = parseTick(input.startTick)
  const spanTick = parsePositiveTick(input.spanTick)
  const sourceOffsetTick = parseTick(input.sourceOffsetTick)

  addTicks(startTick, spanTick)
  addTicks(sourceOffsetTick, spanTick)

  if (typeof input.muted !== 'boolean') {
    rejectDomainValue('MidiClip.muted', 'a boolean')
  }

  return {
    id: parseClipId(input.id),
    trackId: parseTrackId(input.trackId),
    name: parseEntityName(input.name),
    color: input.color === null ? null : parseProjectColor(input.color),
    muted: input.muted,
    startTick,
    spanTick,
    sourceId: parseMidiSourceId(input.sourceId),
    sourceOffsetTick,
  }
}
