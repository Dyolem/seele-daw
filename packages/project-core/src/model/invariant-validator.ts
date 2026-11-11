/**
 * Validates the relations between records that record factories cannot check alone.
 *
 * The arrangement — Tracks, Clips, MIDI Sources, Devices, timeline events, the Track order and
 * which partitions exist — grows with the number of Tracks and Clips, so it is always checked
 * whole. Content, the records inside MIDI Source partitions, grows with the music. A full
 * validation checks all of it; a commit checks only the content it wrote, because it starts
 * from a valid model. Validation is read-only and its diagnostics are deterministic.
 */
import type { MidiClipRecord } from './midi-clip'
import type { MidiSourceRecord } from './midi-source'
import type { ModelStoreReader } from './model-store'
import {
  PARTITIONED_TABLE_NAMES,
  type PartitionedTableName,
  type PartitionedTableView,
  type StoredRecord,
} from './model-tables'
import type {
  DeviceId,
  MidiSourceId,
  MidiSustainPedalEventId,
  NoteId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from './ids'
import type { MidiNoteRecord } from './midi-note'
import type { TempoEventRecord } from '#internal/model/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/model/time-signature-event'

export type ModelEntityKind =
  | 'clip'
  | 'device'
  | 'master'
  | 'midi-note'
  | 'midi-note-partition'
  | 'midi-source'
  | 'midi-sustain-pedal-event'
  | 'midi-sustain-pedal-event-partition'
  | 'tempo-event'
  | 'time-signature-event'
  | 'track'

export type ModelInvariantCode =
  | 'clip-missing-midi-source'
  | 'clip-missing-track'
  | 'clip-outside-midi-source'
  | 'clip-track-kind-mismatch'
  | 'device-missing'
  | 'device-ownership'
  | 'midi-source-missing-note-partition'
  | 'midi-source-missing-sustain-pedal-event-partition'
  | 'midi-source-ownership'
  | 'note-id-duplicate'
  | 'note-outside-midi-source'
  | 'note-partition-missing-midi-source'
  | 'sustain-pedal-event-duplicate-tick-channel'
  | 'sustain-pedal-event-id-duplicate'
  | 'sustain-pedal-event-outside-midi-source'
  | 'sustain-pedal-event-partition-missing-midi-source'
  | 'table-key-id-mismatch'
  | 'tempo-duplicate-tick'
  | 'tempo-initial-event-count'
  | 'time-signature-duplicate-tick'
  | 'time-signature-initial-event-count'
  | 'track-missing-from-order'
  | 'track-order-duplicate'
  | 'track-order-missing-track'

export interface ModelInvariantSubject {
  readonly kind: ModelEntityKind
  readonly id: string
}

export interface ModelInvariantViolation {
  readonly code: ModelInvariantCode
  readonly message: string
  readonly subjects: readonly ModelInvariantSubject[]
}

export class ModelInvariantError extends Error {
  readonly violations: readonly ModelInvariantViolation[]

  constructor(violations: readonly ModelInvariantViolation[]) {
    const copiedViolations = [...violations]
    const violationLabel = copiedViolations.length === 1 ? 'violation' : 'violations'

    super(`Model contains ${copiedViolations.length} invariant ${violationLabel}`)
    this.name = 'ModelInvariantError'
    this.violations = copiedViolations
  }
}

/** The content a set of changes wrote, as the projection that applied them records it. */
export interface WrittenContent {
  /** MIDI Sources whose record was written or whose partitions were inserted or removed. */
  readonly sources: ReadonlySet<MidiSourceId>
  /** Partition records written one at a time, by table and MIDI Source. */
  readonly records: {
    readonly [Name in PartitionedTableName]: ReadonlyMap<MidiSourceId, ReadonlySet<string>>
  }
  /** The IDs each partitioned table gained, one at a time or with a new partition. */
  readonly insertedIds: { readonly [Name in PartitionedTableName]: ReadonlySet<string> }
}

type ViolationList = ModelInvariantViolation[]

interface DeviceReference {
  readonly owner: ModelInvariantSubject
  readonly slot: string
}

interface RecordOccurrence {
  readonly sourceId: MidiSourceId
  readonly tableKey: string
}

interface SustainPedalEventsAtPosition {
  readonly tick: number
  readonly channel: number
  readonly eventIds: MidiSustainPedalEventId[]
}

/** How the duplicate-ID diagnostics of one partitioned table name its records. */
const ID_DUPLICATE_DIAGNOSTICS = Object.freeze({
  midiNotes: { code: 'note-id-duplicate', kind: 'midi-note', label: 'MIDI Note' },
  midiSustainPedalEvents: {
    code: 'sustain-pedal-event-id-duplicate',
    kind: 'midi-sustain-pedal-event',
    label: 'MIDI Sustain Pedal Event',
  },
} as const satisfies Record<
  PartitionedTableName,
  { readonly code: ModelInvariantCode; readonly kind: ModelEntityKind; readonly label: string }
>)

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function compareSubjects(left: ModelInvariantSubject, right: ModelInvariantSubject): number {
  return compareStrings(`${left.kind}\u0000${left.id}`, `${right.kind}\u0000${right.id}`)
}

function subject(kind: ModelEntityKind, id: string): ModelInvariantSubject {
  return { kind, id }
}

function uniqueSortedSubjects(
  subjects: readonly ModelInvariantSubject[],
): readonly ModelInvariantSubject[] {
  const subjectsByKey = new Map<string, ModelInvariantSubject>()

  for (const item of subjects) {
    subjectsByKey.set(`${item.kind}\u0000${item.id}`, item)
  }

  return [...subjectsByKey.values()].sort(compareSubjects)
}

function addViolation(
  violations: ViolationList,
  code: ModelInvariantCode,
  message: string,
  subjects: readonly ModelInvariantSubject[] = [],
): void {
  violations.push({
    code,
    message,
    subjects: uniqueSortedSubjects(subjects),
  })
}

function addTableKeyMismatch(
  violations: ViolationList,
  tableName: string,
  kind: ModelEntityKind,
  tableKey: string,
  recordId: string,
): void {
  addViolation(
    violations,
    'table-key-id-mismatch',
    `${tableName} table key ${tableKey} does not match record ID ${recordId}`,
    [subject(kind, tableKey), subject(kind, recordId)],
  )
}

function validateTableKeys<Id extends string, RecordType extends { readonly id: Id }>(
  entries: Iterable<readonly [Id, RecordType]>,
  tableName: string,
  kind: ModelEntityKind,
  violations: ViolationList,
): void {
  for (const [tableKey, record] of entries) {
    if (tableKey !== record.id) {
      addTableKeyMismatch(violations, tableName, kind, tableKey, record.id)
    }
  }
}

function validateTrackOrder(model: ModelStoreReader, violations: ViolationList): void {
  const orderedTrackIds = [...model.orderedTrackIds()]
  const seenTrackIds = new Set<TrackId>()
  const reportedDuplicates = new Set<TrackId>()
  const reportedMissingTracks = new Set<TrackId>()

  for (const trackId of orderedTrackIds) {
    if (seenTrackIds.has(trackId) && !reportedDuplicates.has(trackId)) {
      addViolation(
        violations,
        'track-order-duplicate',
        `Track ID ${trackId} appears more than once in trackOrder`,
        [subject('track', trackId)],
      )
      reportedDuplicates.add(trackId)
    }

    seenTrackIds.add(trackId)

    if (model.getTrack(trackId) === undefined && !reportedMissingTracks.has(trackId)) {
      addViolation(
        violations,
        'track-order-missing-track',
        `trackOrder references missing Track ${trackId}`,
        [subject('track', trackId)],
      )
      reportedMissingTracks.add(trackId)
    }
  }

  for (const [trackId] of model.trackEntries()) {
    if (!seenTrackIds.has(trackId)) {
      addViolation(
        violations,
        'track-missing-from-order',
        `Track ${trackId} does not appear in trackOrder`,
        [subject('track', trackId)],
      )
    }
  }
}

function validateClipSourceRange(
  clip: MidiClipRecord,
  source: MidiSourceRecord,
  violations: ViolationList,
): void {
  const sourceEndTick =
    clip.loop === null
      ? clip.sourceOffsetTick + clip.spanTick
      : clip.loop.sourceStartTick + clip.loop.sourceSpanTick

  if (!Number.isSafeInteger(sourceEndTick) || sourceEndTick > source.lengthTick) {
    addViolation(
      violations,
      'clip-outside-midi-source',
      `MIDI Clip ${clip.id} reads through Tick ${sourceEndTick} beyond Source ${source.id} length ${source.lengthTick}`,
      [subject('clip', clip.id), subject('midi-source', source.id)],
    )
  }
}

function validateClips(
  model: ModelStoreReader,
  violations: ViolationList,
): ReadonlyMap<MidiSourceId, readonly string[]> {
  const clipIdsBySource = new Map<MidiSourceId, string[]>()

  for (const [, clip] of model.clipEntries()) {
    const track = model.getTrack(clip.trackId)

    if (track === undefined) {
      addViolation(
        violations,
        'clip-missing-track',
        `Clip ${clip.id} references missing Track ${clip.trackId}`,
        [subject('clip', clip.id), subject('track', clip.trackId)],
      )
    } else if (clip.kind === 'midi' && track.kind !== 'instrument') {
      addViolation(
        violations,
        'clip-track-kind-mismatch',
        `MIDI Clip ${clip.id} belongs to non-Instrument Track ${track.id}`,
        [subject('clip', clip.id), subject('track', track.id)],
      )
    }

    const sourceClipIds = clipIdsBySource.get(clip.sourceId)

    if (sourceClipIds === undefined) {
      clipIdsBySource.set(clip.sourceId, [clip.id])
    } else {
      sourceClipIds.push(clip.id)
    }

    const source = model.getMidiSource(clip.sourceId)

    if (source === undefined) {
      addViolation(
        violations,
        'clip-missing-midi-source',
        `MIDI Clip ${clip.id} references missing MIDI Source ${clip.sourceId}`,
        [subject('clip', clip.id), subject('midi-source', clip.sourceId)],
      )
    } else {
      validateClipSourceRange(clip, source, violations)
    }
  }

  return clipIdsBySource
}

/** Each Source has one Clip and both partitions, and each partition has its Source. */
function validateMidiSources(
  model: ModelStoreReader,
  clipIdsBySource: ReadonlyMap<MidiSourceId, readonly string[]>,
  violations: ViolationList,
): void {
  for (const [sourceId] of model.midiSourceEntries()) {
    const clipIds = [...(clipIdsBySource.get(sourceId) ?? [])].sort(compareStrings)

    if (clipIds.length !== 1) {
      addViolation(
        violations,
        'midi-source-ownership',
        `MIDI Source ${sourceId} is referenced by ${clipIds.length} Clips${clipIds.length === 0 ? '' : `: ${clipIds.join(', ')}`}`,
        [subject('midi-source', sourceId), ...clipIds.map((clipId) => subject('clip', clipId))],
      )
    }

    if (!model.hasMidiNotePartition(sourceId)) {
      addViolation(
        violations,
        'midi-source-missing-note-partition',
        `MIDI Source ${sourceId} has no MIDI Note partition`,
        [subject('midi-source', sourceId), subject('midi-note-partition', sourceId)],
      )
    }

    if (!model.hasMidiSustainPedalEventPartition(sourceId)) {
      addViolation(
        violations,
        'midi-source-missing-sustain-pedal-event-partition',
        `MIDI Source ${sourceId} has no MIDI Sustain Pedal Event partition`,
        [subject('midi-source', sourceId), subject('midi-sustain-pedal-event-partition', sourceId)],
      )
    }
  }

  for (const sourceId of model.midiNotePartitionIds()) {
    if (model.getMidiSource(sourceId) === undefined) {
      addViolation(
        violations,
        'note-partition-missing-midi-source',
        `MIDI Note partition ${sourceId} has no matching MIDI Source`,
        [subject('midi-note-partition', sourceId), subject('midi-source', sourceId)],
      )
    }
  }

  for (const sourceId of model.midiSustainPedalEventPartitionIds()) {
    if (model.getMidiSource(sourceId) === undefined) {
      addViolation(
        violations,
        'sustain-pedal-event-partition-missing-midi-source',
        `MIDI Sustain Pedal Event partition ${sourceId} has no matching MIDI Source`,
        [subject('midi-sustain-pedal-event-partition', sourceId), subject('midi-source', sourceId)],
      )
    }
  }
}

function validateTimelineEvents<
  Id extends string,
  EventType extends { readonly id: Id; readonly tick: number },
>(
  entries: Iterable<readonly [Id, EventType]>,
  tableName: string,
  kind: 'tempo-event' | 'time-signature-event',
  initialEventCode: 'tempo-initial-event-count' | 'time-signature-initial-event-count',
  duplicateTickCode: 'tempo-duplicate-tick' | 'time-signature-duplicate-tick',
  violations: ViolationList,
): void {
  const eventIdsByTick = new Map<number, string[]>()

  for (const [tableKey, event] of entries) {
    if (tableKey !== event.id) {
      addTableKeyMismatch(violations, tableName, kind, tableKey, event.id)
    }

    const eventIds = eventIdsByTick.get(event.tick)

    if (eventIds === undefined) {
      eventIdsByTick.set(event.tick, [event.id])
    } else {
      eventIds.push(event.id)
    }
  }

  const initialEventIds = [...(eventIdsByTick.get(0) ?? [])].sort(compareStrings)

  if (initialEventIds.length !== 1) {
    addViolation(
      violations,
      initialEventCode,
      `Expected exactly one ${tableName} at Tick 0, found ${initialEventIds.length}`,
      initialEventIds.map((eventId) => subject(kind, eventId)),
    )
  }

  for (const [tick, eventIds] of eventIdsByTick) {
    if (eventIds.length > 1) {
      const sortedEventIds = [...eventIds].sort(compareStrings)

      addViolation(
        violations,
        duplicateTickCode,
        `${tableName} records ${sortedEventIds.join(', ')} share Tick ${tick}`,
        sortedEventIds.map((eventId) => subject(kind, eventId)),
      )
    }
  }
}

function describeDeviceReference(reference: DeviceReference): string {
  return `${reference.owner.kind}:${reference.owner.id}:${reference.slot}`
}

function addDeviceReference(
  referencesByDeviceId: Map<DeviceId, DeviceReference[]>,
  deviceId: DeviceId,
  owner: ModelInvariantSubject,
  slot: string,
): void {
  const references = referencesByDeviceId.get(deviceId)
  const reference = { owner, slot }

  if (references === undefined) {
    referencesByDeviceId.set(deviceId, [reference])
  } else {
    references.push(reference)
  }
}

function validateDevices(model: ModelStoreReader, violations: ViolationList): void {
  const referencesByDeviceId = new Map<DeviceId, DeviceReference[]>()

  for (const [, track] of model.trackEntries()) {
    const owner = subject('track', track.id)

    if (track.kind === 'instrument') {
      track.midiEffectIds.forEach((deviceId, index) => {
        addDeviceReference(referencesByDeviceId, deviceId, owner, `midiEffectIds[${index}]`)
      })
      addDeviceReference(
        referencesByDeviceId,
        track.instrumentDeviceId,
        owner,
        'instrumentDeviceId',
      )
    }

    track.audioEffectIds.forEach((deviceId, index) => {
      addDeviceReference(referencesByDeviceId, deviceId, owner, `audioEffectIds[${index}]`)
    })
  }

  const masterOwner = subject('master', 'master')

  model.master.audioEffectIds.forEach((deviceId, index) => {
    addDeviceReference(referencesByDeviceId, deviceId, masterOwner, `audioEffectIds[${index}]`)
  })

  for (const [deviceId, references] of referencesByDeviceId) {
    if (model.getDevice(deviceId) === undefined) {
      const sortedReferences = [...references].sort((left, right) =>
        compareStrings(describeDeviceReference(left), describeDeviceReference(right)),
      )

      addViolation(
        violations,
        'device-missing',
        `Device ${deviceId} is referenced from ${sortedReferences.map(describeDeviceReference).join(', ')} but has no Descriptor`,
        [subject('device', deviceId), ...sortedReferences.map((reference) => reference.owner)],
      )
    }
  }

  for (const [deviceId] of model.deviceEntries()) {
    const references = [...(referencesByDeviceId.get(deviceId) ?? [])].sort((left, right) =>
      compareStrings(describeDeviceReference(left), describeDeviceReference(right)),
    )

    if (references.length !== 1) {
      addViolation(
        violations,
        'device-ownership',
        `Device ${deviceId} is assigned to ${references.length} topology positions${references.length === 0 ? '' : `: ${references.map(describeDeviceReference).join(', ')}`}`,
        [subject('device', deviceId), ...references.map((reference) => reference.owner)],
      )
    }
  }

  // Slot-role compatibility needs Device Definitions; unknown implementations must remain loadable.
}

/** Every relation outside the partitions' records. */
function validateArrangement(model: ModelStoreReader, violations: ViolationList): void {
  // Local scalar validity belongs to entity factories; this pass only checks model-wide relations.
  validateTableKeys(model.trackEntries(), 'Track', 'track', violations)
  validateTableKeys(model.clipEntries(), 'Clip', 'clip', violations)
  validateTableKeys(model.midiSourceEntries(), 'MIDI Source', 'midi-source', violations)
  validateTableKeys(model.deviceEntries(), 'Device', 'device', violations)

  validateTrackOrder(model, violations)
  validateMidiSources(model, validateClips(model, violations), violations)

  validateTimelineEvents<TempoEventId, TempoEventRecord>(
    model.tempoEventEntries(),
    'Tempo Event',
    'tempo-event',
    'tempo-initial-event-count',
    'tempo-duplicate-tick',
    violations,
  )
  validateTimelineEvents<TimeSignatureEventId, TimeSignatureEventRecord>(
    model.timeSignatureEventEntries(),
    'Time Signature Event',
    'time-signature-event',
    'time-signature-initial-event-count',
    'time-signature-duplicate-tick',
    violations,
  )

  validateDevices(model, violations)
}

/** Notes fit inside their Source; a partition without a Source is reported by the arrangement. */
function validateNotes(
  source: MidiSourceRecord | undefined,
  notes: Iterable<readonly [NoteId, MidiNoteRecord]>,
  violations: ViolationList,
): void {
  for (const [noteTableKey, note] of notes) {
    if (noteTableKey !== note.id) {
      addTableKeyMismatch(violations, 'MIDI Note', 'midi-note', noteTableKey, note.id)
    }

    if (source === undefined) continue

    const noteEndTick = note.startTick + note.durationTick

    if (!Number.isSafeInteger(noteEndTick) || noteEndTick > source.lengthTick) {
      addViolation(
        violations,
        'note-outside-midi-source',
        `MIDI Note ${note.id} ends at Tick ${noteEndTick} beyond Source ${source.id} length ${source.lengthTick}`,
        [subject('midi-note', note.id), subject('midi-source', source.id)],
      )
    }
  }
}

/** Events fit inside their Source, and no two share a Tick and Channel. */
function validateSustainPedalEvents(
  model: ModelStoreReader,
  sourceId: MidiSourceId,
  violations: ViolationList,
): void {
  const source = model.getMidiSource(sourceId)
  const eventsByTickAndChannel = new Map<string, SustainPedalEventsAtPosition>()

  for (const [eventTableKey, event] of model.midiSustainPedalEventEntries(sourceId)) {
    if (eventTableKey !== event.id) {
      addTableKeyMismatch(
        violations,
        'MIDI Sustain Pedal Event',
        'midi-sustain-pedal-event',
        eventTableKey,
        event.id,
      )
    }

    if (source !== undefined && event.tick > source.lengthTick) {
      addViolation(
        violations,
        'sustain-pedal-event-outside-midi-source',
        `MIDI Sustain Pedal Event ${event.id} occurs at Tick ${event.tick} beyond Source ${source.id} length ${source.lengthTick}`,
        [subject('midi-sustain-pedal-event', event.id), subject('midi-source', source.id)],
      )
    }

    const tickAndChannelKey = `${event.tick}\u0000${event.channel}`
    const samePositionEvents = eventsByTickAndChannel.get(tickAndChannelKey)

    if (samePositionEvents === undefined) {
      eventsByTickAndChannel.set(tickAndChannelKey, {
        tick: event.tick,
        channel: event.channel,
        eventIds: [event.id],
      })
    } else {
      samePositionEvents.eventIds.push(event.id)
    }
  }

  for (const { tick, channel, eventIds } of eventsByTickAndChannel.values()) {
    if (eventIds.length < 2) continue

    const sortedEventIds = [...eventIds].sort(compareStrings)

    addViolation(
      violations,
      'sustain-pedal-event-duplicate-tick-channel',
      `MIDI Sustain Pedal Events ${sortedEventIds.join(', ')} share Tick ${tick} and Channel ${channel} in Source ${sourceId}`,
      [
        subject('midi-source', sourceId),
        ...sortedEventIds.map((eventId) => subject('midi-sustain-pedal-event', eventId)),
      ],
    )
  }
}

/** Record IDs stay project-wide unique even though storage is partitioned by Source. */
function validateUniqueIds(
  model: ModelStoreReader,
  tableName: PartitionedTableName,
  violations: ViolationList,
): void {
  const table: PartitionedTableView<StoredRecord> = model.partitionedTable(tableName)
  const seen = new Set<string>()
  let duplicated: Set<string> | undefined

  for (const sourceId of table.partitionIds()) {
    for (const [, record] of table.entries(sourceId)) {
      if (seen.has(record.id)) (duplicated ??= new Set()).add(record.id)
      else seen.add(record.id)
    }
  }

  if (duplicated === undefined) return

  const occurrencesById = new Map<string, RecordOccurrence[]>()

  for (const sourceId of table.partitionIds()) {
    for (const [tableKey, record] of table.entries(sourceId)) {
      if (!duplicated.has(record.id)) continue
      const occurrences = occurrencesById.get(record.id) ?? []
      occurrences.push({ sourceId, tableKey })
      occurrencesById.set(record.id, occurrences)
    }
  }

  const { code, kind, label } = ID_DUPLICATE_DIAGNOSTICS[tableName]

  for (const [id, occurrences] of occurrencesById) {
    const occurrenceLabels = occurrences
      .map(({ sourceId, tableKey }) => `${sourceId}/${tableKey}`)
      .sort(compareStrings)

    addViolation(
      violations,
      code,
      `${label} ID ${id} appears ${occurrences.length} times: ${occurrenceLabels.join(', ')}`,
      [subject(kind, id), ...occurrences.map(({ sourceId }) => subject('midi-source', sourceId))],
    )
  }
}

/**
 * Whether each inserted ID is in at most one partition. Each partition is probed from its
 * smaller side, so one new Note costs a lookup per partition and a whole import costs one pass.
 */
function insertedIdsStayUnique(
  table: PartitionedTableView<StoredRecord>,
  insertedIds: ReadonlySet<string>,
): boolean {
  if (insertedIds.size === 0) return true

  const found = new Set<string>()
  const claim = (id: string): boolean => {
    if (found.has(id)) return false
    found.add(id)
    return true
  }

  for (const sourceId of table.partitionIds()) {
    if (table.size(sourceId) < insertedIds.size) {
      for (const [id] of table.entries(sourceId)) {
        if (insertedIds.has(id) && !claim(id)) return false
      }
    } else {
      for (const id of insertedIds) {
        if (table.get(sourceId, id) !== undefined && !claim(id)) return false
      }
    }
  }

  return true
}

function compareViolations(left: ModelInvariantViolation, right: ModelInvariantViolation): number {
  const codeComparison = compareStrings(left.code, right.code)

  if (codeComparison !== 0) {
    return codeComparison
  }

  const messageComparison = compareStrings(left.message, right.message)

  if (messageComparison !== 0) {
    return messageComparison
  }

  const leftSubjects = left.subjects.map(({ kind, id }) => `${kind}:${id}`).join('|')
  const rightSubjects = right.subjects.map(({ kind, id }) => `${kind}:${id}`).join('|')

  return compareStrings(leftSubjects, rightSubjects)
}

/** Every invariant of the model, for a model that comes from outside: a seed, a file, a rollback. */
export function validateModelInvariants(
  model: ModelStoreReader,
): readonly ModelInvariantViolation[] {
  const violations: ViolationList = []

  validateArrangement(model, violations)

  for (const sourceId of model.midiNotePartitionIds()) {
    validateNotes(model.getMidiSource(sourceId), model.midiNoteEntries(sourceId), violations)
  }

  for (const sourceId of model.midiSustainPedalEventPartitionIds()) {
    validateSustainPedalEvents(model, sourceId, violations)
  }

  for (const tableName of PARTITIONED_TABLE_NAMES) {
    validateUniqueIds(model, tableName, violations)
  }

  // Sort only diagnostics, not valid entity tables, so the valid-model path stays linear.
  return violations.sort(compareViolations)
}

function* writtenNotes(
  model: ModelStoreReader,
  sourceId: MidiSourceId,
  noteIds: ReadonlySet<string>,
): Generator<readonly [NoteId, MidiNoteRecord]> {
  for (const noteId of noteIds as ReadonlySet<NoteId>) {
    const note = model.getMidiNote(sourceId, noteId)
    if (note !== undefined) yield [noteId, note]
  }
}

/**
 * The invariants a commit can break, on the model it produces from a valid one. Relations among
 * records it did not write still hold, so beyond the arrangement this checks the Notes it wrote,
 * the CC64 partitions it wrote into, every record of a Source it wrote, and the IDs it inserted.
 * A violation is reported as the full validation of the same model reports it.
 */
export function validateWrittenModelInvariants(
  model: ModelStoreReader,
  written: WrittenContent,
): readonly ModelInvariantViolation[] {
  const violations: ViolationList = []

  validateArrangement(model, violations)

  for (const sourceId of written.sources) {
    validateNotes(model.getMidiSource(sourceId), model.midiNoteEntries(sourceId), violations)
    validateSustainPedalEvents(model, sourceId, violations)
  }

  for (const [sourceId, noteIds] of written.records.midiNotes) {
    if (written.sources.has(sourceId)) continue
    validateNotes(model.getMidiSource(sourceId), writtenNotes(model, sourceId, noteIds), violations)
  }

  for (const sourceId of written.records.midiSustainPedalEvents.keys()) {
    if (!written.sources.has(sourceId)) validateSustainPedalEvents(model, sourceId, violations)
  }

  const idsStayUnique = PARTITIONED_TABLE_NAMES.every((tableName) =>
    insertedIdsStayUnique(model.partitionedTable(tableName), written.insertedIds[tableName]),
  )

  return violations.length === 0 && idsStayUnique ? violations : validateModelInvariants(model)
}

export function assertModelInvariants(model: ModelStoreReader): void {
  const violations = validateModelInvariants(model)

  if (violations.length > 0) {
    throw new ModelInvariantError(violations)
  }
}

export function assertWrittenModelInvariants(
  model: ModelStoreReader,
  written: WrittenContent,
): void {
  const violations = validateWrittenModelInvariants(model, written)

  if (violations.length > 0) {
    throw new ModelInvariantError(violations)
  }
}
