import type { MidiFileDocument, MidiFileNote, MidiFileTrack } from '@seele-daw/midi-file'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  type ProjectMidiImportDiagnostic,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import { createDiagnostic, normalizeEntityName } from '#internal/import/import-support'
import { convertMidiTickToProjectTick } from '#internal/import/ppq-converter'

const SUSTAIN_PEDAL_CONTROLLER = 64

interface AbsoluteMappedNote {
  readonly sourceNoteIndex: number
  readonly startTick: number
  readonly endTick: number
  readonly durationExpanded: boolean
  readonly pitch: number
  readonly velocity: number
  readonly channel: number
}

export interface MappedTrack {
  readonly sourceTrack: MidiFileTrack
  readonly sourceTrackIndex: number
  readonly importedTrackIndex: number
  readonly name: string
  readonly startTick: number
  readonly spanTick: number
  readonly notes: readonly AbsoluteMappedNote[]
}

function addUnsupportedFactDiagnostics(
  track: MidiFileTrack,
  sourceTrackIndex: number,
  imported: boolean,
  diagnostics: ProjectMidiImportDiagnostic[],
): void {
  const sustainEventCount = track.controlChanges.filter(
    (event) => event.controller === SUSTAIN_PEDAL_CONTROLLER,
  ).length
  const otherControlChanges = track.controlChanges.filter(
    (event) => event.controller !== SUSTAIN_PEDAL_CONTROLLER,
  )

  if (sustainEventCount > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.SUSTAIN_PEDAL_NOT_IMPORTED,
        message:
          'Sustain pedal CC64 was not baked into note durations or imported as a Project fact.',
        sourceTrackIndex,
        eventCount: sustainEventCount,
        controllerNumbers: [SUSTAIN_PEDAL_CONTROLLER],
      }),
    )
  }
  if (otherControlChanges.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.CONTROL_CHANGES_NOT_IMPORTED,
        message: 'Control-change events other than sustain are not Project facts in V1.',
        sourceTrackIndex,
        eventCount: otherControlChanges.length,
        controllerNumbers: [...new Set(otherControlChanges.map((event) => event.controller))].sort(
          (left, right) => left - right,
        ),
      }),
    )
  }
  if (track.pitchBends.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PITCH_BENDS_NOT_IMPORTED,
        message: 'Pitch-bend events are not Project facts in V1 and were not imported.',
        sourceTrackIndex,
        eventCount: track.pitchBends.length,
      }),
    )
  }
  if (imported && track.programNumber !== 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_NOT_APPLIED,
        message:
          'The MIDI program was retained only as an import diagnostic; the supplied default instrument was used.',
        sourceTrackIndex,
        sourceProgramNumber: track.programNumber,
      }),
    )
  }

  const releaseVelocityCount = track.notes.filter((note) => note.releaseVelocity !== 0).length
  if (imported && releaseVelocityCount > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.RELEASE_VELOCITIES_NOT_IMPORTED,
        message: 'Non-zero note-off velocities are not Project facts in V1 and were not imported.',
        sourceTrackIndex,
        eventCount: releaseVelocityCount,
      }),
    )
  }
}

function assertTrackShape(track: MidiFileTrack, sourceTrackIndex: number): void {
  if (
    typeof track.name !== 'string' ||
    !Number.isSafeInteger(track.channel) ||
    track.channel < 0 ||
    track.channel > 15 ||
    !Number.isSafeInteger(track.programNumber) ||
    track.programNumber < 0 ||
    track.programNumber > 127 ||
    !Array.isArray(track.notes) ||
    !Array.isArray(track.controlChanges) ||
    !Array.isArray(track.pitchBends)
  ) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      `Normalized MIDI track ${sourceTrackIndex} has an invalid shape.`,
      { sourceTrackIndex, value: track },
    )
  }
}

function mapNote(
  note: MidiFileNote,
  sourcePpq: number,
  channel: number,
  sourceTrackIndex: number,
  sourceNoteIndex: number,
): AbsoluteMappedNote {
  if (!Number.isSafeInteger(note.durationTicks) || note.durationTicks < 0) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      'MIDI note durations must be non-negative safe integers.',
      { sourceTrackIndex, sourceTick: note.tick, value: note.durationTicks },
    )
  }

  const sourceEndTick = note.tick + note.durationTicks
  if (!Number.isSafeInteger(sourceEndTick)) {
    throw new ProjectMidiImportError(
      'tick-conversion-overflow',
      'A MIDI note endpoint exceeds the safe integer range.',
      { sourceTrackIndex, sourceTick: note.tick },
    )
  }

  const startTick = convertMidiTickToProjectTick(note.tick, sourcePpq)
  const roundedEndTick = convertMidiTickToProjectTick(sourceEndTick, sourcePpq)
  const durationExpanded = roundedEndTick <= startTick
  const endTick = durationExpanded ? startTick + 1 : roundedEndTick
  if (!Number.isSafeInteger(endTick)) {
    throw new ProjectMidiImportError(
      'tick-conversion-overflow',
      'A rounded MIDI note endpoint exceeds the safe integer range.',
      { sourceTrackIndex, sourceTick: sourceEndTick },
    )
  }

  return {
    sourceNoteIndex,
    startTick,
    endTick,
    durationExpanded,
    pitch: note.pitch,
    velocity: note.velocity,
    channel,
  }
}

