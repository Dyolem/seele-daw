import type { ExtendMidiClipWithNoteCommand } from '#internal/commands/project-command'
import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { ReadyProjectCommandPreparation } from '#internal/commands/project-command-preparation'
import {
  assertNoteWithinClipWindow,
  createPlacementNoteValidationContext,
} from '#internal/commands/midi-clip-note-placement/note-placement-validation'
import {
  assertMidiNoteIdAvailable,
  assertMidiNoteWithinSource,
} from '#internal/commands/midi-note-command-validation'
import { createMidiClipRecord, type MidiClipRecord } from '#internal/model/midi-clip'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import { PROJECT_MUTATION_TYPE } from '#internal/mutation/mutation-type'
import { addTicks, parseTick, type Tick } from '#internal/time/tick'

function requireExtensionClip(
  reader: ModelStoreReader,
  command: ExtendMidiClipWithNoteCommand,
): MidiClipRecord {
  const clip = reader.getClip(command.clipId)

  if (clip === undefined) {
    throw new ProjectCommandError('clip-not-found', `MIDI Clip ${command.clipId} does not exist`, {
      baseRevision: command.baseRevision,
      clipId: command.clipId,
      commandType: command.type,
      noteId: command.note.id,
    })
  }

  if (clip.loop !== null) {
    throw new ProjectCommandError(
      'looped-midi-clip-unsupported',
      `MIDI Clip ${clip.id} cannot be automatically extended while looped`,
      {
        baseRevision: command.baseRevision,
        clipId: clip.id,
        commandType: command.type,
        noteId: command.note.id,
        sourceId: clip.sourceId,
        trackId: clip.trackId,
      },
    )
  }

  return clip
}

function requireExtensionSource(
  reader: ModelStoreReader,
  command: ExtendMidiClipWithNoteCommand,
  clip: MidiClipRecord,
): MidiSourceRecord {
  const source = reader.getMidiSource(clip.sourceId)

  if (source === undefined) {
    throw new ProjectCommandError(
      'midi-source-not-found',
      `MidiSource ${clip.sourceId} does not exist`,
      {
        baseRevision: command.baseRevision,
        clipId: clip.id,
        commandType: command.type,
        noteId: command.note.id,
        sourceId: clip.sourceId,
        trackId: clip.trackId,
      },
    )
  }

  if (!reader.hasMidiNotePartition(source.id)) {
    throw new ProjectCommandError(
      'midi-note-partition-missing',
      `MidiSource ${source.id} does not have a MIDI Note partition`,
      {
        baseRevision: command.baseRevision,
        clipId: clip.id,
        commandType: command.type,
        noteId: command.note.id,
        sourceId: source.id,
        trackId: clip.trackId,
      },
    )
  }

  return source
}

function extensionEndTick(
  command: ExtendMidiClipWithNoteCommand,
  clip: MidiClipRecord,
  startTick: Tick,
): Tick {
  const endTick = startTick + command.spanTick

  if (Number.isSafeInteger(endTick)) return parseTick(endTick)

  throw new ProjectCommandError(
    'midi-clip-extension-out-of-range',
    `MIDI Clip ${clip.id} cannot extend by Span ${command.spanTick} from Tick ${startTick}`,
    {
      baseRevision: command.baseRevision,
      clipId: clip.id,
      commandType: command.type,
      noteId: command.note.id,
      sourceId: clip.sourceId,
      targetSpanTick: command.spanTick,
      trackId: clip.trackId,
    },
  )
}

function findBlockingClip(
  reader: ModelStoreReader,
  clip: MidiClipRecord,
  currentEndTick: Tick,
): MidiClipRecord | undefined {
  let blocker: MidiClipRecord | undefined

  for (const [, candidate] of reader.clipEntries()) {
    if (
      candidate.id === clip.id ||
      candidate.trackId !== clip.trackId ||
      candidate.startTick < currentEndTick
    ) {
      continue
    }

    if (
      blocker === undefined ||
      candidate.startTick < blocker.startTick ||
      (candidate.startTick === blocker.startTick && candidate.id < blocker.id)
    ) {
      blocker = candidate
    }
  }

  return blocker
}

