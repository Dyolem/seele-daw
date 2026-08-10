import {
  PianoRollError,
  createPianoRollClipContext,
  pianoRollClipTickToSourceTick,
  type PianoRollClipContext,
} from '@seele-daw/editor'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddNoteCommand,
  createMoveNotesCommand,
  createRemoveNotesCommand,
  createResizeNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  type ClipId,
  type MidiClipRecord,
  type MidiPitch,
  type MidiPitchDelta,
  type MidiSourceRecord,
  type ModelRevision,
  type NoteId,
  type ProjectCommit,
  type ProjectSession,
  type Tick,
  type TickDelta,
} from '@seele-daw/project-core'

import type { ActiveProjectService } from '@/workbench/project/active-project-service'
import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { ProjectMidiNoteError } from '@/workbench/project/midi-note/project-midi-note-error'

export const PROJECT_MIDI_NOTE_DEFAULT_VELOCITY = parseMidiVelocity(100)
/** The Project domain stores the product-default UI MIDI Channel 1 as zero-based 0. */
export const PROJECT_MIDI_NOTE_DEFAULT_CHANNEL = parseMidiChannel(0)

export interface ProjectMidiNoteCoordinatorDependencies {
  readonly activeProject: Pick<ActiveProjectService, 'state'>
  readonly createUniqueId: () => string
}

export interface AddMidiNoteInput {
  readonly clipId: ClipId
  /** Already resolved Clip-local start; Pointer and Snap policy stay outside this use case. */
  readonly clipStartTick: Tick
  /** Desired duration, shortened only when the Clip has less positive time remaining. */
  readonly requestedDurationTick: Tick
  readonly pitch: MidiPitch
}

export interface AddedMidiNoteResult {
  readonly commit: ProjectCommit
  readonly noteId: NoteId
}

export interface RemoveMidiNotesInput {
  readonly clipId: ClipId
  readonly noteIds: readonly NoteId[]
}

export interface RemovedMidiNotesResult {
  readonly commit: ProjectCommit
  readonly noteIds: readonly NoteId[]
}

export interface MoveMidiNotesInput {
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
  readonly deltaPitch: MidiPitchDelta
  readonly deltaTick: TickDelta
  readonly noteIds: readonly NoteId[]
}

export interface MovedMidiNotesResult {
  readonly commit: ProjectCommit
  readonly deltaPitch: MidiPitchDelta
  readonly deltaTick: TickDelta
  readonly noteIds: readonly NoteId[]
}

export interface ResizeMidiNoteInput {
  readonly baseRevision: ModelRevision
  readonly clipId: ClipId
  readonly durationTick: Tick
  readonly noteId: NoteId
  /** Final MidiSource-local start resolved by the Editor interaction. */
  readonly sourceStartTick: Tick
}

export interface ResizedMidiNoteResult {
  readonly commit: ProjectCommit
  readonly durationTick: Tick
  readonly noteId: NoteId
  readonly sourceStartTick: Tick
}

export interface ProjectMidiNoteCoordinator {
  addMidiNote(input: AddMidiNoteInput): AddedMidiNoteResult
  moveMidiNotes(input: MoveMidiNotesInput): MovedMidiNotesResult | null
  removeMidiNotes(input: RemoveMidiNotesInput): RemovedMidiNotesResult
  resizeMidiNote(input: ResizeMidiNoteInput): ResizedMidiNoteResult | null
}

function createEditableClipContext(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
): PianoRollClipContext {
  try {
    return createPianoRollClipContext(clip, source)
  } catch (cause) {
    if (!(cause instanceof PianoRollError)) throw cause

    if (cause.code === 'looped-clip-unsupported') {
      throw new ProjectMidiNoteError(
        'target-clip-looped',
        `Cannot edit MIDI Notes because Clip ${clip.id} is looped`,
        { clipId: clip.id, sourceId: source.id },
      )
    }

    throw new ProjectMidiNoteError(
      'target-clip-source-invalid',
      cause.message,
      { clipId: clip.id, sourceId: source.id },
    )
  }
}

interface EditableMidiNoteTarget {
  readonly context: PianoRollClipContext
  readonly session: ProjectSession
}

function requireEditableMidiNoteTarget(
  dependencies: ProjectMidiNoteCoordinatorDependencies,
  clipId: ClipId,
): EditableMidiNoteTarget {
  const activeState = dependencies.activeProject.state
  if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
    throw new ProjectMidiNoteError(
      'active-project-not-ready',
      `Cannot edit MIDI Notes while the Active Project is ${activeState.phase}`,
      { phase: activeState.phase },
    )
  }

  const session = activeState.session
  const snapshot = session.getSnapshot()
  const clip = snapshot.clips.find((candidate) => candidate.id === clipId)
  if (clip === undefined) {
    throw new ProjectMidiNoteError(
      'target-clip-not-found',
      `Cannot edit MIDI Notes because Clip ${clipId} does not exist`,
      { clipId },
    )
  }

  const source = snapshot.midiSources.find(
    (candidate) => candidate.id === clip.sourceId,
  )
  if (source === undefined) {
    throw new ProjectMidiNoteError(
      'target-midi-source-not-found',
      `Cannot edit MIDI Notes because MidiSource ${clip.sourceId} does not exist`,
      { clipId: clip.id, sourceId: clip.sourceId },
    )
  }

  const hasPartition = snapshot.midiNotePartitions.some(
    (candidate) => candidate.sourceId === source.id,
  )
  if (!hasPartition) {
    throw new ProjectMidiNoteError(
      'target-midi-note-partition-not-found',
      `Cannot edit MIDI Notes because MidiSource ${source.id} has no Note partition`,
      { clipId: clip.id, sourceId: source.id },
    )
  }

  return {
    context: createEditableClipContext(clip, source),
    session,
  }
}

