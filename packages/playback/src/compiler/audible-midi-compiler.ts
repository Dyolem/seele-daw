import {
  addTicks,
  diffSnapshotRecords,
  parseTick,
  type ClipId,
  type ClipRecord,
  type DeviceDescriptor,
  type DeviceId,
  type InstrumentTrackRecord,
  type MidiClipRecord,
  type MidiNoteRecord,
  type MidiSourceId,
  type MidiSourcePartitions,
  type MidiSustainPedalEventRecord,
  type ProjectSnapshot,
  type TrackId,
  type TrackRecord,
} from '@seele-daw/project-core'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  compareNoteSpans,
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
import {
  createSustainPedalReleaseResolver,
  type SustainPedalReleaseResolver,
} from './sustain-pedal-release'
import {
  SAMPLE_INSTRUMENT_DEVICE_DEFINITION,
  decodeSampleInstrumentDeviceState,
} from '#internal/sample-instrument-device'
import { createTempoMap } from '#internal/time/tempo-map'
import { deriveAudibleMidiTimelineRange } from '#internal/timeline/audible-midi-timeline'

// These IDs only classify V1 routing failures; they do not define FM or VA state/runtime contracts.

interface SnapshotIndexes {
  readonly tracksById: ReadonlyMap<TrackId, TrackRecord>
  readonly devicesById: ReadonlyMap<DeviceId, DeviceDescriptor>
  readonly notesBySourceId: ReadonlyMap<MidiSourceId, readonly MidiNoteRecord[]>
  readonly sustainPedalEventsBySourceId: ReadonlyMap<
    MidiSourceId,
    readonly MidiSustainPedalEventRecord[]
  >
  readonly clipsByTrackId: ReadonlyMap<TrackId, readonly ClipRecord[]>
}

interface CompiledClip {
  readonly notes: readonly MidiNoteRecord[]
  readonly spans: readonly MidiNoteSpanPlan[]
  readonly sustainPedalEvents: readonly MidiSustainPedalEventRecord[]
}

const NO_CLIP_SPANS: ReadonlyMap<ClipId, readonly MidiNoteSpanPlan[]> = new Map()

/**
 * Each Clip's spans, kept while its record and its Source's note and pedal arrays are the same.
 * Snapshots share the arrays of untouched Sources, so an edit compiles only the Clips it touched.
 */
const compiledClips = new WeakMap<MidiClipRecord, CompiledClip>()
const sustainPedalResolvers = new WeakMap<
  readonly MidiSustainPedalEventRecord[],
  SustainPedalReleaseResolver
>()

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

function indexById<Entity extends { readonly id: string }>(
  entities: readonly Entity[],
): Map<Entity['id'], Entity> {
  return new Map(entities.map((entity) => [entity.id, entity]))
}

function indexPartitions<RecordType>(
  partitions: MidiSourcePartitions<RecordType>,
): Map<MidiSourceId, readonly RecordType[]> {
  return new Map(Object.entries(partitions) as [MidiSourceId, readonly RecordType[]][])
}