function assertExtensionDoesNotCrossNextClip(
  reader: ModelStoreReader,
  command: ExtendMidiClipWithNoteCommand,
  clip: MidiClipRecord,
  currentEndTick: Tick,
  targetEndTick: Tick,
): void {
  const blocker = findBlockingClip(reader, clip, currentEndTick)
  if (blocker === undefined || targetEndTick <= blocker.startTick) return

  throw new ProjectCommandError(
    'midi-clip-extension-crosses-next-clip',
    `MIDI Clip ${clip.id} cannot extend through Tick ${targetEndTick} across next Clip ${blocker.id} at Tick ${blocker.startTick}`,
    {
      baseRevision: command.baseRevision,
      blockingClipId: blocker.id,
      clipEndTick: targetEndTick,
      clipId: clip.id,
      commandType: command.type,
      noteId: command.note.id,
      sourceId: clip.sourceId,
      targetSpanTick: command.spanTick,
      trackId: clip.trackId,
    },
  )
}

function createExtendedClip(
  command: ExtendMidiClipWithNoteCommand,
  before: MidiClipRecord,
): MidiClipRecord {
  return createMidiClipRecord({
    ...before,
    spanTick: command.spanTick,
  })
}

function createExtendedSource(
  before: MidiSourceRecord,
  requiredLengthTick: Tick,
): MidiSourceRecord | null {
  if (requiredLengthTick <= before.lengthTick) return null

  return createMidiSourceRecord({
    id: before.id,
    lengthTick: requiredLengthTick,
  })
}

/** Plans one right-edge Clip extension and its triggering Note as one reversible commit. */
export function prepareExtendMidiClipWithNoteCommand(
  reader: ModelStoreReader,
  command: ExtendMidiClipWithNoteCommand,
): ReadyProjectCommandPreparation {
  const beforeClip = requireExtensionClip(reader, command)
  const beforeSource = requireExtensionSource(reader, command, beforeClip)
  const context = createPlacementNoteValidationContext(command, beforeSource.id)

  if (command.spanTick <= beforeClip.spanTick) {
    throw new ProjectCommandError(
      'midi-clip-extension-not-rightward',
      `MIDI Clip ${beforeClip.id} target Span ${command.spanTick} must exceed current Span ${beforeClip.spanTick}`,
      {
        ...context,
        clipId: beforeClip.id,
        targetSpanTick: command.spanTick,
        trackId: beforeClip.trackId,
      },
    )
  }

  const currentEndTick = addTicks(beforeClip.startTick, beforeClip.spanTick)
  const targetEndTick = extensionEndTick(command, beforeClip, beforeClip.startTick)
  const currentSourceReadEndTick = addTicks(beforeClip.sourceOffsetTick, beforeClip.spanTick)
  const targetSourceReadEndTick = extensionEndTick(command, beforeClip, beforeClip.sourceOffsetTick)
  const noteEndTick = addTicks(command.note.startTick, command.note.durationTick)

  if (noteEndTick <= currentSourceReadEndTick) {
    throw new ProjectCommandError(
      'midi-clip-extension-not-required',
      `MIDI Note ${command.note.id} ends inside the existing MIDI Clip ${beforeClip.id} window`,
      {
        ...context,
        clipEndTick: currentEndTick,
        clipId: beforeClip.id,
        noteEndTick,
        targetSpanTick: command.spanTick,
        trackId: beforeClip.trackId,
      },
    )
  }

  assertExtensionDoesNotCrossNextClip(reader, command, beforeClip, currentEndTick, targetEndTick)

  const afterClip = createExtendedClip(command, beforeClip)
  const afterSource = createExtendedSource(beforeSource, targetSourceReadEndTick)
  const effectiveSource = afterSource ?? beforeSource

  assertMidiNoteIdAvailable(reader, context)
  assertMidiNoteWithinSource(context, effectiveSource, command.note)
  assertNoteWithinClipWindow(command, afterClip, command.note)

  const mutations: ProjectMutation[] = []
  if (afterSource !== null) {
    mutations.push({
      type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
      before: beforeSource,
      after: afterSource,
    })
  }
  mutations.push(
    {
      type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
      before: beforeClip,
      after: afterClip,
    },
    {
      type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
      sourceId: beforeSource.id,
      after: command.note,
    },
  )

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, mutations),
  }
}