class ProjectMidiNoteCoordinatorImpl implements ProjectMidiNoteCoordinator {
  readonly #dependencies: ProjectMidiNoteCoordinatorDependencies

  constructor(dependencies: ProjectMidiNoteCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  addMidiNote(input: AddMidiNoteInput): AddedMidiNoteResult {
    const { context, session } = requireEditableMidiNoteTarget(
      this.#dependencies,
      input.clipId,
    )
    const clipStartTick = parseTick(input.clipStartTick)
    if (clipStartTick >= context.clipSpanTick) {
      throw new ProjectMidiNoteError(
        'note-start-outside-clip',
        `Cannot add a MIDI Note at Clip-local Tick ${clipStartTick} in Clip ${context.clipId}`,
        {
          clipId: context.clipId,
          clipSpanTick: context.clipSpanTick,
          clipStartTick,
          sourceId: context.sourceId,
        },
      )
    }

    const requestedDurationTick = parsePositiveTick(input.requestedDurationTick)
    const remainingDurationTick = parsePositiveTick(
      context.clipSpanTick - clipStartTick,
    )
    const durationTick = parsePositiveTick(
      Math.min(requestedDurationTick, remainingDurationTick),
    )
    const sourceStartTick = pianoRollClipTickToSourceTick(
      context,
      clipStartTick,
    )
    const pitch = parseMidiPitch(input.pitch)
    const noteId = parseNoteId(this.#dependencies.createUniqueId())
    const result = session.execute(
      createAddNoteCommand({
        baseRevision: session.modelRevision,
        sourceId: context.sourceId,
        noteId,
        startTick: sourceStartTick,
        durationTick,
        pitch,
        velocity: PROJECT_MIDI_NOTE_DEFAULT_VELOCITY,
        channel: PROJECT_MIDI_NOTE_DEFAULT_CHANNEL,
      }),
    )

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('AddNoteCommand unexpectedly produced no Project change')
    }

    return Object.freeze({
      commit: result.commit,
      noteId,
    })
  }

  removeMidiNotes(input: RemoveMidiNotesInput): RemovedMidiNotesResult {
    const { context, session } = requireEditableMidiNoteTarget(
      this.#dependencies,
      input.clipId,
    )
    const command = createRemoveNotesCommand({
      baseRevision: session.modelRevision,
      sourceId: context.sourceId,
      noteIds: input.noteIds,
    })
    const result = session.execute(command)

    if (result.status !== PROJECT_COMMAND_EXECUTION_STATUS.COMMITTED) {
      throw new Error('RemoveNotesCommand unexpectedly produced no Project change')
    }

    return Object.freeze({
      commit: result.commit,
      noteIds: command.noteIds,
    })
  }

  moveMidiNotes(input: MoveMidiNotesInput): MovedMidiNotesResult | null {
    const { context, session } = requireEditableMidiNoteTarget(
      this.#dependencies,
      input.clipId,
    )
    const command = createMoveNotesCommand({
      baseRevision: input.baseRevision,
      sourceId: context.sourceId,
      noteIds: input.noteIds,
      deltaTick: input.deltaTick,
      deltaPitch: input.deltaPitch,
    })
    const result = session.execute(command)

    if (result.status === PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE) return null

    return Object.freeze({
      commit: result.commit,
      deltaPitch: command.deltaPitch,
      deltaTick: command.deltaTick,
      noteIds: command.noteIds,
    })
  }

  resizeMidiNote(input: ResizeMidiNoteInput): ResizedMidiNoteResult | null {
    const { context, session } = requireEditableMidiNoteTarget(
      this.#dependencies,
      input.clipId,
    )
    const command = createResizeNoteCommand({
      baseRevision: input.baseRevision,
      sourceId: context.sourceId,
      noteId: input.noteId,
      startTick: input.sourceStartTick,
      durationTick: input.durationTick,
    })
    const result = session.execute(command)

    if (result.status === PROJECT_COMMAND_EXECUTION_STATUS.NO_CHANGE) return null

    return Object.freeze({
      commit: result.commit,
      durationTick: command.durationTick,
      noteId: command.noteId,
      sourceStartTick: command.startTick,
    })
  }
}

/** Creates one framework-neutral MIDI Note command coordinator for the Active Project. */
export function createProjectMidiNoteCoordinator(
  dependencies: ProjectMidiNoteCoordinatorDependencies,
): ProjectMidiNoteCoordinator {
  return Object.freeze(new ProjectMidiNoteCoordinatorImpl(dependencies))
}
