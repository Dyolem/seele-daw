import {
  ZERO_TICK,
  addTicks,
  parseDeviceTypeId,
  parseTick,
  type ClipId,
  type ClipRecord,
  type DeviceDescriptor,
  type DeviceId,
  type InstrumentTrackRecord,
  type MidiClipRecord,
  type MidiNotePartitionSnapshot,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourceRecord,
  type ProjectSnapshot,
  type Tick,
  type TrackId,
  type TrackRecord,
} from '@seele-daw/project-core'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  createNoteOccurrenceKey,
  type AudibleMidiPlanStatus,
  type AudibleMidiProjectPlan,
  type MidiNoteSpanPlan,
  type PlaybackDiagnostic,
  type PlaybackDiagnosticCode,
  type PlaybackDiagnosticSeverity,
  type SampleInstrumentPlan,
  type TrackPlaybackPlan,
} from './audible-midi-plan'
import { AudibleMidiCompilerError } from './audible-midi-compiler-error'
import {
  SAMPLE_INSTRUMENT_DEVICE_DEFINITION,
  decodeSampleInstrumentDeviceState,
} from '#internal/sample-instrument-device'
import { createTempoMap } from '#internal/time/tempo-map'

// These IDs only classify V1 routing failures; they do not define FM or VA state/runtime contracts.
const INSTRUMENT_SLOT_DEVICE_TYPE_ID = parseDeviceTypeId('seele.instrument-slot')
const FM_SYNTH_DEVICE_TYPE_ID = parseDeviceTypeId('seele.fm-synth')
const VA_SYNTH_DEVICE_TYPE_ID = parseDeviceTypeId('seele.va-synth')

interface SnapshotIndexes {
  readonly tracksById: ReadonlyMap<TrackId, TrackRecord>
  readonly devicesById: ReadonlyMap<DeviceId, DeviceDescriptor>
  readonly sourcesById: ReadonlyMap<MidiSourceId, MidiSourceRecord>
  readonly notePartitionsBySourceId: ReadonlyMap<MidiSourceId, MidiNotePartitionSnapshot>
  readonly clipsByTrackId: ReadonlyMap<TrackId, readonly ClipRecord[]>
  readonly arrangementEndTick: Tick
}

interface DiagnosticInput {
  readonly code: PlaybackDiagnosticCode
  readonly severity: PlaybackDiagnosticSeverity
  readonly trackId?: TrackId
  readonly clipId?: ClipId
  readonly device?: DeviceDescriptor
}

function compareIds(left: { readonly id: string }, right: { readonly id: string }): number {
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function compareClips(left: ClipRecord, right: ClipRecord): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  return compareIds(left, right)
}

function compareNotes(left: MidiNoteRecord, right: MidiNoteRecord): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  return compareIds(left, right)
}

// The final order must not depend on the storage order of Snapshot collections.
function compareNoteSpans(left: MidiNoteSpanPlan, right: MidiNoteSpanPlan): number {
  if (left.startTick !== right.startTick) return left.startTick - right.startTick
  if (left.endTick !== right.endTick) return left.endTick - right.endTick
  if (left.occurrenceKey < right.occurrenceKey) return -1
  if (left.occurrenceKey > right.occurrenceKey) return 1
  return 0
}

function indexUnique<Entity extends { readonly id: string }>(
  entities: readonly Entity[],
  entityKind: string,
): Map<Entity['id'], Entity> {
  const indexed = new Map<Entity['id'], Entity>()

  for (const entity of entities) {
    if (indexed.has(entity.id)) {
      throw new AudibleMidiCompilerError(
        'duplicate-snapshot-entity',
        `${entityKind}:${entity.id}`,
        `Project Snapshot contains duplicate ${entityKind} ${entity.id}`,
      )
    }
    indexed.set(entity.id, entity)
  }

  return indexed
}

function indexNotePartitions(
  partitions: readonly MidiNotePartitionSnapshot[],
): Map<MidiSourceId, MidiNotePartitionSnapshot> {
  const indexed = new Map<MidiSourceId, MidiNotePartitionSnapshot>()

  for (const partition of partitions) {
    if (indexed.has(partition.sourceId)) {
      throw new AudibleMidiCompilerError(
        'duplicate-snapshot-entity',
        `midi-note-partition:${partition.sourceId}`,
        `Project Snapshot contains duplicate MIDI Note partition ${partition.sourceId}`,
      )
    }
    indexed.set(partition.sourceId, partition)
  }

  return indexed
}

function requireReference<Entity>(
  entities: ReadonlyMap<string, Entity>,
  id: string,
  context: string,
): Entity {
  const entity = entities.get(id)
  if (entity === undefined) {
    throw new AudibleMidiCompilerError(
      'invalid-snapshot-reference',
      context,
      `Project Snapshot reference ${context} points to missing entity ${id}`,
    )
  }
  return entity
}

