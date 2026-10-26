import type { ExtendMidiClipWithNoteCommand } from '#internal/commands/protocol/project-command'
import { ProjectCommandError } from '#internal/commands/protocol/project-command-error'
import type { ReadyProjectCommandPreparation } from '#internal/commands/preparation/project-command-preparation'
import {
  assertNoteWithinClipWindow,
  createPlacementNoteValidationContext,
} from '#internal/commands/midi-clip-note-placement/note-placement-validation'
import {
  assertMidiNoteIdAvailable,
  assertMidiNoteWithinSource,
} from '#internal/commands/midi-note/command-validation'
import { createMidiClipRecord, type MidiClipRecord } from '#internal/model/midi-clip'
import { createMidiSourceRecord, type MidiSourceRecord } from '#internal/model/midi-source'
import type { ModelStoreReader } from '#internal/model/model-store'
import { createMutationPlan } from '#internal/mutation/mutation-plan'
import type { ProjectChange } from '#internal/mutation/project-change'
import { addTicks, parseTick, type Tick } from '#internal/time/tick'

function requireExtensionClip(
  reader: ModelStoreReader,
  command: ExtendMidiClipWithNoteCommand,
): MidiClipRecord {
  const clip = reader.getClip(command.clipId)

  if (clip === undefined) {
    throw new ProjectCommandError('clip-not-found', `MIDI Clip ${command.clipId} does not exist`)
  }

  if (clip.loop !== null) {
    throw new ProjectCommandError(
      'looped-midi-clip-unsupported',
      `MIDI Clip ${clip.id} cannot be automatically extended while looped`,
    )
  }

  return clip
}

/** A Clip's Source always exists, with its partitions. */
function requireExtensionSource(reader: ModelStoreReader, clip: MidiClipRecord): MidiSourceRecord {
  return reader.getMidiSource(clip.sourceId)!
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
  const beforeSource = requireExtensionSource(reader, beforeClip)
  const context = createPlacementNoteValidationContext(command, beforeSource.id)

  if (command.spanTick <= beforeClip.spanTick) {
    throw new ProjectCommandError(
      'midi-clip-extension-not-rightward',
      `MIDI Clip ${beforeClip.id} target Span ${command.spanTick} must exceed current Span ${beforeClip.spanTick}`,
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
    )
  }

  assertExtensionDoesNotCrossNextClip(reader, command, beforeClip, currentEndTick, targetEndTick)

  const afterClip = createExtendedClip(command, beforeClip)
  const afterSource = createExtendedSource(beforeSource, targetSourceReadEndTick)
  const effectiveSource = afterSource ?? beforeSource

  assertMidiNoteIdAvailable(reader, context)
  assertMidiNoteWithinSource(context, effectiveSource, command.note)
  assertNoteWithinClipWindow(command, afterClip, command.note)

  const changes: ProjectChange[] = []
  if (afterSource !== null) {
    changes.push({
      op: 'replace',
      table: 'midiSources',
      before: beforeSource,
      after: afterSource,
    })
  }
  changes.push(
    {
      op: 'replace',
      table: 'clips',
      before: beforeClip,
      after: afterClip,
    },
    {
      op: 'insert',
      table: 'midiNotes',
      sourceId: beforeSource.id,
      after: command.note,
    },
  )

  return {
    status: 'ready',
    command,
    plan: createMutationPlan(command.baseRevision, changes),
  }
}