/** Indexes a Snapshot. Its project facts are valid, so every reference the compiler follows resolves. */
function createSnapshotIndexes(snapshot: ProjectSnapshot): SnapshotIndexes {
  const clipsByTrackId = new Map<TrackId, ClipRecord[]>()
  for (const clip of snapshot.clips) {
    const clips = clipsByTrackId.get(clip.trackId)
    if (clips === undefined) clipsByTrackId.set(clip.trackId, [clip])
    else clips.push(clip)
  }
  for (const clips of clipsByTrackId.values()) clips.sort(compareClips)

  return {
    clipsByTrackId,
    devicesById: indexById(snapshot.devices),
    notesBySourceId: indexPartitions(snapshot.midiNotes),
    sustainPedalEventsBySourceId: indexPartitions(snapshot.midiSustainPedalEvents),
    tracksById: indexById(snapshot.tracks),
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
): readonly DeviceDescriptor[] {
  // Disabled effects remain persisted facts but are transparent to the V1 playback route.
  return deviceIds.map((deviceId) => devicesById.get(deviceId)!).filter(({ enabled }) => enabled)
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
  const device = devicesById.get(track.instrumentDeviceId)!

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
  const code: PlaybackDiagnosticCode =
    device.typeId === SAMPLE_INSTRUMENT_DEVICE_DEFINITION.typeId
      ? 'invalid-sample-instrument-state'
      : 'instrument-runtime-missing'

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
  const midiEffects = getEnabledDevices(track.midiEffectIds, indexes.devicesById)
  const audioEffects = getEnabledDevices(track.audioEffectIds, indexes.devicesById)
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

function resolveSustainPedalReleases(
  events: readonly MidiSustainPedalEventRecord[],
): SustainPedalReleaseResolver {
  let resolver = sustainPedalResolvers.get(events)
  if (resolver === undefined) {
    resolver = createSustainPedalReleaseResolver(events)
    sustainPedalResolvers.set(events, resolver)
  }
  return resolver
}

/**
 * The Clip's spans. They are kept while the Clip record and its Source's Note and pedal arrays are
 * the same; when only the Notes changed, the spans of Notes that are still the same records are
 * kept too, and only the written Notes are compiled.
 */
function compiledClipNoteSpans(
  clip: MidiClipRecord,
  notes: readonly MidiNoteRecord[],
  sustainPedalEvents: readonly MidiSustainPedalEventRecord[],
): readonly MidiNoteSpanPlan[] {
  const compiled = compiledClips.get(clip)
  if (compiled?.sustainPedalEvents === sustainPedalEvents && compiled.notes === notes) {
    return compiled.spans
  }
  const compile = noteSpanCompiler(clip, resolveSustainPedalReleases(sustainPedalEvents))
  const spans =
    compiled?.sustainPedalEvents === sustainPedalEvents
      ? updateNoteSpans(compiled, notes, compile)
      : Object.freeze(sortedSpans(notes, compile))
  compiledClips.set(clip, Object.freeze({ notes, spans, sustainPedalEvents }))
  return spans
}

/**
 * Compiles one Note into a span: its start in the Clip's half-open source window, its end clipped
 * at the boundary. A Note outside the window has none; Notes already active before the window are
 * deliberately not chased in V1.
 */
function noteSpanCompiler(
  clip: MidiClipRecord,
  sustainPedalReleaseResolver: SustainPedalReleaseResolver,
): (note: MidiNoteRecord) => MidiNoteSpanPlan | null {
  const sourceWindowEndTick = addTicks(clip.sourceOffsetTick, clip.spanTick)

  return (note) => {
    if (note.startTick < clip.sourceOffsetTick || note.startTick >= sourceWindowEndTick) return null

    const sourceNoteEndTick = addTicks(note.startTick, note.durationTick)
    const clippedSourceEndTick = parseTick(Math.min(sourceNoteEndTick, sourceWindowEndTick))
    const finalSourceReleaseTick = sustainPedalReleaseResolver.resolveFinalReleaseTick(
      note.channel,
      clippedSourceEndTick,
      sourceWindowEndTick,
    )
    const projectTick = (sourceTick: number) =>
      addTicks(clip.startTick, parseTick(sourceTick - clip.sourceOffsetTick))

    // A Clip-scoped occurrence remains unique when equal-pitch Notes overlap in project time.
    return Object.freeze({
      channel: note.channel,
      clipId: clip.id,
      endTick: projectTick(clippedSourceEndTick),
      noteId: note.id,
      occurrenceKey: createNoteOccurrenceKey(clip.trackId, clip.id, clip.sourceId, note.id),
      pitch: note.pitch,
      releaseTick: projectTick(finalSourceReleaseTick),
      sourceId: clip.sourceId,
      startTick: projectTick(note.startTick),
      trackId: clip.trackId,
      velocity: note.velocity,
    })
  }
}

function sortedSpans(
  notes: readonly MidiNoteRecord[],
  compile: (note: MidiNoteRecord) => MidiNoteSpanPlan | null,
): MidiNoteSpanPlan[] {
  const spans: MidiNoteSpanPlan[] = []
  for (const note of notes) {
    const span = compile(note)
    if (span !== null) spans.push(span)
  }
  return spans.sort(compareNoteSpans)
}

/** The previous spans with those of removed or rewritten Notes dropped and new ones merged in. */
function updateNoteSpans(
  compiled: CompiledClip,
  notes: readonly MidiNoteRecord[],
  compile: (note: MidiNoteRecord) => MidiNoteSpanPlan | null,
): readonly MidiNoteSpanPlan[] {
  const { droppedIds, written: writtenNotes } = diffSnapshotRecords(compiled.notes, notes)
  const writtenSpans = sortedSpans(writtenNotes, compile)
  const spans: MidiNoteSpanPlan[] = []
  let written = 0
  for (const span of compiled.spans) {
    if (droppedIds.has(span.noteId)) continue
    while (written < writtenSpans.length && compareNoteSpans(writtenSpans[written]!, span) < 0) {
      spans.push(writtenSpans[written++]!)
    }
    spans.push(span)
  }
  while (written < writtenSpans.length) spans.push(writtenSpans[written++]!)
  return Object.freeze(spans)
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
  const timelineRange = deriveAudibleMidiTimelineRange(snapshot)
  const tempoMap = createTempoMap(snapshot.tempoEvents)
  const diagnostics: PlaybackDiagnostic[] = []
  const trackPlans: TrackPlaybackPlan[] = []
  const clipSpans = new Map<ClipId, readonly MidiNoteSpanPlan[]>()
  let spanCount = 0
  // Compute global Solo before unsupported Track kinds are filtered out of executable plans.
  const hasSoloedTrack = snapshot.tracks.some(({ channel }) => channel.soloed)
  const enabledMasterEffects = getEnabledDevices(
    snapshot.master.audioEffectIds,
    indexes.devicesById,
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
    const track = indexes.tracksById.get(trackId)!
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

      const sourceNotes = indexes.notesBySourceId.get(clip.sourceId)!
      const sustainPedalEvents = indexes.sustainPedalEventsBySourceId.get(clip.sourceId)!
      const spans = compiledClipNoteSpans(clip, sourceNotes, sustainPedalEvents)
      clipSpans.set(clip.id, spans)
      spanCount += spans.length
    }
  }

  if (!masterBlocked && spanCount === 0) {
    diagnostics.push(createDiagnostic({ code: 'no-audible-midi-note-spans', severity: 'info' }))
  }

  const status = derivePlanStatus(masterBlocked, spanCount, diagnostics.length)

  // Freeze the complete plan boundary so later runtimes cannot mutate compiled Project meaning.
  return Object.freeze({
    arrangementEndTick: timelineRange.contentEndTick,
    diagnostics: Object.freeze(diagnostics),
    master: Object.freeze({ gain: snapshot.master.gain, muted: snapshot.master.muted }),
    // A blocked plan remains inspectable but never exposes events that a scheduler could run.
    clipSpans: masterBlocked ? NO_CLIP_SPANS : clipSpans,
    modelRevision: snapshot.modelRevision,
    status,
    tempoSegments: tempoMap.segments,
    timelineEndTick: timelineRange.timelineEndTick,
    tracks: Object.freeze(trackPlans),
  })
}
