import type {
  MidiFileDocument,
  MidiFileTempoEvent,
  MidiFileTimeSignatureEvent,
} from '@seele-daw/midi-file'
import {
  TEMPO_BPM_MAX,
  TEMPO_BPM_MIN,
  TIME_SIGNATURE_DENOMINATORS,
  TIME_SIGNATURE_NUMERATOR_MAX,
  TIME_SIGNATURE_NUMERATOR_MIN,
  type TempoEventDTO,
  type TimeSignatureEventDTO,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type ProjectMidiImportDiagnostic,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import {
  createDiagnostic,
  createRecordTable,
  type ImportIdAllocator,
  setRecord,
} from '#internal/import/import-support'
import { convertMidiTickToProjectTick } from '#internal/import/ppq-converter'

const DEFAULT_TEMPO_BPM = 120
const DEFAULT_TIME_SIGNATURE = Object.freeze({ numerator: 4, denominator: 4 })

interface MappedTimelineEvent<Event> {
  readonly sourceIndex: number
  readonly sourceTick: number
  readonly projectTick: number
  readonly event: Event
}

function groupMappedTimelineEvents<Event>(
  events: readonly Event[],
  sourcePpq: number,
  readTick: (event: Event) => number,
): ReadonlyMap<number, readonly MappedTimelineEvent<Event>[]> {
  const mappedEvents = events.map<MappedTimelineEvent<Event>>((event, sourceIndex) => {
    const sourceTick = readTick(event)
    return {
      sourceIndex,
      sourceTick,
      projectTick: convertMidiTickToProjectTick(sourceTick, sourcePpq),
      event,
    }
  })
  mappedEvents.sort(
    (left, right) =>
      left.projectTick - right.projectTick ||
      left.sourceTick - right.sourceTick ||
      left.sourceIndex - right.sourceIndex,
  )

  const groups = new Map<number, MappedTimelineEvent<Event>[]>()
  for (const event of mappedEvents) {
    const group = groups.get(event.projectTick)
    if (group === undefined) groups.set(event.projectTick, [event])
    else group.push(event)
  }
  return groups
}

export function createTempoEvents(
  document: MidiFileDocument,
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
): Record<string, TempoEventDTO> {
  const groups = groupMappedTimelineEvents<MidiFileTempoEvent>(
    document.tempos,
    document.ppq,
    (event) => event.tick,
  )
  const effectiveEvents = new Map<number, MidiFileTempoEvent>()

  for (const [projectTick, group] of groups) {
    if (group.length > 1) {
      diagnostics.push(
        createDiagnostic({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_COLLAPSED,
          message: `${group.length} source tempo events rounded to Project tick ${projectTick}; the latest source event was kept.`,
          eventCount: group.length,
          projectTick,
        }),
      )
    }
    effectiveEvents.set(projectTick, group[group.length - 1]!.event)
  }
  if (!effectiveEvents.has(0)) effectiveEvents.set(0, { tick: 0, bpm: DEFAULT_TEMPO_BPM })

  const table = createRecordTable<TempoEventDTO>()
  for (const [tick, event] of [...effectiveEvents].sort(([left], [right]) => left - right)) {
    if (!Number.isFinite(event.bpm) || event.bpm <= 0) {
      throw new ProjectMidiImportError(
        'invalid-midi-document',
        `MIDI tempo at tick ${event.tick} must have a finite positive BPM.`,
        { sourceTick: event.tick, value: event.bpm },
      )
    }
    if (event.bpm < TEMPO_BPM_MIN || event.bpm > TEMPO_BPM_MAX) {
      throw new ProjectMidiImportError(
        'unsupported-tempo',
        `MIDI tempo ${event.bpm} BPM is outside the Project range ${TEMPO_BPM_MIN}..${TEMPO_BPM_MAX}.`,
        { sourceTick: event.tick, value: event.bpm },
      )
    }
    const id = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.TEMPO_EVENT)
    setRecord(table, id, { id, tick, bpm: event.bpm })
  }
  return table
}

export function createTimeSignatureEvents(
  document: MidiFileDocument,
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
): Record<string, TimeSignatureEventDTO> {
  const groups = groupMappedTimelineEvents<MidiFileTimeSignatureEvent>(
    document.timeSignatures,
    document.ppq,
    (event) => event.tick,
  )
  const effectiveEvents = new Map<number, MidiFileTimeSignatureEvent>()

  for (const [projectTick, group] of groups) {
    if (group.length > 1) {
      diagnostics.push(
        createDiagnostic({
          code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_COLLAPSED,
          message: `${group.length} source time-signature events rounded to Project tick ${projectTick}; the latest source event was kept.`,
          eventCount: group.length,
          projectTick,
        }),
      )
    }
    effectiveEvents.set(projectTick, group[group.length - 1]!.event)
  }
  if (!effectiveEvents.has(0)) {
    effectiveEvents.set(0, {
      tick: 0,
      numerator: DEFAULT_TIME_SIGNATURE.numerator,
      denominator: DEFAULT_TIME_SIGNATURE.denominator,
    })
  }

  const table = createRecordTable<TimeSignatureEventDTO>()
  for (const [tick, event] of [...effectiveEvents].sort(([left], [right]) => left - right)) {
    const supportedNumerator =
      Number.isInteger(event.numerator) &&
      event.numerator >= TIME_SIGNATURE_NUMERATOR_MIN &&
      event.numerator <= TIME_SIGNATURE_NUMERATOR_MAX
    const supportedDenominator = TIME_SIGNATURE_DENOMINATORS.some(
      (denominator) => denominator === event.denominator,
    )
    if (!supportedNumerator || !supportedDenominator) {
      throw new ProjectMidiImportError(
        'unsupported-time-signature',
        `MIDI time signature ${event.numerator}/${event.denominator} cannot be represented by the current Project model.`,
        { sourceTick: event.tick, value: `${event.numerator}/${event.denominator}` },
      )
    }
    const id = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.TIME_SIGNATURE_EVENT)
    setRecord(table, id, {
      id,
      tick,
      numerator: event.numerator,
      denominator: event.denominator,
    })
  }
  return table
}

export function addGlobalUnsupportedFactDiagnostics(
  document: MidiFileDocument,
  diagnostics: ProjectMidiImportDiagnostic[],
): void {
  if (document.keySignatures.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.KEY_SIGNATURES_NOT_IMPORTED,
        message: 'Key-signature events are not Project facts in V1 and were not imported.',
        eventCount: document.keySignatures.length,
      }),
    )
  }
  if (document.textEvents.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEXT_EVENTS_NOT_IMPORTED,
        message: 'MIDI text, marker, lyric, and cue events are not Project facts in V1.',
        eventCount: document.textEvents.length,
      }),
    )
  }
}

/** Reports source timeline facts deliberately left under the destination Project's authority. */
export function addCurrentProjectTimelineDiagnostics(
  document: MidiFileDocument,
  diagnostics: ProjectMidiImportDiagnostic[],
): void {
  if (document.tempos.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_NOT_IMPORTED,
        message:
          'Source Tempo Events were not imported because new Tracks follow the current Project Tempo Map.',
        eventCount: document.tempos.length,
      }),
    )
  }
  if (document.timeSignatures.length > 0) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_NOT_IMPORTED,
        message:
          'Source time-signature Events were not imported because new Tracks follow the current Project timeline.',
        eventCount: document.timeSignatures.length,
      }),
    )
  }
}