function validateTrackOrder(
  trackOrder: readonly TrackId[],
  tracksById: ReadonlyMap<TrackId, TrackRecord>,
): void {
  if (trackOrder.length !== tracksById.size || new Set(trackOrder).size !== trackOrder.length) {
    throw new AudibleMidiCompilerError(
      'invalid-track-order',
      'trackOrder',
      'Project Snapshot trackOrder must contain every Track exactly once',
    )
  }

  for (const trackId of trackOrder) {
    if (!tracksById.has(trackId)) {
      throw new AudibleMidiCompilerError(
        'invalid-track-order',
        `trackOrder:${trackId}`,
        `Project Snapshot trackOrder references missing Track ${trackId}`,
      )
    }
  }
}

/** Validates structural references and prepares deterministic compiler-local indexes. */
function createSnapshotIndexes(snapshot: ProjectSnapshot): SnapshotIndexes {
  const tracksById = indexUnique(snapshot.tracks, 'Track')
  const devicesById = indexUnique(snapshot.devices, 'Device')
  const sourcesById = indexUnique(snapshot.midiSources, 'MIDI Source')
  const notePartitionsBySourceId = indexNotePartitions(snapshot.midiNotePartitions)
  const mutableClipsByTrackId = new Map<TrackId, ClipRecord[]>()
  const clipIds = new Set<ClipId>()
  let arrangementEndTick = ZERO_TICK

  validateTrackOrder(snapshot.trackOrder, tracksById)

  for (const clip of snapshot.clips) {
    if (clipIds.has(clip.id)) {
      throw new AudibleMidiCompilerError(
        'duplicate-snapshot-entity',
        `Clip:${clip.id}`,
        `Project Snapshot contains duplicate Clip ${clip.id}`,
      )
    }
    clipIds.add(clip.id)
    requireReference(tracksById, clip.trackId, `Clip:${clip.id}.trackId`)
    requireReference(sourcesById, clip.sourceId, `Clip:${clip.id}.sourceId`)
    requireReference(notePartitionsBySourceId, clip.sourceId, `Clip:${clip.id}.notePartition`)

    const clips = mutableClipsByTrackId.get(clip.trackId) ?? []
    clips.push(clip)
    mutableClipsByTrackId.set(clip.trackId, clips)

    // Arrangement extent reflects authored Clip geometry, including muted or unsupported content.
    const clipEndTick = addTicks(clip.startTick, clip.spanTick)
    if (clipEndTick > arrangementEndTick) arrangementEndTick = clipEndTick
  }

  const clipsByTrackId = new Map<TrackId, readonly ClipRecord[]>()
  for (const [trackId, clips] of mutableClipsByTrackId) {
    clips.sort(compareClips)
    clipsByTrackId.set(trackId, Object.freeze(clips))
  }

  return {
    arrangementEndTick,
    clipsByTrackId,
    devicesById,
    notePartitionsBySourceId,
    sourcesById,
    tracksById,
  }
}

function createDiagnostic(input: DiagnosticInput): PlaybackDiagnostic {
  return Object.freeze({
    code: input.code,
    severity: input.severity,
    trackId: input.trackId ?? null,
    clipId: input.clipId ?? null,
    deviceId: input.device?.id ?? null,
    deviceTypeId: input.device?.typeId ?? null,
  })
}

function getEnabledDevices(
  deviceIds: readonly DeviceId[],
  devicesById: ReadonlyMap<DeviceId, DeviceDescriptor>,
  context: string,
): readonly DeviceDescriptor[] {
  // Disabled effects remain persisted facts but are transparent to the V1 playback route.
  return deviceIds
    .map((deviceId) => requireReference(devicesById, deviceId, `${context}:${deviceId}`))
    .filter(({ enabled }) => enabled)
}

function appendEffectDiagnostics(
  diagnostics: PlaybackDiagnostic[],
  devices: readonly DeviceDescriptor[],
  code: PlaybackDiagnosticCode,
  severity: PlaybackDiagnosticSeverity,
  trackId?: TrackId,
): void {
  for (const device of devices) {
    diagnostics.push(createDiagnostic({ code, device, severity, trackId }))
  }
}

/**
 * Decodes the generic MIDISampleSynth route without consulting Catalogs or browser assets.
 * Missing manifests and samples are resource-preparation failures handled after compilation.
 */
