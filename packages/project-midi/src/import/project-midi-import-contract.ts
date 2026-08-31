import type { MidiFileDocument, MidiFileTrack } from '@seele-daw/midi-file'
import type {
  AddInstrumentTrackCollectionCommand,
  DeviceDescriptor,
  DeviceId,
  ModelRevision,
  ProjectColor,
  ProjectSession,
  Tick,
  TrackId,
} from '@seele-daw/project-core'

export const PROJECT_MIDI_IMPORT_ENTITY_KIND = {
  PROJECT: 'project',
  TRACK: 'track',
  CLIP: 'clip',
  MIDI_SOURCE: 'midi-source',
  MIDI_NOTE: 'midi-note',
  MIDI_SUSTAIN_PEDAL_EVENT: 'midi-sustain-pedal-event',
  DEVICE: 'device',
  TEMPO_EVENT: 'tempo-event',
  TIME_SIGNATURE_EVENT: 'time-signature-event',
} as const

export type ProjectMidiImportEntityKind =
  (typeof PROJECT_MIDI_IMPORT_ENTITY_KIND)[keyof typeof PROJECT_MIDI_IMPORT_ENTITY_KIND]

export interface ProjectMidiImportIdRequest {
  readonly kind: ProjectMidiImportEntityKind
  readonly ordinal: number
  readonly sourceTrackIndex?: number
  readonly sourceNoteIndex?: number
  readonly sourceControlChangeIndex?: number
}

export type ProjectMidiImportIdFactory = (request: ProjectMidiImportIdRequest) => string

export interface ProjectMidiInstrumentDeviceFactoryInput {
  readonly id: DeviceId
  readonly sourceTrack: MidiFileTrack
  readonly sourceTrackIndex: number
  readonly importedTrackIndex: number
}

export type ProjectMidiInstrumentDeviceFactory = (
  input: ProjectMidiInstrumentDeviceFactoryInput,
) => DeviceDescriptor

export interface ProjectMidiTrackColorFactoryInput {
  readonly sourceTrack: MidiFileTrack
  readonly sourceTrackIndex: number
  readonly importedTrackIndex: number
}

/** Lets the composition host apply its creation-time Track palette without coupling this package to UI. */
export type ProjectMidiTrackColorFactory = (
  input: ProjectMidiTrackColorFactoryInput,
) => ProjectColor | null

export const PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE = {
  CONTROL_CHANGES_NOT_IMPORTED: 'control-changes-not-imported',
  EMPTY_TRACK_SKIPPED: 'empty-track-skipped',
  KEY_SIGNATURES_NOT_IMPORTED: 'key-signatures-not-imported',
  NOTE_DURATIONS_EXPANDED: 'note-durations-expanded',
  PITCH_BENDS_NOT_IMPORTED: 'pitch-bends-not-imported',
  PROGRAM_NOT_APPLIED: 'program-not-applied',
  PROJECT_NAME_ADJUSTED: 'project-name-adjusted',
  RELEASE_VELOCITIES_NOT_IMPORTED: 'release-velocities-not-imported',
  SUSTAIN_PEDAL_EVENTS_COLLAPSED: 'sustain-pedal-events-collapsed',
  SUSTAIN_PEDAL_NOT_IMPORTED: 'sustain-pedal-not-imported',
  TEMPO_EVENTS_NOT_IMPORTED: 'tempo-events-not-imported',
  TEMPO_EVENTS_COLLAPSED: 'tempo-events-collapsed',
  TEXT_EVENTS_NOT_IMPORTED: 'text-events-not-imported',
  TIME_SIGNATURE_EVENTS_NOT_IMPORTED: 'time-signature-events-not-imported',
  TIME_SIGNATURE_EVENTS_COLLAPSED: 'time-signature-events-collapsed',
  TRACK_NAME_ADJUSTED: 'track-name-adjusted',
} as const

export type ProjectMidiImportDiagnosticCode =
  (typeof PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE)[keyof typeof PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE]

/** Non-blocking source facts that the current Project import path does not represent exactly. */
export interface ProjectMidiImportDiagnostic {
  readonly code: ProjectMidiImportDiagnosticCode
  readonly message: string
  readonly sourceTrackIndex?: number
  readonly eventCount?: number
  readonly projectTick?: number
  readonly controllerNumbers?: readonly number[]
  readonly sourceProgramNumber?: number
  readonly originalName?: string
  readonly importedName?: string
}

export interface ProjectMidiImportSummary {
  readonly sourceFormat: MidiFileDocument['format']
  readonly sourcePpq: number
  readonly sourceTrackCount: number
  readonly importedTrackCount: number
  readonly importedNoteCount: number
}

/**
 * A complete, invariant-valid Project Session that has not entered an application lifecycle yet.
 * MI3 decides whether and how it becomes an ActiveProjectService project and first checkpoint.
 */
export interface ProjectMidiImportDraft {
  readonly session: ProjectSession
  readonly diagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly summary: ProjectMidiImportSummary
}

export interface CreateProjectMidiImportDraftInput {
  readonly document: MidiFileDocument
  readonly projectName?: string
  readonly createId: ProjectMidiImportIdFactory
  readonly createInstrumentDevice: ProjectMidiInstrumentDeviceFactory
  readonly createTrackColor: ProjectMidiTrackColorFactory
}

/** A pending atomic append operation for an already active Project Session. */
export interface ProjectMidiTrackImportDraft {
  readonly command: AddInstrumentTrackCollectionCommand
  readonly importedTrackIds: readonly TrackId[]
  readonly diagnostics: readonly ProjectMidiImportDiagnostic[]
  readonly summary: ProjectMidiImportSummary
}

export interface CreateProjectMidiTrackImportDraftInput {
  readonly document: MidiFileDocument
  readonly baseRevision: ModelRevision
  readonly insertAt: number
  /** Destination Project tick corresponding to source MIDI file tick zero. */
  readonly placementTick: Tick
  readonly createId: ProjectMidiImportIdFactory
  readonly createInstrumentDevice: ProjectMidiInstrumentDeviceFactory
  readonly createTrackColor: ProjectMidiTrackColorFactory
}
