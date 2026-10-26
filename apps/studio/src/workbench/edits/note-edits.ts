import {
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION,
  PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS,
  createPianoRollClipContext,
  createPianoRollTrackReadModel,
  pianoRollClipTickToSourceTick,
  resolvePianoRollTrackNotePlacement,
  type PianoRollClipContext,
  type PianoRollTrackNotePlacementAction,
} from '@seele-daw/editor'
import {
  ZERO_TICK,
  createAddMidiClipWithNoteCommand,
  createAddNoteCommand,
  createExtendMidiClipWithNoteCommand,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseClipId,
  parseMidiChannel,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  type ClipId,
  type MidiPitch,
  type MidiPitchDelta,
  type ModelRevision,
  type NoteId,
  type ProjectCommit,
  type ProjectSnapshot,
  type Tick,
  type TickDelta,
  type TrackId,
} from '@seele-daw/project-core'

import {
  ProjectEditError,
  executeEdit,
  executeRequiredEdit,
  requireEditSession,
  staleEdit,
  type EditAuthority,
  type ProjectEditContext,
} from '@/workbench/edits/edit-session'

export const DEFAULT_NOTE_VELOCITY = parseMidiVelocity(100)
/** The Project stores the product-default UI MIDI Channel 1 as zero-based 0. */
export const DEFAULT_NOTE_CHANNEL = parseMidiChannel(0)

/** A Clip edit captured by a gesture against one Session revision. */
interface CapturedClipTarget {
  readonly expectedSession: object
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
}

export interface AddNoteInput extends CapturedClipTarget {
  /** Clip-local start already resolved by the editor; snapping stays outside this use case. */
  readonly clipStartTick: Tick
  /** Shortened only when the Clip has less time remaining. */
  readonly requestedDurationTick: Tick
  readonly pitch: MidiPitch
}

export interface MoveNotesInput extends CapturedClipTarget {
  readonly deltaPitch: MidiPitchDelta
  readonly deltaTick: TickDelta
  readonly noteIds: readonly NoteId[]
}

export interface ResizeNoteInput extends CapturedClipTarget {
  readonly durationTick: Tick
  readonly noteId: NoteId
  /** Final MidiSource-local start resolved by the editor. */
  readonly sourceStartTick: Tick
}

export interface RemoveNotesInput {
  readonly clipId: ClipId
  readonly noteIds: readonly NoteId[]
}

export interface PlaceNoteOnTrackInput {
  readonly expectedSession?: object
  readonly baseRevision: ModelRevision
  readonly activeClipId: ClipId | null
  readonly barSpanTick: Tick
  readonly noteDurationTick: Tick
  readonly pitch: MidiPitch
  readonly projectStartTick: Tick
  readonly trackId: TrackId
}

export interface PlacedNote {
  readonly action: PianoRollTrackNotePlacementAction
  readonly clipId: ClipId
  readonly commit: ProjectCommit
  readonly noteId: NoteId
}

function editableClip(snapshot: ProjectSnapshot, clipId: ClipId): PianoRollClipContext {
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  if (clip === undefined) throw staleEdit()
  const source = snapshot.midiSources.find((candidate) => candidate.id === clip.sourceId)!
  const editable = createPianoRollClipContext(clip, source)
  if (editable === null) {
    throw new ProjectEditError('unsupported', 'Notes in looped Clips cannot be edited yet.')
  }
  return editable
}

