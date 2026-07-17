/**
 * Owns the one-shot registry for ModelStore's private write capability.
 *
 * ModelStore registers closures that can reach its ECMAScript #private fields;
 * MutationApplier claims those closures exactly once. Keeping the lease here avoids
 * public/protected fields, mutable container exposure, and generic path-based writes.
 */
import type { MasterChannelRecord } from './channel'
import type { DeviceDescriptor } from './device'
import type { MidiSourceId, TrackId } from './ids'
import type { ClipRecord } from './midi-clip'
import type { MidiNoteRecord } from './midi-note'
import type { MidiSourceRecord } from './midi-source'
import type { ModelRevision } from './model-revision'
import type { ProjectRecord } from './project'
import type { TrackRecord } from './track'
import type { TempoEventRecord } from '@/time/tempo-event'
import type { TimeSignatureEventRecord } from '@/time/time-signature-event'

export type ModelStoreWriteAccessErrorCode =
  | 'write-access-already-registered'
  | 'write-access-unavailable'
  | 'write-precondition-failed'

/** Internal failure of the single-writer storage boundary. */
export class ModelStoreWriteAccessError extends Error {
  readonly code: ModelStoreWriteAccessErrorCode

  constructor(code: ModelStoreWriteAccessErrorCode, message: string) {
    super(message)
    this.name = 'ModelStoreWriteAccessError'
    this.code = code
  }
}

/**
 * A narrow compare-and-swap surface over ModelStore.
 *
 * Each method checks its expected state before performing one logical container write.
 * The interface deliberately exposes neither tables nor general-purpose setters.
 */
export interface ModelStoreWriteAccess {
  readonly writeProject: (expected: ProjectRecord, next: ProjectRecord) => void
  readonly writeMaster: (expected: MasterChannelRecord, next: MasterChannelRecord) => void

  readonly writeTrack: (expected: TrackRecord | undefined, next: TrackRecord | undefined) => void
  readonly writeClip: (expected: ClipRecord | undefined, next: ClipRecord | undefined) => void
  readonly writeMidiSource: (
    expected: MidiSourceRecord | undefined,
    next: MidiSourceRecord | undefined,
  ) => void
  readonly writeTempoEvent: (
    expected: TempoEventRecord | undefined,
    next: TempoEventRecord | undefined,
  ) => void
  readonly writeTimeSignatureEvent: (
    expected: TimeSignatureEventRecord | undefined,
    next: TimeSignatureEventRecord | undefined,
  ) => void
  readonly writeDevice: (
    expected: DeviceDescriptor | undefined,
    next: DeviceDescriptor | undefined,
  ) => void

  readonly insertTrackOrder: (index: number, trackId: TrackId) => void
  readonly removeTrackOrder: (index: number, trackId: TrackId) => void

  readonly insertMidiNotePartition: (
    sourceId: MidiSourceId,
    notes: readonly MidiNoteRecord[],
  ) => void
  readonly removeMidiNotePartition: (
    sourceId: MidiSourceId,
    expectedNotes: readonly MidiNoteRecord[],
  ) => void
  readonly writeMidiNote: (
    sourceId: MidiSourceId,
    expected: MidiNoteRecord | undefined,
    next: MidiNoteRecord | undefined,
  ) => void

  readonly commitModelRevision: (expected: ModelRevision, next: ModelRevision) => void
}

const writeAccessByStore = new WeakMap<object, ModelStoreWriteAccess>()
const everRegisteredStores = new WeakSet<object>()

/** @internal Only ModelStore may register a capability. */
export function registerModelStoreWriteAccess(
  store: object,
  writeAccess: ModelStoreWriteAccess,
): void {
  if (everRegisteredStores.has(store)) {
    throw new ModelStoreWriteAccessError(
      'write-access-already-registered',
      'ModelStore write access has already been registered',
    )
  }

  // Registration history survives claim so a consumed lease can never be recreated.
  everRegisteredStores.add(store)
  writeAccessByStore.set(store, Object.freeze(writeAccess))
}

/** @internal Only MutationApplier may consume the one-shot capability. */
export function claimModelStoreWriteAccess(store: object): ModelStoreWriteAccess {
  const writeAccess = writeAccessByStore.get(store)

  if (writeAccess === undefined) {
    throw new ModelStoreWriteAccessError(
      'write-access-unavailable',
      'ModelStore write access is unavailable or has already been claimed',
    )
  }

  // Deleting before returning makes the lease non-recoverable, even if construction fails later.
  writeAccessByStore.delete(store)

  return writeAccess
}
