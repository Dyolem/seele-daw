import {
  PianoRollError,
  createPianoRollClipContext,
  pianoRollClipTickToSourceTick,
  type PianoRollClipContext,
} from '@seele-daw/editor'
import {
  PROJECT_COMMAND_EXECUTION_STATUS,
  createAddNoteCommand,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiVelocity,
  parseNoteId,
  parsePositiveTick,
  parseTick,
  type ClipId,
  type MidiClipRecord,
  type MidiPitch,
  type MidiSourceRecord,
  type NoteId,
  type ProjectCommit,
  type Tick,
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

export interface ProjectMidiNoteCoordinator {
  addMidiNote(input: AddMidiNoteInput): AddedMidiNoteResult
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
        `Cannot add a MIDI Note because Clip ${clip.id} is looped`,
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

class ProjectMidiNoteCoordinatorImpl implements ProjectMidiNoteCoordinator {
  readonly #dependencies: ProjectMidiNoteCoordinatorDependencies

  constructor(dependencies: ProjectMidiNoteCoordinatorDependencies) {
    this.#dependencies = dependencies
  }

  addMidiNote(input: AddMidiNoteInput): AddedMidiNoteResult {
    const activeState = this.#dependencies.activeProject.state

    if (activeState.phase !== ACTIVE_PROJECT_PHASE.READY) {
      throw new ProjectMidiNoteError(
        'active-project-not-ready',
        `Cannot add a MIDI Note while the Active Project is ${activeState.phase}`,
        { phase: activeState.phase },
      )
    }

    const session = activeState.session
    const snapshot = session.getSnapshot()
    const clip = snapshot.clips.find((candidate) => candidate.id === input.clipId)

    if (clip === undefined) {
      throw new ProjectMidiNoteError(
        'target-clip-not-found',
        `Cannot add a MIDI Note because Clip ${input.clipId} does not exist`,
        { clipId: input.clipId },
      )
    }

    const source = snapshot.midiSources.find(
      (candidate) => candidate.id === clip.sourceId,
    )
    if (source === undefined) {
      throw new ProjectMidiNoteError(
        'target-midi-source-not-found',
        `Cannot add a MIDI Note because MidiSource ${clip.sourceId} does not exist`,
        { clipId: clip.id, sourceId: clip.sourceId },
      )
    }

    const hasPartition = snapshot.midiNotePartitions.some(
      (candidate) => candidate.sourceId === source.id,
    )
    if (!hasPartition) {
      throw new ProjectMidiNoteError(
        'target-midi-note-partition-not-found',
        `Cannot add a MIDI Note because MidiSource ${source.id} has no Note partition`,
        { clipId: clip.id, sourceId: source.id },
      )
    }

    const context = createEditableClipContext(clip, source)
    const clipStartTick = parseTick(input.clipStartTick)
    if (clipStartTick >= context.clipSpanTick) {
      throw new ProjectMidiNoteError(
        'note-start-outside-clip',
        `Cannot add a MIDI Note at Clip-local Tick ${clipStartTick} in Clip ${clip.id}`,
        {
          clipId: clip.id,
          clipSpanTick: context.clipSpanTick,
          clipStartTick,
          sourceId: source.id,
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
}

/** Creates one framework-neutral MIDI Note command coordinator for the Active Project. */
export function createProjectMidiNoteCoordinator(
  dependencies: ProjectMidiNoteCoordinatorDependencies,
): ProjectMidiNoteCoordinator {
  return Object.freeze(new ProjectMidiNoteCoordinatorImpl(dependencies))
}
