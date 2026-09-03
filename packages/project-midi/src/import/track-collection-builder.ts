import {
  ZERO_TICK,
  addTicks,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  createMidiSustainPedalEventRecord,
  parseClipId,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiControlValue,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiSustainPedalEventId,
  parseMidiVelocity,
  parseNoteId,
  parseProjectColor,
  parseTick,
  parseTrackId,
  type DeviceDescriptor,
  type InstrumentTrackCollectionEntry,
  type ProjectColor,
  type Tick,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_INSTRUMENT_MAPPING_KIND,
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type ProjectMidiImportDiagnostic,
  type ProjectMidiInstrumentDeviceFactory,
  type ProjectMidiInstrumentDeviceFactoryResult,
  type ProjectMidiTrackColorFactory,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import { createDiagnostic, type ImportIdAllocator } from '#internal/import/import-support'
import type { MappedTrack } from '#internal/import/track-mapper'

function createInstrumentDevice(
  createDevice: ProjectMidiInstrumentDeviceFactory,
  mappedTrack: MappedTrack,
  deviceId: ReturnType<typeof parseDeviceId>,
): ProjectMidiInstrumentDeviceFactoryResult {
  let result: ProjectMidiInstrumentDeviceFactoryResult
  let device: DeviceDescriptor

  try {
    result = createDevice(
      Object.freeze({
        id: deviceId,
        sourceTrack: mappedTrack.sourceTrack,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        importedTrackIndex: mappedTrack.importedTrackIndex,
      }),
    )
    if (result === null || typeof result !== 'object') {
      throw new TypeError('Instrument device factory must return a mapping result')
    }
    if (result.device === null || typeof result.device !== 'object') {
      throw new TypeError('Instrument device mapping result must include a DeviceDescriptor')
    }
    if (
      result.mappingKind !== PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT &&
      result.mappingKind !== PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE &&
      result.mappingKind !== PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.UNAVAILABLE
    ) {
      throw new TypeError('Instrument device mapping result has an unknown mapping kind')
    }
    if (
      result.mappingKind === PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE &&
      (typeof result.appliedInstrumentName !== 'string' ||
        result.appliedInstrumentName.trim().length === 0)
    ) {
      throw new TypeError('Approximate instrument mappings require an applied Instrument name')
    }
    device = createDeviceDescriptor(result.device)
  } catch (cause) {
    throw new ProjectMidiImportError(
      'instrument-device-factory-failed',
      `The instrument device factory failed for MIDI track ${mappedTrack.sourceTrackIndex}.`,
      { sourceTrackIndex: mappedTrack.sourceTrackIndex },
      { cause },
    )
  }

  if (device.id !== deviceId) {
    throw new ProjectMidiImportError(
      'instrument-device-factory-failed',
      'The instrument device factory returned a descriptor with a different ID.',
      {
        entityKind: PROJECT_MIDI_IMPORT_ENTITY_KIND.DEVICE,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        value: device.id,
      },
    )
  }

  if (result.mappingKind === PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE) {
    return Object.freeze({
      appliedInstrumentName: result.appliedInstrumentName.trim(),
      device,
      mappingKind: result.mappingKind,
    })
  }
  return Object.freeze({ device, mappingKind: result.mappingKind })
}

function addInstrumentMappingDiagnostic(
  result: ProjectMidiInstrumentDeviceFactoryResult,
  mappedTrack: MappedTrack,
  diagnostics: ProjectMidiImportDiagnostic[],
): void {
  if (result.mappingKind === PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.EXACT) return

  if (result.mappingKind === PROJECT_MIDI_INSTRUMENT_MAPPING_KIND.APPROXIMATE) {
    diagnostics.push(
      createDiagnostic({
        appliedInstrumentName: result.appliedInstrumentName,
        code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_APPROXIMATED,
        message: `MIDI Program ${mappedTrack.sourceTrack.programNumber + 1} was mapped to the reviewed approximate Instrument ${result.appliedInstrumentName}.`,
        sourceProgramNumber: mappedTrack.sourceTrack.programNumber,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
      }),
    )
    return
  }

  diagnostics.push(
    createDiagnostic({
      code: PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_UNAVAILABLE,
      message: `MIDI Program ${mappedTrack.sourceTrack.programNumber + 1} has no reviewed Instrument mapping and was imported as a silent placeholder.`,
      sourceProgramNumber: mappedTrack.sourceTrack.programNumber,
      sourceTrackIndex: mappedTrack.sourceTrackIndex,
    }),
  )
}

function createTrackColor(
  factory: ProjectMidiTrackColorFactory,
  mappedTrack: MappedTrack,
): ProjectColor | null {
  try {
    const color = factory(
      Object.freeze({
        sourceTrack: mappedTrack.sourceTrack,
        sourceTrackIndex: mappedTrack.sourceTrackIndex,
        importedTrackIndex: mappedTrack.importedTrackIndex,
      }),
    )
    return color === null ? null : parseProjectColor(color)
  } catch (cause) {
    throw new ProjectMidiImportError(
      'track-color-factory-failed',
      `The Track color factory failed for MIDI track ${mappedTrack.sourceTrackIndex}.`,
      { sourceTrackIndex: mappedTrack.sourceTrackIndex },
      { cause },
    )
  }
}

/** Builds normalized Project ownership graphs shared by both MIDI import products. */
export function createImportedTrackCollection(
  createDevice: ProjectMidiInstrumentDeviceFactory,
  createColor: ProjectMidiTrackColorFactory,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
  diagnostics: ProjectMidiImportDiagnostic[],
  placementTick: Tick = ZERO_TICK,
): readonly InstrumentTrackCollectionEntry[] {
  try {
    return mappedTracks.map((mappedTrack) => {
      const context = { sourceTrackIndex: mappedTrack.sourceTrackIndex }
      const trackId = parseTrackId(
        allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.TRACK, context),
      )
      const deviceId = parseDeviceId(
        allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.DEVICE, context),
      )
      const clipId = parseClipId(allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.CLIP, context))
      const sourceId = parseMidiSourceId(
        allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_SOURCE, context),
      )
      const notes = mappedTrack.notes.map((note) =>
        createMidiNoteRecord({
          id: parseNoteId(
            allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_NOTE, {
              sourceTrackIndex: mappedTrack.sourceTrackIndex,
              sourceNoteIndex: note.sourceNoteIndex,
            }),
          ),
          startTick: parseTick(note.startTick - mappedTrack.startTick),
          durationTick: parseTick(note.endTick - note.startTick),
          pitch: parseMidiPitch(note.pitch),
          velocity: parseMidiVelocity(note.velocity),
          channel: parseMidiChannel(note.channel),
        }),
      )
      const sustainPedalEvents = mappedTrack.sustainPedalEvents.map((event) =>
        createMidiSustainPedalEventRecord({
          id: parseMidiSustainPedalEventId(
            allocator.allocate(PROJECT_MIDI_IMPORT_ENTITY_KIND.MIDI_SUSTAIN_PEDAL_EVENT, {
              sourceTrackIndex: mappedTrack.sourceTrackIndex,
              sourceControlChangeIndex: event.sourceControlChangeIndex,
            }),
          ),
          tick: parseTick(event.tick - mappedTrack.startTick),
          value: parseMidiControlValue(event.value),
          channel: parseMidiChannel(event.channel),
        }),
      )
      const source = createMidiSourceRecord({
        id: sourceId,
        lengthTick: parseTick(mappedTrack.spanTick),
      })
      const clip = createMidiClipRecord({
        id: clipId,
        trackId,
        name: mappedTrack.name,
        color: null,
        muted: false,
        // Source file tick zero maps to the caller-owned placement anchor. Per-Track leading
        // silence therefore remains intact instead of collapsing every Clip onto its first Note.
        startTick: addTicks(placementTick, parseTick(mappedTrack.startTick)),
        spanTick: parseTick(mappedTrack.spanTick),
        sourceId,
        sourceOffsetTick: parseTick(0),
        loop: null,
      })
      const instrumentMapping = createInstrumentDevice(createDevice, mappedTrack, deviceId)
      addInstrumentMappingDiagnostic(instrumentMapping, mappedTrack, diagnostics)
      const instrumentDevice = instrumentMapping.device
      const color = createTrackColor(createColor, mappedTrack)
      const track = createInstrumentTrackRecord({
        id: trackId,
        name: mappedTrack.name,
        color,
        channel: {
          gain: parseLinearGain(1),
          pan: parseBipolarValue(0),
          muted: false,
          soloed: false,
        },
        audioEffectIds: [],
        midiEffectIds: [],
        instrumentDeviceId: instrumentDevice.id,
      })

      return Object.freeze({
        track,
        instrumentDevice,
        clips: Object.freeze([
          Object.freeze({
            clip,
            source,
            notes: Object.freeze(notes),
            // CC64 stays independent from authored Note duration so playback can derive pedal hold.
            sustainPedalEvents: Object.freeze(sustainPedalEvents),
          }),
        ]),
      })
    })
  } catch (cause) {
    if (cause instanceof ProjectMidiImportError) throw cause

    throw new ProjectMidiImportError(
      'project-validation-failed',
      'The imported MIDI tracks could not form valid Project ownership graphs.',
      {},
      { cause },
    )
  }
}
