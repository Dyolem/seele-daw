/**
 * Validates cross-entity invariants across the normalized project model.
 *
 * Parsers and record factories enforce local value validity; this module inspects the
 * relationships that can only be verified with a complete ModelStore view. Validation
 * is read-only: it returns deterministic diagnostics and never mutates or repairs data.
 */
import type { MidiClipRecord } from './midi-clip'
import type { MidiSourceRecord } from './midi-source'
import type { ModelStoreReader } from './model-store'
import type {
  DeviceId,
  MidiSourceId,
  NoteId,
  TempoEventId,
  TimeSignatureEventId,
  TrackId,
} from './ids'
import type { TempoEventRecord } from '#internal/time/tempo-event'
import type { TimeSignatureEventRecord } from '#internal/time/time-signature-event'

export type ModelEntityKind =
  | 'clip'
  | 'device'
  | 'master'
  | 'midi-note'
  | 'midi-note-partition'
  | 'midi-source'
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
  | 'midi-source-ownership'
  | 'note-id-duplicate'
  | 'note-outside-midi-source'
  | 'note-partition-missing-midi-source'
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

type ViolationList = ModelInvariantViolation[]

interface DeviceReference {
  readonly owner: ModelInvariantSubject
  readonly slot: string
}

interface NoteOccurrence {
  readonly sourceId: MidiSourceId
  readonly tableKey: NoteId
}

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

function validateMidiSourcesAndNotes(
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
  }

  const noteOccurrencesById = new Map<NoteId, NoteOccurrence[]>()

  // A partition key expresses Source ownership, so bounds are validated against that Source.
  for (const sourceId of model.midiNotePartitionIds()) {
    const source = model.getMidiSource(sourceId)

    if (source === undefined) {
      addViolation(
        violations,
        'note-partition-missing-midi-source',
        `MIDI Note partition ${sourceId} has no matching MIDI Source`,
        [subject('midi-note-partition', sourceId), subject('midi-source', sourceId)],
      )
    }

    for (const [noteTableKey, note] of model.midiNoteEntries(sourceId)) {
      if (noteTableKey !== note.id) {
        addTableKeyMismatch(violations, 'MIDI Note', 'midi-note', noteTableKey, note.id)
      }

      const occurrences = noteOccurrencesById.get(note.id)
      const occurrence = { sourceId, tableKey: noteTableKey }

      if (occurrences === undefined) {
        noteOccurrencesById.set(note.id, [occurrence])
      } else {
        occurrences.push(occurrence)
      }

      if (source !== undefined) {
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
  }

  // Note IDs stay project-wide unique even though physical storage is partitioned by Source.
  for (const [noteId, occurrences] of noteOccurrencesById) {
    if (occurrences.length > 1) {
      const occurrenceLabels = occurrences
        .map(({ sourceId, tableKey }) => `${sourceId}/${tableKey}`)
        .sort(compareStrings)

      addViolation(
        violations,
        'note-id-duplicate',
        `MIDI Note ID ${noteId} appears ${occurrences.length} times: ${occurrenceLabels.join(', ')}`,
        [
          subject('midi-note', noteId),
          ...occurrences.map(({ sourceId }) => subject('midi-source', sourceId)),
        ],
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

export function validateModelInvariants(
  model: ModelStoreReader,
): readonly ModelInvariantViolation[] {
  const violations: ViolationList = []

  // Local scalar validity belongs to entity factories; this pass only checks model-wide relations.
  validateTableKeys(model.trackEntries(), 'Track', 'track', violations)
  validateTableKeys(model.clipEntries(), 'Clip', 'clip', violations)
  validateTableKeys(model.midiSourceEntries(), 'MIDI Source', 'midi-source', violations)
  validateTableKeys(model.deviceEntries(), 'Device', 'device', violations)

  validateTrackOrder(model, violations)

  const clipIdsBySource = validateClips(model, violations)
  validateMidiSourcesAndNotes(model, clipIdsBySource, violations)

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

  // Sort only diagnostics, not valid entity tables, so the valid-model path stays linear.
  return violations.sort(compareViolations)
}

export function assertModelInvariants(model: ModelStoreReader): void {
  const violations = validateModelInvariants(model)

  if (violations.length > 0) {
    throw new ModelInvariantError(violations)
  }
}
