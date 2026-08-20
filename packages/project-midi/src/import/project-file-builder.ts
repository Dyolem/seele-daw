import {
  PROJECT_FILE_FORMAT_VERSION,
  parseDeviceId,
  type DeviceDTO,
  type DeviceDescriptor,
  type JsonValue,
  type MidiNoteDTO,
  type ProjectFileDTO,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type CreateProjectMidiImportDraftInput,
  type ProjectMidiImportDiagnostic,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import {
  createDiagnostic,
  createRecordTable,
  type ImportIdAllocator,
  normalizeEntityName,
  setRecord,
} from '#internal/import/import-support'
import { createTempoEvents, createTimeSignatureEvents } from '#internal/import/timeline-mapper'
import type { MappedTrack } from '#internal/import/track-mapper'

const DEFAULT_PROJECT_NAME = 'Imported MIDI'

function selectProjectName(
  input: CreateProjectMidiImportDraftInput,
  diagnostics: ProjectMidiImportDiagnostic[],
): string {
  const requestedName = input.projectName ?? input.document.name
  const sourceName = typeof requestedName === 'string' ? requestedName : ''
  const importedName = normalizeEntityName(sourceName, DEFAULT_PROJECT_NAME)
  if (sourceName !== importedName) {
    diagnostics.push(
      createDiagnostic({
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROJECT_NAME_ADJUSTED,
        message: 'The imported project name was trimmed, truncated, or replaced.',
        originalName: sourceName,
        importedName,
      }),
    )
  }
  return importedName
}

function copyDeviceParameters(descriptor: DeviceDescriptor): Readonly<Record<string, JsonValue>> {
  const parameters = createRecordTable<JsonValue>()
  for (const [id, value] of Object.entries(descriptor.parameters)) setRecord(parameters, id, value)
  return parameters
}

function createInstrumentDevice(
  input: CreateProjectMidiImportDraftInput,
  mappedTrack: MappedTrack,
  deviceId: string,
): DeviceDTO {
  const parsedDeviceId = parseDeviceId(deviceId)
  let descriptor: DeviceDescriptor
  try {
    descriptor = input.createInstrumentDevice(
      Object.freeze({
        id: parsedDeviceId,
        sourceTrack: mappedTrack.sourceTrack,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        importedTrackIndex: mappedTrack.importedTrackIndex,
      }),
    )
    if (descriptor === null || typeof descriptor !== 'object') {
      throw new TypeError('Instrument device factory must return a DeviceDescriptor')
    }
  } catch (cause) {
    throw new ProjectMidiImportError(
      'instrument-device-factory-failed',
      `The instrument device factory failed for MIDI track ${mappedTrack.sourceTrackIndex}.`,
      { sourceTrackIndex: mappedTrack.sourceTrackIndex },
      { cause },
    )
  }

  if (descriptor.id !== parsedDeviceId) {
    throw new ProjectMidiImportError(
      'instrument-device-factory-failed',
      'The instrument device factory returned a descriptor with a different ID.',
      {
        entityKind: PROJECT_MIDI_IMPORT_ENTITY_KIND.DEVICE,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        value: descriptor.id,
      },
    )
  }
  return {
    id: descriptor.id,
    typeId: descriptor.typeId,
    definitionVersion: descriptor.definitionVersion,
    enabled: descriptor.enabled,
    parameters: copyDeviceParameters(descriptor),
    opaqueState: descriptor.opaqueState,
  }
}

interface ProjectFileCollections {
  readonly trackOrder: string[]
  readonly tracks: Record<string, ProjectFileDTO['tracks'][string]>
  readonly clips: Record<string, ProjectFileDTO['clips'][string]>
  readonly midiSources: Record<string, ProjectFileDTO['midiSources'][string]>
  readonly devices: Record<string, ProjectFileDTO['devices'][string]>
}

function addMappedTracks(
  input: CreateProjectMidiImportDraftInput,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
  collections: ProjectFileCollections,
): void {
  for (const mappedTrack of mappedTracks) {
    const context = { sourceTrackIndex: mappedTrack.sourceTrackIndex }
    const trackId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.TRACK, context)
    const deviceId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.DEVICE, context)
    const clipId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.CLIP, context)
    const sourceId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_SOURCE, context)
    const notes = createRecordTable<MidiNoteDTO>()

    for (const note of mappedTrack.notes) {
      const noteId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_NOTE, {
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        sourceNoteIndex: note.sourceNoteIndex,
      })
      setRecord(notes, noteId, {
        id: noteId,
        startTick: note.startTick - mappedTrack.startTick,
        durationTick: note.endTick - note.startTick,
        pitch: note.pitch,
        velocity: note.velocity,
        channel: note.channel,
      })
    }

    collections.trackOrder.push(trackId)
    setRecord(collections.tracks, trackId, {
      id: trackId,
      kind: 'instrument',
      name: mappedTrack.name,
      color: null,
      channel: { gain: 1, pan: 0, muted: false, soloed: false },
      audioEffectIds: [],
      midiEffectIds: [],
      instrumentDeviceId: deviceId,
    })
    setRecord(collections.clips, clipId, {
      id: clipId,
      kind: 'midi',
      trackId,
      name: mappedTrack.name,
      color: null,
      muted: false,
      startTick: mappedTrack.startTick,
      spanTick: mappedTrack.spanTick,
      sourceId,
      sourceOffsetTick: 0,
      loop: null,
    })
    setRecord(collections.midiSources, sourceId, {
      id: sourceId,
      lengthTick: mappedTrack.spanTick,
      notes,
    })
    setRecord(collections.devices, deviceId, createInstrumentDevice(input, mappedTrack, deviceId))
  }
}

export function createImportedProjectFile(
  input: CreateProjectMidiImportDraftInput,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
): ProjectFileDTO {
  const projectId = allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.PROJECT)
  const projectName = selectProjectName(input, diagnostics)
  const tempoEvents = createTempoEvents(input.document, allocator, diagnostics)
  const timeSignatureEvents = createTimeSignatureEvents(input.document, allocator, diagnostics)
  const collections: ProjectFileCollections = {
    trackOrder: [],
    tracks: createRecordTable(),
    clips: createRecordTable(),
    midiSources: createRecordTable(),
    devices: createRecordTable(),
  }
  addMappedTracks(input, mappedTracks, allocator, collections)
  return {
    formatVersion: PROJECT_FILE_FORMAT_VERSION,
    requiredFeatures: [],
    projectId,
    name: projectName,
    trackOrder: collections.trackOrder,
    tracks: collections.tracks,
    clips: collections.clips,
    midiSources: collections.midiSources,
    tempoEvents,
    timeSignatureEvents,
    devices: collections.devices,
    master: { gain: 1, muted: false, audioEffectIds: [] },
  }
}
