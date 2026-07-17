import type { MasterChannelRecord } from '@/model/channel'
import type { DeviceDescriptor } from '@/model/device'
import type { MidiSourceId, TrackId } from '@/model/ids'
import type { ClipRecord } from '@/model/midi-clip'
import type { MidiNoteRecord } from '@/model/midi-note'
import type { MidiSourceRecord } from '@/model/midi-source'
import type { ProjectRecord } from '@/model/project'
import type { TrackRecord } from '@/model/track'
import type { TempoEventRecord } from '@/time/tempo-event'
import type { TimeSignatureEventRecord } from '@/time/time-signature-event'
import { MutationPlanError, type MutationPlanErrorCode } from './mutation-plan-error'
import { PROJECT_MUTATION_TYPE, type ProjectMutationType } from './mutation-type'

interface IdentifiedRecord {
  readonly id: unknown
}

interface EntityMutationTypeSet {
  readonly INSERT: ProjectMutationType
  readonly REMOVE: ProjectMutationType
  readonly REPLACE: ProjectMutationType
}

/**
 * The mutation vocabulary describes normalized storage changes, not user gestures.
 * Records remain immutable values while mutation wrappers carry the before/after
 * references needed for stale-state checks and deterministic inversion.
 */
export type EntityMutation<
  TypeSet extends EntityMutationTypeSet,
  RecordType extends IdentifiedRecord,
> =
  | {
      readonly type: TypeSet['INSERT']
      readonly after: RecordType
    }
  | {
      readonly type: TypeSet['REMOVE']
      readonly before: RecordType
    }
  | {
      readonly type: TypeSet['REPLACE']
      readonly before: RecordType
      readonly after: RecordType
    }

export interface ProjectReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.PROJECT.REPLACE
  readonly before: ProjectRecord
  readonly after: ProjectRecord
}

export interface MasterReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.MASTER.REPLACE
  readonly before: MasterChannelRecord
  readonly after: MasterChannelRecord
}

export type TrackMutation = EntityMutation<typeof PROJECT_MUTATION_TYPE.TRACK, TrackRecord>
export type ClipMutation = EntityMutation<typeof PROJECT_MUTATION_TYPE.CLIP, ClipRecord>
export type MidiSourceMutation = EntityMutation<
  typeof PROJECT_MUTATION_TYPE.MIDI_SOURCE,
  MidiSourceRecord
>
export type TempoEventMutation = EntityMutation<
  typeof PROJECT_MUTATION_TYPE.TEMPO_EVENT,
  TempoEventRecord
>
export type TimeSignatureEventMutation = EntityMutation<
  typeof PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT,
  TimeSignatureEventRecord
>
export type DeviceMutation = EntityMutation<typeof PROJECT_MUTATION_TYPE.DEVICE, DeviceDescriptor>

export interface TrackOrderInsertMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT
  readonly index: number
  readonly trackId: TrackId
}

export interface TrackOrderRemoveMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE
  readonly index: number
  readonly trackId: TrackId
}

export type TrackOrderMutation = TrackOrderInsertMutation | TrackOrderRemoveMutation

export interface NotePartitionInsertMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT
  readonly sourceId: MidiSourceId
  readonly after: readonly MidiNoteRecord[]
}

export interface NotePartitionRemoveMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE
  readonly sourceId: MidiSourceId
  readonly before: readonly MidiNoteRecord[]
}

export type NotePartitionMutation = NotePartitionInsertMutation | NotePartitionRemoveMutation

export interface NoteInsertMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.NOTE.INSERT
  readonly sourceId: MidiSourceId
  readonly after: MidiNoteRecord
}

export interface NoteRemoveMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.NOTE.REMOVE
  readonly sourceId: MidiSourceId
  readonly before: MidiNoteRecord
}

export interface NoteReplaceMutation {
  readonly type: typeof PROJECT_MUTATION_TYPE.NOTE.REPLACE
  readonly sourceId: MidiSourceId
  readonly before: MidiNoteRecord
  readonly after: MidiNoteRecord
}

