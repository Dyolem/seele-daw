import type {
  AddMidiClipWithNoteCommand,
  ExtendMidiClipWithNoteCommand,
} from '#internal/commands/project-command'
import { ProjectCommandError } from '#internal/commands/project-command-error'
import type { MidiNoteCommandValidationContext } from '#internal/commands/midi-note-command-validation'
import type { MidiClipRecord } from '#internal/model/midi-clip'
import type { MidiNoteRecord } from '#internal/model/midi-note'
import type { MidiSourceRecord } from '#internal/model/midi-source'
import { addTicks } from '#internal/time/tick'

type MidiClipNotePlacementCommand = AddMidiClipWithNoteCommand | ExtendMidiClipWithNoteCommand

export function createPlacementNoteValidationContext(
  command: MidiClipNotePlacementCommand,
  sourceId: MidiSourceRecord['id'],
): MidiNoteCommandValidationContext {
  return {
    baseRevision: command.baseRevision,
    commandType: command.type,
    noteId: command.note.id,
    sourceId,
  }
}

export function assertNoteWithinClipWindow(
  command: MidiClipNotePlacementCommand,
  clip: MidiClipRecord,
  note: MidiNoteRecord,
): void {
  const sourceReadEndTick = addTicks(clip.sourceOffsetTick, clip.spanTick)
  const noteEndTick = addTicks(note.startTick, note.durationTick)

  if (note.startTick >= clip.sourceOffsetTick && noteEndTick <= sourceReadEndTick) return

  throw new ProjectCommandError(
    'note-out-of-clip-range',
    `MIDI Note ${note.id} range [${note.startTick}, ${noteEndTick}) is outside MIDI Clip ${clip.id} source window [${clip.sourceOffsetTick}, ${sourceReadEndTick})`,
    {
      baseRevision: command.baseRevision,
      clipId: clip.id,
      commandType: command.type,
      noteEndTick,
      noteId: note.id,
      noteStartTick: note.startTick,
      sourceId: clip.sourceId,
      sourceReadEndTick,
      sourceReadStartTick: clip.sourceOffsetTick,
    },
  )
}
