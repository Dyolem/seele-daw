import {
  ZERO_TICK,
  addTicks,
  createDeviceDescriptor,
  createInstrumentTrackRecord,
  createMidiClipRecord,
  createMidiNoteRecord,
  createMidiSourceRecord,
  parseClipId,
  parseBipolarValue,
  parseDeviceId,
  parseLinearGain,
  parseMidiChannel,
  parseMidiPitch,
  parseMidiSourceId,
  parseMidiVelocity,
  parseNoteId,
  parseTick,
  parseTrackId,
  type DeviceDescriptor,
  type InstrumentTrackCollectionEntry,
  type Tick,
} from '@seele-daw/project-core'
import {
  PROJECT_MIDI_IMPORT_ENTITY_KIND,
  type ProjectMidiInstrumentDeviceFactory,
} from '#internal/import/project-midi-import-contract'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'
import type { ImportIdAllocator } from '#internal/import/import-support'
import type { MappedTrack } from '#internal/import/track-mapper'

function createInstrumentDevice(
  createDevice: ProjectMidiInstrumentDeviceFactory,
  mappedTrack: MappedTrack,
  deviceId: ReturnType<typeof parseDeviceId>,
): DeviceDescriptor {
  let descriptor: DeviceDescriptor

  try {
    descriptor = createDevice(
      Object.freeze({
        id: deviceId,
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

  if (descriptor.id !== deviceId) {
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

  return createDeviceDescriptor(descriptor)
}

/** Builds normalized Project ownership graphs shared by both MIDI import products. */
export function createImportedTrackCollection(
  createDevice: ProjectMidiInstrumentDeviceFactory,
  mappedTracks: readonly MappedTrack[],
  allocator: ImportIdAllocator,
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
      const instrumentDevice = createInstrumentDevice(createDevice, mappedTrack, deviceId)
      const track = createInstrumentTrackRecord({
        id: trackId,
        name: mappedTrack.name,
        color: null,
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
        clips: Object.freeze([Object.freeze({ clip, source, notes: Object.freeze(notes) })]),
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