function decodeInstrumentPlan(
  track: InstrumentTrackRecord,
  devicesById: ReadonlyMap<DeviceId, DeviceDescriptor>,
  diagnostics: PlaybackDiagnostic[],
): SampleInstrumentPlan | null {
  const device = requireReference(
    devicesById,
    track.instrumentDeviceId,
    `Track:${track.id}.instrumentDeviceId`,
  )

  if (!device.enabled) {
    diagnostics.push(
      createDiagnostic({
        code: 'instrument-disabled',
        device,
        severity: 'warning',
        trackId: track.id,
      }),
    )
    return null
  }

  const sampleInstrumentState = decodeSampleInstrumentDeviceState(device)
  if (sampleInstrumentState !== null) {
    return Object.freeze({
      deviceId: device.id,
      kind: 'sample-instrument',
      soundbankId: sampleInstrumentState.soundbankId,
    })
  }

  // The exact Sample schema failed, so classify the route without substituting another sound.
  let code: PlaybackDiagnosticCode = 'instrument-runtime-missing'
  if (device.typeId === INSTRUMENT_SLOT_DEVICE_TYPE_ID) {
    code = 'instrument-not-selected'
  } else if (
    device.typeId === FM_SYNTH_DEVICE_TYPE_ID ||
    device.typeId === VA_SYNTH_DEVICE_TYPE_ID
  ) {
    code = 'instrument-engine-unsupported'
  } else if (device.typeId === SAMPLE_INSTRUMENT_DEVICE_DEFINITION.typeId) {
    code = 'invalid-sample-instrument-state'
  }

  diagnostics.push(createDiagnostic({ code, device, severity: 'warning', trackId: track.id }))
  return null
}

function createTrackPlan(
  track: InstrumentTrackRecord,
  indexes: SnapshotIndexes,
  diagnostics: PlaybackDiagnostic[],
  hasSoloedTrack: boolean,
  masterMuted: boolean,
  masterBlocked: boolean,
): TrackPlaybackPlan | null {
  // Enabled effects cannot be bypassed as dry audio without misrepresenting the saved topology.
  const midiEffects = getEnabledDevices(
    track.midiEffectIds,
    indexes.devicesById,
    `Track:${track.id}.midiEffectIds`,
  )
  const audioEffects = getEnabledDevices(
    track.audioEffectIds,
    indexes.devicesById,
    `Track:${track.id}.audioEffectIds`,
  )
  appendEffectDiagnostics(
    diagnostics,
    midiEffects,
    'midi-effect-chain-unsupported',
    'warning',
    track.id,
  )
  appendEffectDiagnostics(
    diagnostics,
    audioEffects,
    'track-audio-effect-chain-unsupported',
    'warning',
    track.id,
  )

  const instrument = decodeInstrumentPlan(track, indexes.devicesById, diagnostics)
  if (instrument === null || midiEffects.length > 0 || audioEffects.length > 0) return null

  // hasSoloedTrack includes every Track fact, even Track kinds this compiler cannot render.
  const audible =
    !masterBlocked &&
    !masterMuted &&
    !track.channel.muted &&
    (!hasSoloedTrack || track.channel.soloed)

  return Object.freeze({
    audible,
    gain: track.channel.gain,
    instrument,
    instrumentDeviceId: track.instrumentDeviceId,
    muted: track.channel.muted,
    pan: track.channel.pan,
    soloed: track.channel.soloed,
    trackId: track.id,
  })
}

/**
 * Projects Note starts in the Clip's half-open source window and clips their ends at the boundary.
 * Notes already active before the window are deliberately not chased in V1.
 */
function compileClipNoteSpans(
  trackPlan: TrackPlaybackPlan,
  clip: MidiClipRecord,
  partition: MidiNotePartitionSnapshot,
): readonly MidiNoteSpanPlan[] {
  if (!trackPlan.audible || clip.muted) return []

  const sourceWindowEndTick = addTicks(clip.sourceOffsetTick, clip.spanTick)
  const clipEndTick = addTicks(clip.startTick, clip.spanTick)
  const notes = [...partition.notes].sort(compareNotes)
  const spans: MidiNoteSpanPlan[] = []

  for (const note of notes) {
    if (note.startTick < clip.sourceOffsetTick || note.startTick >= sourceWindowEndTick) continue

    const sourceNoteEndTick = addTicks(note.startTick, note.durationTick)
    const clippedSourceEndTick = parseTick(Math.min(sourceNoteEndTick, sourceWindowEndTick))
    const projectStartTick = addTicks(
      clip.startTick,
      parseTick(note.startTick - clip.sourceOffsetTick),
    )
    const projectEndTick = addTicks(
      clip.startTick,
      parseTick(clippedSourceEndTick - clip.sourceOffsetTick),
    )

    if (projectEndTick > clipEndTick || projectEndTick <= projectStartTick) {
      throw new AudibleMidiCompilerError(
        'invalid-snapshot-reference',
        `Clip:${clip.id}.Note:${note.id}`,
        `Projected Note ${note.id} does not form a valid span inside Clip ${clip.id}`,
      )
    }

    // A Clip-scoped occurrence remains unique when equal-pitch Notes overlap in project time.
    spans.push(
      Object.freeze({
        channel: note.channel,
        clipId: clip.id,
        endTick: projectEndTick,
        noteId: note.id,
        occurrenceKey: createNoteOccurrenceKey(trackPlan.trackId, clip.id, clip.sourceId, note.id),
        pitch: note.pitch,
        sourceId: clip.sourceId,
        startTick: projectStartTick,
        trackId: trackPlan.trackId,
        velocity: note.velocity,
      }),
    )
  }

  return spans
}