function trackNameCounts(document: MidiFileDocument): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const track of document.tracks) {
    if (track.notes.length === 0) continue
    const name = track.name.trim()
    if (name.length > 0) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return counts
}

function createImportedTrackName(
  track: MidiFileTrack,
  sourceTrackIndex: number,
  importedTrackIndex: number,
  duplicateNameCounts: ReadonlyMap<string, number>,
  diagnostics: ProjectMidiImportDiagnostic[],
): string {
  const trimmedName = track.name.trim()
  const fallbackName = `MIDI Track ${importedTrackIndex + 1}`
  const disambiguatedName =
    trimmedName.length > 0 && (duplicateNameCounts.get(trimmedName) ?? 0) > 1
      ? `${trimmedName} · Ch ${track.channel + 1} · Program ${track.programNumber + 1}`
      : trimmedName
  const importedName = normalizeEntityName(disambiguatedName, fallbackName)

  if (track.name !== importedName) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TRACK_NAME_ADJUSTED,
        message: 'A MIDI track name was trimmed, truncated, replaced, or disambiguated.',
        sourceTrackIndex,
        originalName: track.name,
        importedName,
      }),
    )
  }
  return importedName
}

function findTrackBounds(notes: readonly AbsoluteMappedNote[]): {
  readonly startTick: number
  readonly noteEndTick: number
  readonly expandedNoteCount: number
} {
  let startTick = Number.MAX_SAFE_INTEGER
  let noteEndTick = 0
  let expandedNoteCount = 0
  for (const note of notes) {
    startTick = Math.min(startTick, note.startTick)
    noteEndTick = Math.max(noteEndTick, note.endTick)
    if (note.durationExpanded) expandedNoteCount += 1
  }
  return { startTick, noteEndTick, expandedNoteCount }
}

export function mapTracks(
  document: MidiFileDocument,
  diagnostics: ProjectMidiImportDiagnostic[],
): readonly MappedTrack[] {
  document.tracks.forEach(assertTrackShape)
  const duplicateNameCounts = trackNameCounts(document)
  const mappedTracks: MappedTrack[] = []

  document.tracks.forEach((track, sourceTrackIndex) => {
    const imported = track.notes.length > 0
    addUnsupportedFactDiagnostics(track, sourceTrackIndex, imported, diagnostics)
    if (!imported) {
      diagnostics.push(
        createDiagnostic({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.EMPTY_TRACK_SKIPPED,
          message: 'A normalized MIDI track without notes did not create an Instrument Track.',
          sourceTrackIndex,
        }),
      )
      return
    }

    const importedTrackIndex = mappedTracks.length
    const notes = track.notes.map((note, sourceNoteIndex) =>
      mapNote(note, document.ppq, track.channel, sourceTrackIndex, sourceNoteIndex),
    )
    notes.sort(
      (left, right) =>
        left.startTick - right.startTick ||
        left.pitch - right.pitch ||
        left.endTick - right.endTick ||
        left.velocity - right.velocity ||
        left.sourceNoteIndex - right.sourceNoteIndex,
    )

    const { startTick, noteEndTick, expandedNoteCount } = findTrackBounds(notes)
    const endOfTrackTick =
      track.endTick === undefined
        ? noteEndTick
        : convertMidiTickToProjectTick(track.endTick, document.ppq)
    const endTick = Math.max(noteEndTick, endOfTrackTick)
    if (expandedNoteCount > 0) {
      diagnostics.push(
        createDiagnostic({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.NOTE_DURATIONS_EXPANDED,
          message: 'Notes that rounded to zero Project ticks were expanded to one tick.',
          sourceTrackIndex,
          eventCount: expandedNoteCount,
        }),
      )
    }

    mappedTracks.push({
      sourceTrack: track,
      sourceTrackIndex,
      importedTrackIndex,
      name: createImportedTrackName(
        track,
        sourceTrackIndex,
        importedTrackIndex,
        duplicateNameCounts,
        diagnostics,
      ),
      startTick,
      spanTick: endTick - startTick,
      notes,
    })
  })
  return mappedTracks
}
