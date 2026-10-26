import {
  addTicks,
  parseTick,
  type ClipId,
  type MidiClipRecord,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type ModelRevision,
  type ProjectId,
  type ProjectSnapshot,
  type Tick,
  type TrackId,
} from '@seele-daw/project-core'

import {
  PIANO_ROLL_TRACK_CLIP_STATUS,
  createPianoRollTrackClipProjection,
  pianoRollTrackSourceTickToProjectTick,
  type PianoRollTrackClipProjection,
  type ReadyPianoRollTrackClipProjection,
} from '#internal/common/piano-roll/track/clip-projection'

export interface PianoRollTrackNoteProjection {
  readonly clipId: ClipId
  readonly note: MidiNoteRecord
  readonly projectEndTick: Tick
  readonly projectStartTick: Tick
}

export interface PianoRollTrackClipReadModel {
  readonly clip: PianoRollTrackClipProjection
  readonly notes: readonly PianoRollTrackNoteProjection[]
}

export interface PianoRollTrackReadModel {
  readonly activeClipId: ClipId | null
  readonly clips: readonly PianoRollTrackClipReadModel[]
  readonly modelRevision: ModelRevision
  readonly projectId: ProjectId
  readonly trackId: TrackId
}

export interface CreatePianoRollTrackReadModelInput {
  readonly activeClipId?: ClipId | null
  readonly snapshot: ProjectSnapshot
  readonly trackId: TrackId
}

function compareClipReadModels(
  left: PianoRollTrackClipReadModel,
  right: PianoRollTrackClipReadModel,
): number {
  if (left.clip.startTick !== right.clip.startTick) {
    return left.clip.startTick - right.clip.startTick
  }
  if (left.clip.clipId < right.clip.clipId) return -1
  if (left.clip.clipId > right.clip.clipId) return 1
  return 0
}

function compareNoteProjections(
  left: PianoRollTrackNoteProjection,
  right: PianoRollTrackNoteProjection,
): number {
  if (left.projectStartTick !== right.projectStartTick) {
    return left.projectStartTick - right.projectStartTick
  }
  if (left.note.pitch !== right.note.pitch) return left.note.pitch - right.note.pitch
  if (left.note.id < right.note.id) return -1
  if (left.note.id > right.note.id) return 1
  return 0
}

function createNoteProjection(
  clip: ReadyPianoRollTrackClipProjection,
  note: MidiNoteRecord,
): PianoRollTrackNoteProjection | null {
  const noteEndTick = addTicks(note.startTick, note.durationTick)
  if (noteEndTick <= clip.context.sourceStartTick || note.startTick >= clip.context.sourceEndTick) {
    return null
  }

  const visibleSourceStartTick = parseTick(Math.max(note.startTick, clip.context.sourceStartTick))
  const visibleSourceEndTick = parseTick(Math.min(noteEndTick, clip.context.sourceEndTick))

  return Object.freeze({
    clipId: clip.clipId,
    note,
    projectEndTick: pianoRollTrackSourceTickToProjectTick(clip, visibleSourceEndTick),
    projectStartTick: pianoRollTrackSourceTickToProjectTick(clip, visibleSourceStartTick),
  })
}

function createClipReadModel(
  snapshot: ProjectSnapshot,
  sources: ReadonlyMap<MidiSourceId, MidiSourceRecord>,
  clip: MidiClipRecord,
): PianoRollTrackClipReadModel {
  const projection = createPianoRollTrackClipProjection(clip, sources.get(clip.sourceId)!)
  if (projection.status === PIANO_ROLL_TRACK_CLIP_STATUS.UNSUPPORTED) {
    return Object.freeze({ clip: projection, notes: Object.freeze([]) })
  }

  const notes = snapshot.midiNotes[clip.sourceId]!.flatMap((note) => {
    const noteProjection = createNoteProjection(projection, note)
    return noteProjection === null ? [] : [noteProjection]
  })
  notes.sort(compareNoteProjections)

  return Object.freeze({
    clip: projection,
    notes: Object.freeze(notes),
  })
}

/** Creates one immutable, global Track-time Piano Roll projection of an Instrument Track. */
export function createPianoRollTrackReadModel(
  input: CreatePianoRollTrackReadModelInput,
): PianoRollTrackReadModel {
  const { snapshot, trackId } = input
  const sources = new Map(snapshot.midiSources.map((source) => [source.id, source] as const))
  const clips = snapshot.clips
    .filter((clip) => clip.trackId === trackId)
    .map((clip) => createClipReadModel(snapshot, sources, clip))
  clips.sort(compareClipReadModels)

  const requestedActiveClipId = input.activeClipId ?? null
  const activeClipId = clips.some(({ clip }) => clip.clipId === requestedActiveClipId)
    ? requestedActiveClipId
    : null

  return Object.freeze({
    activeClipId,
    clips: Object.freeze(clips),
    modelRevision: snapshot.modelRevision,
    projectId: snapshot.project.id,
    trackId,
  })
}