function derivePlanStatus(
  masterBlocked: boolean,
  spanCount: number,
  diagnosticCount: number,
): AudibleMidiPlanStatus {
  // Blocking topology dominates; diagnostics otherwise distinguish partial from clean playback.
  if (masterBlocked) return AUDIBLE_MIDI_PLAN_STATUS.BLOCKED
  if (spanCount === 0) return AUDIBLE_MIDI_PLAN_STATUS.EMPTY
  if (diagnosticCount > 0) return AUDIBLE_MIDI_PLAN_STATUS.PARTIAL
  return AUDIBLE_MIDI_PLAN_STATUS.PLAYABLE
}

/** Compiles one stable Project Snapshot into a frozen, browser-independent MIDI playback plan. */
export function compileAudibleMidiProject(snapshot: ProjectSnapshot): AudibleMidiProjectPlan {
  const indexes = createSnapshotIndexes(snapshot)
  const tempoMap = createTempoMap(snapshot.tempoEvents)
  const diagnostics: PlaybackDiagnostic[] = []
  const trackPlans: TrackPlaybackPlan[] = []
  const noteSpans: MidiNoteSpanPlan[] = []
  // Compute global Solo before unsupported Track kinds are filtered out of executable plans.
  const hasSoloedTrack = snapshot.tracks.some(({ channel }) => channel.soloed)
  const enabledMasterEffects = getEnabledDevices(
    snapshot.master.audioEffectIds,
    indexes.devicesById,
    'Master.audioEffectIds',
  )
  const masterBlocked = enabledMasterEffects.length > 0

  // Master effects cannot be skipped per Track, so any enabled entry blocks the whole route.
  appendEffectDiagnostics(
    diagnostics,
    enabledMasterEffects,
    'master-audio-effect-chain-unsupported',
    'blocking',
  )

  for (const trackId of snapshot.trackOrder) {
    const track = requireReference(indexes.tracksById, trackId, `trackOrder:${trackId}`)
    if (track.kind === 'audio') {
      // Its Solo fact already participated above even though Audio Track playback is deferred.
      diagnostics.push(
        createDiagnostic({ code: 'audio-track-unsupported', severity: 'info', trackId }),
      )
      continue
    }

    const trackPlan = createTrackPlan(
      track,
      indexes,
      diagnostics,
      hasSoloedTrack,
      snapshot.master.muted,
      masterBlocked,
    )
    if (trackPlan === null) continue
    trackPlans.push(trackPlan)

    for (const clip of indexes.clipsByTrackId.get(track.id) ?? []) {
      if (clip.kind !== 'midi' || clip.muted || !trackPlan.audible) continue
      if (clip.loop !== null) {
        // Loop expansion is deferred; skip only this Clip so independent content can continue.
        diagnostics.push(
          createDiagnostic({
            clipId: clip.id,
            code: 'looped-midi-clip-unsupported',
            severity: 'warning',
            trackId: track.id,
          }),
        )
        continue
      }

      const partition = requireReference(
        indexes.notePartitionsBySourceId,
        clip.sourceId,
        `Clip:${clip.id}.notePartition`,
      )
      noteSpans.push(...compileClipNoteSpans(trackPlan, clip, partition))
    }
  }

  noteSpans.sort(compareNoteSpans)
  if (!masterBlocked && noteSpans.length === 0) {
    diagnostics.push(createDiagnostic({ code: 'no-audible-midi-note-spans', severity: 'info' }))
  }

  const status = derivePlanStatus(masterBlocked, noteSpans.length, diagnostics.length)
  // A blocked plan remains inspectable but must never expose events that a scheduler could run.
  const executableSpans = masterBlocked
    ? Object.freeze<MidiNoteSpanPlan[]>([])
    : Object.freeze(noteSpans)

  // Freeze the complete plan boundary so later runtimes cannot mutate compiled Project meaning.
  return Object.freeze({
    arrangementEndTick: indexes.arrangementEndTick,
    diagnostics: Object.freeze(diagnostics),
    master: Object.freeze({ gain: snapshot.master.gain, muted: snapshot.master.muted }),
    midiNoteSpans: executableSpans,
    modelRevision: snapshot.modelRevision,
    status,
    tempoSegments: tempoMap.segments,
    tracks: Object.freeze(trackPlans),
  })
}
