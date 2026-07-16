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
import { addTicks, parsePositiveTick, parseTick, type Tick } from '@/time/tick'

export interface ClipBase {
  readonly id: ClipId
  readonly trackId: TrackId
  readonly name: string
  readonly color: ProjectColor | null
  readonly muted: boolean
  readonly startTick: Tick
}

export interface MidiLoop {
  readonly sourceStartTick: Tick
  readonly sourceSpanTick: Tick
}

export interface MidiClipRecord extends ClipBase {
  readonly kind: 'midi'
  readonly spanTick: Tick
  readonly sourceId: MidiSourceId
  readonly sourceOffsetTick: Tick
  readonly loop: MidiLoop | null
}

export type ClipRecord = MidiClipRecord

export interface CreateMidiLoopInput {
  readonly sourceStartTick: Tick
  readonly sourceSpanTick: Tick
}

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
  readonly loop: MidiLoop | null
}

export function createMidiLoop(input: CreateMidiLoopInput): MidiLoop {
  const sourceStartTick = parseTick(input.sourceStartTick)
  const sourceSpanTick = parsePositiveTick(input.sourceSpanTick)

  addTicks(sourceStartTick, sourceSpanTick)

  return { sourceStartTick, sourceSpanTick }
}

export function createMidiClipRecord(input: CreateMidiClipRecordInput): MidiClipRecord {
  const startTick = parseTick(input.startTick)
  const spanTick = parsePositiveTick(input.spanTick)
  const sourceOffsetTick = parseTick(input.sourceOffsetTick)
  const loop = input.loop === null ? null : createMidiLoop(input.loop)

  addTicks(startTick, spanTick)

  if (loop === null) {
    addTicks(sourceOffsetTick, spanTick)
  } else {
    const loopEndTick = addTicks(loop.sourceStartTick, loop.sourceSpanTick)

    if (sourceOffsetTick < loop.sourceStartTick || sourceOffsetTick >= loopEndTick) {
      rejectDomainValue('MidiClip.sourceOffsetTick', 'a Tick inside the MIDI loop range')
    }
  }

  if (typeof input.muted !== 'boolean') {
    rejectDomainValue('MidiClip.muted', 'a boolean')
  }

  return {
    id: parseClipId(input.id),
    kind: 'midi',
    trackId: parseTrackId(input.trackId),
    name: parseEntityName(input.name),
    color: input.color === null ? null : parseProjectColor(input.color),
    muted: input.muted,
    startTick,
    spanTick,
    sourceId: parseMidiSourceId(input.sourceId),
    sourceOffsetTick,
    loop,
  }
}
