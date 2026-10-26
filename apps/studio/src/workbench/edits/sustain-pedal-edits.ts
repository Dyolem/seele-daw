import {
  createPianoRollClipContext,
  pianoRollClipTickToSourceTick,
  type PianoRollClipContext,
} from '@seele-daw/editor'
import {
  createAddMidiSustainPedalEventCommand,
  createMoveMidiSustainPedalEventsCommand,
  createRemoveMidiSustainPedalEventsCommand,
  createReplaceMidiSustainPedalEventValueCommand,
  parseMidiSustainPedalEventId,
  parseTick,
  type ClipId,
  type MidiChannel,
  type MidiClipRecord,
  type MidiControlValue,
  type MidiSustainPedalEventId,
  type ModelRevision,
  type ProjectCommit,
  type ProjectSession,
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
  type ProjectEditContext,
} from '@/workbench/edits/edit-session'

interface EventEditTarget {
  readonly expectedSession?: object
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
}

export interface PlaceSustainPedalEventInClipInput extends EventEditTarget {
  readonly channel: MidiChannel
  readonly clipTick: Tick
  readonly value: MidiControlValue
}

export interface PlaceSustainPedalEventOnTrackInput {
  readonly expectedSession?: object
  readonly baseRevision: ModelRevision
  readonly activeClipId: ClipId | null
  readonly channel: MidiChannel
  readonly projectTick: Tick
  readonly trackId: TrackId
  readonly value: MidiControlValue
}

export interface MoveSustainPedalEventsInput extends EventEditTarget {
  readonly deltaTick: TickDelta
  readonly eventIds: readonly MidiSustainPedalEventId[]
}

export interface RemoveSustainPedalEventsInput extends EventEditTarget {
  readonly eventIds: readonly MidiSustainPedalEventId[]
}

export interface ReplaceSustainPedalEventValueInput extends EventEditTarget {
  readonly eventId: MidiSustainPedalEventId
  readonly value: MidiControlValue
}

export interface PlacedSustainPedalEvent {
  readonly clipId: ClipId
  readonly commit: ProjectCommit
  readonly eventId: MidiSustainPedalEventId
}

function unloopedClip(snapshot: ProjectSnapshot, clipId: ClipId): MidiClipRecord {
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  if (clip === undefined) throw staleEdit()
  if (clip.loop !== null) {
    throw new ProjectEditError(
      'unsupported',
      'Sustain Pedal events in looped Clips cannot be edited yet.',
    )
  }
  return clip
}

/** The window of an unlooped Clip over its MidiSource. */
function clipWindow(snapshot: ProjectSnapshot, clip: MidiClipRecord): PianoRollClipContext {
  const source = snapshot.midiSources.find(({ id }) => id === clip.sourceId)!
  return createPianoRollClipContext(clip, source)!
}

/** An event may sit on either end of its Clip, never outside it. */
function insideClip(window: PianoRollClipContext, clipTick: number): Tick {
  if (clipTick < 0 || clipTick > window.clipSpanTick) {
    throw new ProjectEditError('not-placeable', 'Sustain Pedal events must be inside the Clip.')
  }
  return pianoRollClipTickToSourceTick(window, parseTick(clipTick))
}

export function createSustainPedalEdits(context: Omit<ProjectEditContext, 'random'>) {
  function place(
    session: ProjectSession,
    clip: MidiClipRecord,
    input: {
      readonly channel: MidiChannel
      readonly sourceTick: Tick
      readonly value: MidiControlValue
    },
  ): PlacedSustainPedalEvent {
    const eventId = parseMidiSustainPedalEventId(context.createId())
    const commit = executeRequiredEdit(
      session,
      createAddMidiSustainPedalEventCommand({
        baseRevision: session.modelRevision,
        channel: input.channel,
        eventId,
        sourceId: clip.sourceId,
        tick: input.sourceTick,
        value: input.value,
      }),
    )
    return { clipId: clip.id, commit, eventId }
  }

  function eventTarget(input: EventEditTarget) {
    const session = requireEditSession(context, input)
    return { clip: unloopedClip(session.getSnapshot(), input.clipId), session }
  }

  return {
    placeInClip(input: PlaceSustainPedalEventInClipInput): PlacedSustainPedalEvent {
      const { clip, session } = eventTarget(input)
      return place(session, clip, {
        channel: input.channel,
        sourceTick: insideClip(clipWindow(session.getSnapshot(), clip), input.clipTick),
        value: input.value,
      })
    },

    /** Track scope writes only through the Active Clip the user chose. */
    placeOnTrack(input: PlaceSustainPedalEventOnTrackInput): PlacedSustainPedalEvent {
      const session = requireEditSession(context, input)
      if (input.activeClipId === null) {
        throw new ProjectEditError(
          'unsupported',
          'Choose an Active Clip before adding Sustain Pedal events in Track Scope.',
        )
      }
      const snapshot = session.getSnapshot()
      const clip = unloopedClip(snapshot, input.activeClipId)
      if (clip.trackId !== input.trackId) throw staleEdit()
      return place(session, clip, {
        channel: input.channel,
        sourceTick: insideClip(clipWindow(snapshot, clip), input.projectTick - clip.startTick),
        value: input.value,
      })
    },

    move(input: MoveSustainPedalEventsInput): ProjectCommit | null {
      const { clip, session } = eventTarget(input)
      return executeEdit(
        session,
        createMoveMidiSustainPedalEventsCommand({
          baseRevision: session.modelRevision,
          deltaTick: input.deltaTick,
          eventIds: input.eventIds,
          sourceId: clip.sourceId,
        }),
      )
    },

    remove(input: RemoveSustainPedalEventsInput): ProjectCommit {
      const { clip, session } = eventTarget(input)
      return executeRequiredEdit(
        session,
        createRemoveMidiSustainPedalEventsCommand({
          baseRevision: session.modelRevision,
          eventIds: input.eventIds,
          sourceId: clip.sourceId,
        }),
      )
    },

    replaceValue(input: ReplaceSustainPedalEventValueInput): ProjectCommit | null {
      const { clip, session } = eventTarget(input)
      return executeEdit(
        session,
        createReplaceMidiSustainPedalEventValueCommand({
          baseRevision: session.modelRevision,
          eventId: input.eventId,
          sourceId: clip.sourceId,
          value: input.value,
        }),
      )
    },
  }
}

export type SustainPedalEdits = ReturnType<typeof createSustainPedalEdits>