export function createNoteEdits(context: Omit<ProjectEditContext, 'random'>) {
  function clipTarget(target: EditAuthority & { readonly clipId: ClipId }) {
    const session = requireEditSession(context, target)
    return { clip: editableClip(session.getSnapshot(), target.clipId), session }
  }

  return {
    add(input: AddNoteInput): { readonly commit: ProjectCommit; readonly noteId: NoteId } {
      const { clip, session } = clipTarget(input)
      if (input.clipStartTick >= clip.clipSpanTick) {
        throw new ProjectEditError('not-placeable', 'A note must start inside its Clip.')
      }
      const durationTick = parsePositiveTick(
        Math.min(
          parsePositiveTick(input.requestedDurationTick),
          clip.clipSpanTick - input.clipStartTick,
        ),
      )
      const noteId = parseNoteId(context.createId())
      const commit = executeRequiredEdit(
        session,
        createAddNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: clip.sourceId,
          noteId,
          startTick: pianoRollClipTickToSourceTick(clip, input.clipStartTick),
          durationTick,
          pitch: input.pitch,
          velocity: DEFAULT_NOTE_VELOCITY,
          channel: DEFAULT_NOTE_CHANNEL,
        }),
      )
      return { commit, noteId }
    },

    move(input: MoveNotesInput): ProjectCommit | null {
      const { clip, session } = clipTarget(input)
      return executeEdit(
        session,
        createMoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: clip.sourceId,
          noteIds: input.noteIds,
          deltaTick: input.deltaTick,
          deltaPitch: input.deltaPitch,
        }),
      )
    },

    resize(input: ResizeNoteInput): ProjectCommit | null {
      const { clip, session } = clipTarget(input)
      return executeEdit(
        session,
        createResizeNoteCommand({
          baseRevision: session.modelRevision,
          sourceId: clip.sourceId,
          noteId: input.noteId,
          startTick: input.sourceStartTick,
          durationTick: input.durationTick,
        }),
      )
    },

    remove(input: RemoveNotesInput): ProjectCommit {
      const { clip, session } = clipTarget(input)
      return executeRequiredEdit(
        session,
        createRemoveNotesCommand({
          baseRevision: session.modelRevision,
          sourceId: clip.sourceId,
          noteIds: input.noteIds,
        }),
      )
    },

    /** Adds to, extends, or creates a Clip, as the editor's placement policy decides. */
    placeOnTrack(input: PlaceNoteOnTrackInput): PlacedNote {
      const session = requireEditSession(context, input)
      const snapshot = session.getSnapshot()
      const placement = resolvePianoRollTrackNotePlacement({
        barSpanTick: input.barSpanTick,
        noteDurationTick: input.noteDurationTick,
        projectStartTick: input.projectStartTick,
        readModel: createPianoRollTrackReadModel({
          activeClipId: input.activeClipId,
          snapshot,
          trackId: input.trackId,
        }),
      })
      if (placement.status === PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED) {
        throw new ProjectEditError('not-placeable', placement.message)
      }

      const note = {
        noteChannel: DEFAULT_NOTE_CHANNEL,
        noteDurationTick: placement.noteDurationTick,
        noteId: parseNoteId(context.createId()),
        notePitch: input.pitch,
        noteStartTick: placement.sourceStartTick,
        noteVelocity: DEFAULT_NOTE_VELOCITY,
      }
      let clipId: ClipId
      let commit: ProjectCommit
      switch (placement.action) {
        case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP: {
          const clip = snapshot.clips.find(({ id }) => id === placement.clipId)
          if (clip === undefined) throw staleEdit()
          clipId = clip.id
          commit = executeRequiredEdit(
            session,
            createAddNoteCommand({
              baseRevision: session.modelRevision,
              sourceId: clip.sourceId,
              noteId: note.noteId,
              startTick: note.noteStartTick,
              durationTick: note.noteDurationTick,
              pitch: note.notePitch,
              velocity: note.noteVelocity,
              channel: note.noteChannel,
            }),
          )
          break
        }
        case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP: {
          const track = snapshot.tracks.find(({ id }) => id === input.trackId)
          if (track === undefined) throw staleEdit()
          clipId = parseClipId(context.createId())
          commit = executeRequiredEdit(
            session,
            createAddMidiClipWithNoteCommand({
              ...note,
              baseRevision: session.modelRevision,
              clipId,
              color: null,
              loop: null,
              muted: false,
              name: track.name,
              sourceId: parseMidiSourceId(context.createId()),
              sourceLengthTick: placement.clipSpanTick,
              sourceOffsetTick: ZERO_TICK,
              spanTick: placement.clipSpanTick,
              startTick: placement.clipStartTick,
              trackId: track.id,
            }),
          )
          break
        }
        case PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP:
          clipId = placement.clipId
          commit = executeRequiredEdit(
            session,
            createExtendMidiClipWithNoteCommand({
              ...note,
              baseRevision: session.modelRevision,
              clipId,
              spanTick: placement.targetClipSpanTick,
            }),
          )
          break
      }
      return { action: placement.action, clipId, commit, noteId: note.noteId }
    },
  }
}

export type NoteEdits = ReturnType<typeof createNoteEdits>
