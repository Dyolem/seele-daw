import {
  MIDI_CONTROL_VALUE_MIN,
  isMidiSustainPedalDown,
  parseMidiChannel,
  parseMidiControlValue,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiClipRecord,
  type MidiControlValue,
  type MidiSourceId,
  type MidiSustainPedalEventRecord,
  type ModelRevision,
  type ProjectId,
  type ProjectSnapshot,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import {
  pianoRollSourceTickToClipTick,
  type PianoRollClipContext,
} from '#internal/common/piano-roll/piano-roll-clip-context'
import { PianoRollError } from '#internal/common/piano-roll/piano-roll-error'
import {
  PIANO_ROLL_TRACK_CLIP_STATUS,
  createPianoRollTrackClipProjection,
  pianoRollTrackSourceTickToProjectTick,
  type PianoRollTrackClipProjection,
  type ReadyPianoRollTrackClipProjection,
} from '#internal/common/piano-roll/track/clip-projection'

const DEFAULT_SUSTAIN_PEDAL_VALUE = parseMidiControlValue(MIDI_CONTROL_VALUE_MIN)

export interface PianoRollSustainPedalLaneEventProjection {
  readonly affectsPlayback: boolean
  readonly event: MidiSustainPedalEventRecord
  readonly pedalDown: boolean
  readonly timelineTick: Tick
}

export interface PianoRollSustainPedalLaneStepSegment {
  readonly endTick: Tick
  readonly pedalDown: boolean
  readonly startTick: Tick
  readonly value: MidiControlValue
}

export interface PianoRollSustainPedalClipLaneReadModel {
  readonly channel: MidiChannel
  readonly clipId: ClipId
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly initialPedalDown: boolean
  readonly initialValue: MidiControlValue
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly segments: readonly PianoRollSustainPedalLaneStepSegment[]
  readonly sourceId: MidiSourceId
}

export interface CreatePianoRollSustainPedalClipLaneReadModelInput {
  readonly channel: MidiChannel
  readonly context: PianoRollClipContext
  readonly snapshot: ProjectSnapshot
}

export interface PianoRollTrackSustainPedalLaneClipReadModel {
  readonly clip: PianoRollTrackClipProjection
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly initialPedalDown: boolean | null
  readonly initialValue: MidiControlValue | null
  readonly segments: readonly PianoRollSustainPedalLaneStepSegment[]
}

export interface PianoRollTrackSustainPedalLaneReadModel {
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly clips: readonly PianoRollTrackSustainPedalLaneClipReadModel[]
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly trackId: TrackId
}

export interface CreatePianoRollTrackSustainPedalLaneReadModelInput {
  readonly activeClipId?: ClipId | null
  readonly channel: MidiChannel
  readonly snapshot: ProjectSnapshot
  readonly trackId: TrackId
}

interface ProjectSustainPedalWindowInput {
  readonly channel: MidiChannel
  readonly events: readonly MidiSustainPedalEventRecord[]
  readonly sourceEndTick: Tick
  readonly sourceStartTick: Tick
  readonly timelineEndTick: Tick
  readonly timelineStartTick: Tick
  readonly toTimelineTick: (sourceTick: Tick) => Tick
}

interface ProjectedSustainPedalWindow {
  readonly events: readonly PianoRollSustainPedalLaneEventProjection[]
  readonly initialPedalDown: boolean
  readonly initialValue: MidiControlValue
  readonly segments: readonly PianoRollSustainPedalLaneStepSegment[]
}

function compareEvents(
  left: MidiSustainPedalEventRecord,
  right: MidiSustainPedalEventRecord,
): number {
  if (left.tick !== right.tick) return left.tick - right.tick
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function createStepSegment(
  startTick: Tick,
  endTick: Tick,
  value: MidiControlValue,
): PianoRollSustainPedalLaneStepSegment {
  return Object.freeze({
    endTick,
    pedalDown: isMidiSustainPedalDown(value),
    startTick,
    value,
  })
}

function projectSustainPedalWindow(
  input: ProjectSustainPedalWindowInput,
): ProjectedSustainPedalWindow {
  const channelEvents = input.events
    .filter((event) => event.channel === input.channel)
    .sort(compareEvents)
  let chasedEvent: MidiSustainPedalEventRecord | undefined
  for (const event of channelEvents) {
    if (event.tick >= input.sourceStartTick) break
    chasedEvent = event
  }
  const initialValue = chasedEvent?.value ?? DEFAULT_SUSTAIN_PEDAL_VALUE
  const visibleEvents = channelEvents.filter(
    (event) => event.tick >= input.sourceStartTick && event.tick <= input.sourceEndTick,
  )
  const events = visibleEvents.map((event) =>
    Object.freeze({
      affectsPlayback: event.tick < input.sourceEndTick,
      event,
      pedalDown: isMidiSustainPedalDown(event.value),
      timelineTick: input.toTimelineTick(event.tick),
    }),
  )

  const segments: PianoRollSustainPedalLaneStepSegment[] = []
  let segmentStartTick = input.timelineStartTick
  let segmentValue = initialValue

  for (const projection of events) {
    if (!projection.affectsPlayback) continue
    if (projection.timelineTick > segmentStartTick) {
      segments.push(createStepSegment(segmentStartTick, projection.timelineTick, segmentValue))
    }
    segmentStartTick = projection.timelineTick
    segmentValue = projection.event.value
  }

  if (segmentStartTick < input.timelineEndTick) {
    segments.push(createStepSegment(segmentStartTick, input.timelineEndTick, segmentValue))
  }

  return Object.freeze({
    events: Object.freeze(events),
    initialPedalDown: isMidiSustainPedalDown(initialValue),
    initialValue,
    segments: Object.freeze(segments),
  })
}

function requireSustainPedalEvents(
  snapshot: ProjectSnapshot,
  sourceId: MidiSourceId,
): readonly MidiSustainPedalEventRecord[] {
  const partition = snapshot.midiSustainPedalEventPartitions.find(
    (candidate) => candidate.sourceId === sourceId,
  )
  if (partition === undefined) {
    throw new PianoRollError(
      'sustain-pedal-partition-missing',
      `Piano Roll references missing Sustain Pedal Event partition ${sourceId}`,
    )
  }
  return partition.events
}

/** Projects one non-looped Clip's selected-channel CC64 facts into Clip-local time. */
export function createPianoRollSustainPedalClipLaneReadModel(
  input: CreatePianoRollSustainPedalClipLaneReadModelInput,
): PianoRollSustainPedalClipLaneReadModel {
  const channel = parseMidiChannel(input.channel)
  const events = requireSustainPedalEvents(input.snapshot, input.context.sourceId)
  const projection = projectSustainPedalWindow({
    channel,
    events,
    sourceEndTick: input.context.sourceEndTick,
    sourceStartTick: input.context.sourceStartTick,
    timelineEndTick: input.context.clipSpanTick,
    timelineStartTick: parseTick(0),
    toTimelineTick: (sourceTick) => pianoRollSourceTickToClipTick(input.context, sourceTick),
  })

  return Object.freeze({
    channel,
    clipId: input.context.clipId,
    events: projection.events,
    initialPedalDown: projection.initialPedalDown,
    initialValue: projection.initialValue,
    modelRevision: input.snapshot.modelRevision,
    projectId: input.snapshot.project.id,
    segments: projection.segments,
    sourceId: input.context.sourceId,
  })
}

function compareTrackClips(
  left: PianoRollTrackSustainPedalLaneClipReadModel,
  right: PianoRollTrackSustainPedalLaneClipReadModel,
): number {
  if (left.clip.startTick !== right.clip.startTick) {
    return left.clip.startTick - right.clip.startTick
  }
  if (left.clip.clipId < right.clip.clipId) return -1
  if (left.clip.clipId > right.clip.clipId) return 1
  return 0
}

function createTrackClipReadModel(
  input: CreatePianoRollTrackSustainPedalLaneReadModelInput,
  channel: MidiChannel,
  clip: MidiClipRecord,
): PianoRollTrackSustainPedalLaneClipReadModel {
  const source = input.snapshot.midiSources.find((candidate) => candidate.id === clip.sourceId)
  if (source === undefined) {
    throw new PianoRollError(
      'track-clip-source-missing',
      `Piano Roll Track Clip ${clip.id} references missing MidiSource ${clip.sourceId}`,
    )
  }

  const projection = createPianoRollTrackClipProjection(clip, source)
  if (projection.status === PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED) {
    return Object.freeze({
      clip: projection,
      events: Object.freeze([]),
      initialPedalDown: null,
      initialValue: null,
      segments: Object.freeze([]),
    })
  }

  return createReadyTrackClipReadModel(input.snapshot, channel, projection)
}

function createReadyTrackClipReadModel(
  snapshot: ProjectSnapshot,
  channel: MidiChannel,
  clip: ReadyPianoRollTrackClipProjection,
): PianoRollTrackSustainPedalLaneClipReadModel {
  const events = requireSustainPedalEvents(snapshot, clip.sourceId)
  const projection = projectSustainPedalWindow({
    channel,
    events,
    sourceEndTick: clip.context.sourceEndTick,
    sourceStartTick: clip.context.sourceStartTick,
    timelineEndTick: clip.endTick,
    timelineStartTick: clip.startTick,
    toTimelineTick: (sourceTick) => pianoRollTrackSourceTickToProjectTick(clip, sourceTick),
  })

  return Object.freeze({
    clip,
    events: projection.events,
    initialPedalDown: projection.initialPedalDown,
    initialValue: projection.initialValue,
    segments: projection.segments,
  })
}

/** Projects selected-channel CC64 facts for every Clip on one Instrument Track. */
export function createPianoRollTrackSustainPedalLaneReadModel(
  input: CreatePianoRollTrackSustainPedalLaneReadModelInput,
): PianoRollTrackSustainPedalLaneReadModel {
  const track = input.snapshot.tracks.find((candidate) => candidate.id === input.trackId)
  if (track === undefined) {
    throw new PianoRollError(
      'track-not-found',
      `Cannot create a Sustain Pedal Lane projection for missing Track ${input.trackId}`,
    )
  }
  if (track.kind !== 'instrument') {
    throw new PianoRollError(
      'track-not-instrument',
      `Cannot create a Sustain Pedal Lane projection for non-Instrument Track ${track.id}`,
    )
  }

  const channel = parseMidiChannel(input.channel)
  const clips = input.snapshot.clips
    .filter((clip) => clip.trackId === track.id)
    .map((clip) => createTrackClipReadModel(input, channel, clip))
  clips.sort(compareTrackClips)

  const requestedActiveClipId = input.activeClipId ?? null
  const activeClipId = clips.some(({ clip }) => clip.clipId === requestedActiveClipId)
    ? requestedActiveClipId
    : null

  return Object.freeze({
    activeClipId,
    channel,
    clips: Object.freeze(clips),
    modelRevision: input.snapshot.modelRevision,
    projectId: input.snapshot.project.id,
    trackId: track.id,
  })
}
