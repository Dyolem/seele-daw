import type {
  MidiFileControlChange,
  MidiFileDocument,
  MidiFileNote,
  MidiFileTrack,
} from '@seele-daw/midi-file'
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

interface AbsoluteMappedSustainPedalEvent {
  readonly sourceControlChangeIndex: number
  readonly sourceTick: number
  readonly tick: number
  readonly value: number
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
  readonly sustainPedalEvents: readonly AbsoluteMappedSustainPedalEvent[]
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

  if (!imported && sustainEventCount > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.SUSTAIN_PEDAL_NOT_IMPORTED,
        message:
          'Sustain pedal CC64 could not be imported because its normalized Track contains no Notes.',
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

function mapSustainPedalEvent(
  event: MidiFileControlChange,
  sourcePpq: number,
  channel: number,
  sourceTrackIndex: number,
  sourceControlChangeIndex: number,
): AbsoluteMappedSustainPedalEvent {
  if (
    !Number.isSafeInteger(event.tick) ||
    event.tick < 0 ||
    !Number.isSafeInteger(event.value) ||
    event.value < 0 ||
    event.value > 127
  ) {
    throw new ProjectMidiImportError(
      'invalid-midi-document',
      'MIDI sustain-pedal events require a non-negative Tick and an integer value from 0 through 127.',
      { sourceTrackIndex, sourceTick: event.tick, value: event.value },
    )
  }

  return {
    channel,
    sourceControlChangeIndex,
    sourceTick: event.tick,
    tick: convertMidiTickToProjectTick(event.tick, sourcePpq),
    value: event.value,
  }
}

function mapSustainPedalEvents(
  track: MidiFileTrack,
  sourcePpq: number,
  sourceTrackIndex: number,
  diagnostics: ProjectMidiImportDiagnostic[],
): readonly AbsoluteMappedSustainPedalEvent[] {
  const mapped = track.controlChanges.flatMap((event, sourceControlChangeIndex) =>
    event.controller === SUSTAIN_PEDAL_CONTROLLER
      ? [
          mapSustainPedalEvent(
            event,
            sourcePpq,
            track.channel,
            sourceTrackIndex,
            sourceControlChangeIndex,
          ),
        ]
      : [],
  )
  mapped.sort(
    (left, right) =>
      left.tick - right.tick ||
      left.sourceTick - right.sourceTick ||
      left.sourceControlChangeIndex - right.sourceControlChangeIndex,
  )

  const effectiveEvents: AbsoluteMappedSustainPedalEvent[] = []
  for (let index = 0; index < mapped.length; ) {
    const projectTick = mapped[index]!.tick
    let groupEndIndex = index + 1
    while (mapped[groupEndIndex]?.tick === projectTick) groupEndIndex += 1
    const group = mapped.slice(index, groupEndIndex)
    if (group.length > 1) {
      diagnostics.push(
        createDiagnostic({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.SUSTAIN_PEDAL_EVENTS_COLLAPSED,
          message: `${group.length} source sustain-pedal events rounded to Project tick ${projectTick}; the latest source event was kept.`,
          eventCount: group.length,
          projectTick,
          sourceTrackIndex,
          controllerNumbers: [SUSTAIN_PEDAL_CONTROLLER],
        }),
      )
    }
    effectiveEvents.push(group[group.length - 1]!)
    index = groupEndIndex
  }

  return effectiveEvents
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

function findTrackBounds(
  notes: readonly AbsoluteMappedNote[],
  sustainPedalEvents: readonly AbsoluteMappedSustainPedalEvent[],
): {
  readonly startTick: number
  readonly contentEndTick: number
  readonly expandedNoteCount: number
} {
  let startTick = Number.MAX_SAFE_INTEGER
  let contentEndTick = 0
  let expandedNoteCount = 0
  for (const note of notes) {
    startTick = Math.min(startTick, note.startTick)
    contentEndTick = Math.max(contentEndTick, note.endTick)
    if (note.durationExpanded) expandedNoteCount += 1
  }
  for (const event of sustainPedalEvents) {
    startTick = Math.min(startTick, event.tick)
    contentEndTick = Math.max(contentEndTick, event.tick)
  }
  return { startTick, contentEndTick, expandedNoteCount }
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

    const sustainPedalEvents = mapSustainPedalEvents(
      track,
      document.ppq,
      sourceTrackIndex,
      diagnostics,
    )

    const { startTick, contentEndTick, expandedNoteCount } = findTrackBounds(
      notes,
      sustainPedalEvents,
    )
    const endOfTrackTick =
      track.endTick === undefined
        ? contentEndTick
        : convertMidiTickToProjectTick(track.endTick, document.ppq)
    const endTick = Math.max(contentEndTick, endOfTrackTick)
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
      sustainPedalEvents,
    })
  })
  return mappedTracks
}
