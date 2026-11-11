import {
  addTicks,
  diffSnapshotRecords,
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
  createPianoRollTrackClipProjection,
  pianoRollTrackSourceTickToProjectTick,
  type PianoRollTrackClipProjection,
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
  clip: PianoRollTrackClipProjection,
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

interface ClipReadModelMemo {
  readonly source: MidiSourceRecord
  readonly notes: readonly MidiNoteRecord[]
  readonly readModel: PianoRollTrackClipReadModel
}

/**
 * Each Clip's read model, kept while its record, its Source record and its Note array are the
 * same. Snapshots share those across revisions (ADR-007), so an edit rebuilds only the Clip it
 * touched, and inside it only the Notes that were written (ADR-010).
 */
const clipReadModels = new WeakMap<MidiClipRecord, ClipReadModelMemo>()

function projectNotes(
  clip: PianoRollTrackClipProjection,
  notes: readonly MidiNoteRecord[],
): PianoRollTrackNoteProjection[] {
  const projections: PianoRollTrackNoteProjection[] = []
  for (const note of notes) {
    const projection = createNoteProjection(clip, note)
    if (projection !== null) projections.push(projection)
  }
  return projections.sort(compareNoteProjections)
}

/** The previous projections with those of removed or rewritten Notes dropped and new ones merged in. */
function updateNoteProjections(
  memo: ClipReadModelMemo,
  clip: PianoRollTrackClipProjection,
  notes: readonly MidiNoteRecord[],
): readonly PianoRollTrackNoteProjection[] {
  const { droppedIds, written: writtenNotes } = diffSnapshotRecords(memo.notes, notes)
  const writtenProjections = projectNotes(clip, writtenNotes)
  const projections: PianoRollTrackNoteProjection[] = []
  let written = 0
  for (const projection of memo.readModel.notes) {
    if (droppedIds.has(projection.note.id)) continue
    while (
      written < writtenProjections.length &&
      compareNoteProjections(writtenProjections[written]!, projection) < 0
    ) {
      projections.push(writtenProjections[written++]!)
    }
    projections.push(projection)
  }
  while (written < writtenProjections.length) projections.push(writtenProjections[written++]!)
  return Object.freeze(projections)
}

function createClipReadModel(
  snapshot: ProjectSnapshot,
  sources: ReadonlyMap<MidiSourceId, MidiSourceRecord>,
  clip: MidiClipRecord,
): PianoRollTrackClipReadModel {
  const source = sources.get(clip.sourceId)!
  const notes = snapshot.midiNotes[clip.sourceId]!
  const memo = clipReadModels.get(clip)
  if (memo?.source === source && memo.notes === notes) return memo.readModel

  const sameWindow = memo?.source === source
  const projection = sameWindow
    ? memo.readModel.clip
    : createPianoRollTrackClipProjection(clip, source)
  const noteProjections = sameWindow
    ? updateNoteProjections(memo, projection, notes)
    : Object.freeze(projectNotes(projection, notes))
  const readModel = Object.freeze({ clip: projection, notes: noteProjections })
  clipReadModels.set(clip, { source, notes, readModel })
  return readModel
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