export type NoteMutation = NoteInsertMutation | NoteRemoveMutation | NoteReplaceMutation

export type ProjectMutation =
  | ProjectReplaceMutation
  | MasterReplaceMutation
  | TrackMutation
  | ClipMutation
  | MidiSourceMutation
  | TempoEventMutation
  | TimeSignatureEventMutation
  | DeviceMutation
  | TrackOrderMutation
  | NotePartitionMutation
  | NoteMutation

function mutationPosition(index: number | null): string {
  return index === null ? 'Mutation' : `Mutation at index ${index}`
}

function rejectMutation(code: MutationPlanErrorCode, detail: string, index: number | null): never {
  throw new MutationPlanError(code, `${mutationPosition(index)} ${detail}`, index)
}

function assertReplacement(
  before: IdentifiedRecord,
  after: IdentifiedRecord,
  index: number | null,
): void {
  if (before === after) {
    rejectMutation('no-op-replace', 'must replace a record with a different reference', index)
  }

  if (before.id !== after.id) {
    rejectMutation('record-id-changed', 'cannot change a record identity during replacement', index)
  }
}

function assertMasterReplacement(
  before: MasterChannelRecord,
  after: MasterChannelRecord,
  index: number | null,
): void {
  if (before === after) {
    rejectMutation('no-op-replace', 'must replace a record with a different reference', index)
  }
}

function assertTrackOrderIndex(index: number, mutationIndex: number | null): void {
  if (!Number.isSafeInteger(index) || index < 0) {
    rejectMutation(
      'invalid-track-order-index',
      'requires a non-negative safe integer track-order index',
      mutationIndex,
    )
  }
}

function assertUniqueNoteIds(notes: readonly MidiNoteRecord[], mutationIndex: number | null): void {
  const noteIds = new Set<MidiNoteRecord['id']>()

  for (const note of notes) {
    if (noteIds.has(note.id)) {
      rejectMutation(
        'duplicate-note-id-in-partition',
        `contains duplicate MIDI Note ID ${note.id}`,
        mutationIndex,
      )
    }

    noteIds.add(note.id)
  }
}

function assertNeverMutation(mutation: never, index: number | null): never {
  const type = (mutation as { readonly type?: unknown }).type

  rejectMutation('unknown-mutation-type', `has an unknown type: ${String(type)}`, index)
}

function validateProjectMutation(mutation: ProjectMutation, index: number | null): void {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
    case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
    case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
    case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      assertReplacement(mutation.before, mutation.after, index)
      return

    case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
      assertMasterReplacement(mutation.before, mutation.after, index)
      return

    case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
    case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
      assertTrackOrderIndex(mutation.index, index)
      return

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
      assertUniqueNoteIds(mutation.after, index)
      return

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
      assertUniqueNoteIds(mutation.before, index)
      return

    case PROJECT_MUTATION_TYPE.TRACK.INSERT:
    case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
    case PROJECT_MUTATION_TYPE.CLIP.INSERT:
    case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
    case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
    case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
      return

    default:
      return assertNeverMutation(mutation, index)
  }
}

function copyProjectMutation(mutation: ProjectMutation, index: number | null): ProjectMutation {
  validateProjectMutation(mutation, index)

  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.TRACK.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.CLIP.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
      return Object.freeze({ type: mutation.type, after: mutation.after })
    case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
      return Object.freeze({ type: mutation.type, before: mutation.before })
    case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
      return Object.freeze({
        type: mutation.type,
        before: mutation.before,
        after: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
    case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
      return Object.freeze({
        type: mutation.type,
        index: mutation.index,
        trackId: mutation.trackId,
      })

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
      return Object.freeze({
        type: mutation.type,
        sourceId: mutation.sourceId,
        after: Object.freeze([...mutation.after]),
      })

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
      return Object.freeze({
        type: mutation.type,
        sourceId: mutation.sourceId,
        before: Object.freeze([...mutation.before]),
      })

    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
      return Object.freeze({
        type: mutation.type,
        sourceId: mutation.sourceId,
        after: mutation.after,
      })
    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
      return Object.freeze({
        type: mutation.type,
        sourceId: mutation.sourceId,
        before: mutation.before,
      })
    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      return Object.freeze({
        type: mutation.type,
        sourceId: mutation.sourceId,
        before: mutation.before,
        after: mutation.after,
      })

    default:
      return assertNeverMutation(mutation, index)
  }
}

function invertValidatedProjectMutation(mutation: ProjectMutation): ProjectMutation {
  switch (mutation.type) {
    case PROJECT_MUTATION_TYPE.PROJECT.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.PROJECT.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.MASTER.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.MASTER.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.TRACK.INSERT:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.TRACK.REMOVE, before: mutation.after })
    case PROJECT_MUTATION_TYPE.TRACK.REMOVE:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.TRACK.INSERT, after: mutation.before })
    case PROJECT_MUTATION_TYPE.TRACK.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TRACK.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.CLIP.INSERT:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.CLIP.REMOVE, before: mutation.after })
    case PROJECT_MUTATION_TYPE.CLIP.REMOVE:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.CLIP.INSERT, after: mutation.before })
    case PROJECT_MUTATION_TYPE.CLIP.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.CLIP.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE,
        before: mutation.after,
      })
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.INSERT,
        after: mutation.before,
      })
    case PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.MIDI_SOURCE.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE,
        before: mutation.after,
      })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.INSERT,
        after: mutation.before,
      })
    case PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TEMPO_EVENT.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE,
        before: mutation.after,
      })
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.INSERT,
        after: mutation.before,
      })
    case PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TIME_SIGNATURE_EVENT.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.DEVICE.INSERT:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.DEVICE.REMOVE, before: mutation.after })
    case PROJECT_MUTATION_TYPE.DEVICE.REMOVE:
      return Object.freeze({ type: PROJECT_MUTATION_TYPE.DEVICE.INSERT, after: mutation.before })
    case PROJECT_MUTATION_TYPE.DEVICE.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.DEVICE.REPLACE,
        before: mutation.after,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE,
        index: mutation.index,
        trackId: mutation.trackId,
      })

    case PROJECT_MUTATION_TYPE.TRACK_ORDER.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.TRACK_ORDER.INSERT,
        index: mutation.index,
        trackId: mutation.trackId,
      })

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE,
        sourceId: mutation.sourceId,
        before: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.NOTE_PARTITION.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.NOTE_PARTITION.INSERT,
        sourceId: mutation.sourceId,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.NOTE.INSERT:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.NOTE.REMOVE,
        sourceId: mutation.sourceId,
        before: mutation.after,
      })

    case PROJECT_MUTATION_TYPE.NOTE.REMOVE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.NOTE.INSERT,
        sourceId: mutation.sourceId,
        after: mutation.before,
      })

    case PROJECT_MUTATION_TYPE.NOTE.REPLACE:
      return Object.freeze({
        type: PROJECT_MUTATION_TYPE.NOTE.REPLACE,
        sourceId: mutation.sourceId,
        before: mutation.after,
        after: mutation.before,
      })

    default:
      return assertNeverMutation(mutation, null)
  }
}

/** Returns a frozen inverse while preserving all domain-record references. */
export function invertProjectMutation(mutation: ProjectMutation): ProjectMutation {
  return invertValidatedProjectMutation(copyProjectMutation(mutation, null))
}

/** @internal Normalizes a plan entry without exposing mutable mutation-owned arrays. */
export function copyProjectMutationForPlan(
  mutation: ProjectMutation,
  index: number,
): ProjectMutation {
  return copyProjectMutation(mutation, index)
}

/** @internal Inverts an entry already normalized by copyProjectMutationForPlan. */
export function invertNormalizedProjectMutation(mutation: ProjectMutation): ProjectMutation {
  return invertValidatedProjectMutation(mutation)
}
