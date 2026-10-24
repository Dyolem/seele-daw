import type { ModelRevision, ProjectCommit, TrackId } from '@seele-daw/project-core'

import {
  AUDIBLE_MIDI_PLAN_STATUS,
  type AudibleMidiProjectPlan,
  type MidiNoteSpanPlan,
  type NoteOccurrenceKey,
  type TrackPlaybackPlan,
} from '#internal/compiler/audible-midi-plan'

export const AUDIBLE_MIDI_RECONCILIATION_SCOPE = Object.freeze({
  GLOBAL_RESET: 'global-reset',
  SELECTIVE: 'selective',
} as const)

export type AudibleMidiReconciliationScope =
  (typeof AUDIBLE_MIDI_RECONCILIATION_SCOPE)[keyof typeof AUDIBLE_MIDI_RECONCILIATION_SCOPE]

export const AUDIBLE_MIDI_RECONCILIATION_REASON = Object.freeze({
  MASTER_ROUTE_CHANGED: 'master-route-changed',
  NEXT_PLAN_UNPLAYABLE: 'next-plan-unplayable',
  REVISION_CHAIN_GAP: 'revision-chain-gap',
  TEMPO_MAP_CHANGED: 'tempo-map-changed',
} as const)

export type AudibleMidiReconciliationReason =
  (typeof AUDIBLE_MIDI_RECONCILIATION_REASON)[keyof typeof AUDIBLE_MIDI_RECONCILIATION_REASON]

export const AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND = Object.freeze({
  ADDED: 'added',
  REMOVED: 'removed',
  UPDATED: 'updated',
} as const)

export type AudibleMidiOccurrenceChangeKind =
  (typeof AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND)[keyof typeof AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND]

export type AudibleMidiOccurrenceField =
  | 'channel'
  | 'clipId'
  | 'endTick'
  | 'pitch'
  | 'releaseTick'
  | 'sourceId'
  | 'startTick'
  | 'trackId'
  | 'velocity'

export const AUDIBLE_MIDI_TRACK_CHANGE_KIND = Object.freeze({
  ADDED: 'added',
  REMOVED: 'removed',
  UPDATED: 'updated',
} as const)

export type AudibleMidiTrackChangeKind =
  (typeof AUDIBLE_MIDI_TRACK_CHANGE_KIND)[keyof typeof AUDIBLE_MIDI_TRACK_CHANGE_KIND]

export type AudibleMidiTrackField =
  | 'audible'
  | 'gain'
  | 'instrumentDeviceId'
  | 'muted'
  | 'pan'
  | 'soloed'
  | 'soundbankId'

export interface AudibleMidiOccurrenceChange {
  readonly occurrenceKey: NoteOccurrenceKey
  readonly kind: AudibleMidiOccurrenceChangeKind
  readonly before: MidiNoteSpanPlan | null
  readonly after: MidiNoteSpanPlan | null
  readonly changedFields: readonly AudibleMidiOccurrenceField[]
}

export interface AudibleMidiTrackChange {
  readonly trackId: TrackId
  readonly kind: AudibleMidiTrackChangeKind
  readonly before: TrackPlaybackPlan | null
  readonly after: TrackPlaybackPlan | null
  readonly changedFields: readonly AudibleMidiTrackField[]
}

export interface AudibleMidiReconciliationPlan {
  readonly scope: AudibleMidiReconciliationScope
  readonly reasons: readonly AudibleMidiReconciliationReason[]
  readonly occurrenceChanges: readonly AudibleMidiOccurrenceChange[]
  readonly trackChanges: readonly AudibleMidiTrackChange[]
  readonly invalidatedPreviousOccurrenceKeys: readonly NoteOccurrenceKey[]
}

export interface CreateAudibleMidiReconciliationPlanInput {
  readonly previousPlan: AudibleMidiProjectPlan
  readonly nextPlan: AudibleMidiProjectPlan
  readonly commits: readonly ProjectCommit[]
}

export type AudibleMidiReconciliationErrorCode = 'invalid-revision-order'

/** Stable failure raised when two Plans cannot represent a forward reconciliation. */
export class AudibleMidiReconciliationError extends Error {
  readonly code: AudibleMidiReconciliationErrorCode

  constructor(code: AudibleMidiReconciliationErrorCode, message: string) {
    super(message)
    this.name = 'AudibleMidiReconciliationError'
    this.code = code
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function createTrackIndex(
  tracks: readonly TrackPlaybackPlan[],
): ReadonlyMap<TrackId, TrackPlaybackPlan> {
  return new Map(tracks.map((track) => [track.trackId, track]))
}

const OCCURRENCE_FIELDS = Object.freeze<readonly AudibleMidiOccurrenceField[]>([
  'trackId',
  'clipId',
  'sourceId',
  'startTick',
  'endTick',
  'releaseTick',
  'pitch',
  'velocity',
  'channel',
])

/** The fields that differ; null for the common case of none, without allocating. */
function occurrenceChangedFields(
  before: MidiNoteSpanPlan,
  after: MidiNoteSpanPlan,
): readonly AudibleMidiOccurrenceField[] | null {
  let fields: AudibleMidiOccurrenceField[] | null = null
  for (const field of OCCURRENCE_FIELDS) {
    if (before[field] !== after[field]) (fields ??= []).push(field)
  }
  return fields === null ? null : Object.freeze(fields)
}

function trackChangedFields(
  before: TrackPlaybackPlan,
  after: TrackPlaybackPlan,
): readonly AudibleMidiTrackField[] {
  const fields: AudibleMidiTrackField[] = []
  if (before.instrumentDeviceId !== after.instrumentDeviceId) fields.push('instrumentDeviceId')
  if (before.instrument.soundbankId !== after.instrument.soundbankId) fields.push('soundbankId')
  if (before.gain !== after.gain) fields.push('gain')
  if (before.pan !== after.pan) fields.push('pan')
  if (before.muted !== after.muted) fields.push('muted')
  if (before.soloed !== after.soloed) fields.push('soloed')
  if (before.audible !== after.audible) fields.push('audible')
  return Object.freeze(fields)
}

function commitsFormContinuousChain(
  commits: readonly ProjectCommit[],
  fromModelRevision: ModelRevision,
  toModelRevision: ModelRevision,
): boolean {
  if (commits.length === 0) return false
  let expectedBaseRevision = fromModelRevision

  for (const commit of commits) {
    if (commit.baseRevision !== expectedBaseRevision) return false
    expectedBaseRevision = commit.modelRevision
  }

  return expectedBaseRevision === toModelRevision
}

const NO_FIELDS = Object.freeze<readonly AudibleMidiOccurrenceField[]>([])

/**
 * The occurrences that were added, removed or changed. An edit usually touches a few of tens of
 * thousands, so the plans are walked once and only the changes are sorted.
 */
function createOccurrenceChanges(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
): readonly AudibleMidiOccurrenceChange[] {
  const removed = new Map(previousPlan.midiNoteSpans.map((span) => [span.occurrenceKey, span]))
  const changes: AudibleMidiOccurrenceChange[] = []

  for (const after of nextPlan.midiNoteSpans) {
    const { occurrenceKey } = after
    const before = removed.get(occurrenceKey)
    if (before === undefined) {
      changes.push(
        Object.freeze({
          after,
          before: null,
          changedFields: NO_FIELDS,
          kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.ADDED,
          occurrenceKey,
        }),
      )
      continue
    }
    removed.delete(occurrenceKey)
    const changedFields = occurrenceChangedFields(before, after)
    if (changedFields === null) continue
    changes.push(
      Object.freeze({
        after,
        before,
        changedFields,
        kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.UPDATED,
        occurrenceKey,
      }),
    )
  }
  for (const before of removed.values()) {
    changes.push(
      Object.freeze({
        after: null,
        before,
        changedFields: NO_FIELDS,
        kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.REMOVED,
        occurrenceKey: before.occurrenceKey,
      }),
    )
  }

  return Object.freeze(
    changes.sort((left, right) => compareStrings(left.occurrenceKey, right.occurrenceKey)),
  )
}

function createTrackChanges(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
): readonly AudibleMidiTrackChange[] {
  const previous = createTrackIndex(previousPlan.tracks)
  const next = createTrackIndex(nextPlan.tracks)
  const trackIds = [...new Set([...previous.keys(), ...next.keys()])].sort(compareStrings)
  const changes: AudibleMidiTrackChange[] = []

  for (const trackId of trackIds) {
    const before = previous.get(trackId) ?? null
    const after = next.get(trackId) ?? null
    if (before === null && after !== null) {
      changes.push(
        Object.freeze({
          after,
          before,
          changedFields: Object.freeze([]),
          kind: AUDIBLE_MIDI_TRACK_CHANGE_KIND.ADDED,
          trackId,
        }),
      )
      continue
    }
    if (before !== null && after === null) {
      changes.push(
        Object.freeze({
          after,
          before,
          changedFields: Object.freeze([]),
          kind: AUDIBLE_MIDI_TRACK_CHANGE_KIND.REMOVED,
          trackId,
        }),
      )
      continue
    }
    if (before === null || after === null) continue
    const changedFields = trackChangedFields(before, after)
    if (changedFields.length === 0) continue
    changes.push(
      Object.freeze({
        after,
        before,
        changedFields,
        kind: AUDIBLE_MIDI_TRACK_CHANGE_KIND.UPDATED,
        trackId,
      }),
    )
  }

  return Object.freeze(changes)
}

function tempoMapsHaveSameValues(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
): boolean {
  if (previousPlan.tempoSegments.length !== nextPlan.tempoSegments.length) return false
  return previousPlan.tempoSegments.every((previous, index) => {
    const next = nextPlan.tempoSegments[index]
    return (
      next !== undefined &&
      previous.bpm === next.bpm &&
      previous.secondsPerTick === next.secondsPerTick &&
      previous.startProjectSecond === next.startProjectSecond &&
      previous.startTick === next.startTick
    )
  })
}

function masterRoutesHaveSameValues(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
): boolean {
  return (
    previousPlan.master.gain === nextPlan.master.gain &&
    previousPlan.master.muted === nextPlan.master.muted
  )
}

function createReasons(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
  commits: readonly ProjectCommit[],
): readonly AudibleMidiReconciliationReason[] {
  const reasons: AudibleMidiReconciliationReason[] = []
  if (!commitsFormContinuousChain(commits, previousPlan.modelRevision, nextPlan.modelRevision)) {
    reasons.push(AUDIBLE_MIDI_RECONCILIATION_REASON.REVISION_CHAIN_GAP)
  }
  if (!tempoMapsHaveSameValues(previousPlan, nextPlan)) {
    reasons.push(AUDIBLE_MIDI_RECONCILIATION_REASON.TEMPO_MAP_CHANGED)
  }
  if (!masterRoutesHaveSameValues(previousPlan, nextPlan)) {
    reasons.push(AUDIBLE_MIDI_RECONCILIATION_REASON.MASTER_ROUTE_CHANGED)
  }
  if (
    nextPlan.status === AUDIBLE_MIDI_PLAN_STATUS.BLOCKED ||
    nextPlan.status === AUDIBLE_MIDI_PLAN_STATUS.EMPTY
  ) {
    reasons.push(AUDIBLE_MIDI_RECONCILIATION_REASON.NEXT_PLAN_UNPLAYABLE)
  }
  return Object.freeze(reasons)
}

/**
 * Compares two complete audible Plans while retaining the Project Commit chain that explains the
 * transition. The result describes semantic invalidation only; it never owns clocks or audio work.
 */
export function createAudibleMidiReconciliationPlan(
  input: CreateAudibleMidiReconciliationPlanInput,
): AudibleMidiReconciliationPlan {
  const { commits, nextPlan, previousPlan } = input
  if (nextPlan.modelRevision <= previousPlan.modelRevision) {
    throw new AudibleMidiReconciliationError(
      'invalid-revision-order',
      `Audible MIDI reconciliation requires a revision after ${previousPlan.modelRevision}`,
    )
  }

  const occurrenceChanges = createOccurrenceChanges(previousPlan, nextPlan)
  const trackChanges = createTrackChanges(previousPlan, nextPlan)

  const invalidatedPreviousOccurrenceKeys = new Set<NoteOccurrenceKey>()
  for (const change of occurrenceChanges) {
    if (change.before !== null) invalidatedPreviousOccurrenceKeys.add(change.occurrenceKey)
  }
  const invalidatedTrackIds = new Set(
    trackChanges
      .filter(({ kind }) => kind !== AUDIBLE_MIDI_TRACK_CHANGE_KIND.ADDED)
      .map(({ trackId }) => trackId),
  )
  if (invalidatedTrackIds.size > 0) {
    for (const span of previousPlan.midiNoteSpans) {
      if (invalidatedTrackIds.has(span.trackId)) {
        invalidatedPreviousOccurrenceKeys.add(span.occurrenceKey)
      }
    }
  }
  const reasons = createReasons(previousPlan, nextPlan, commits)

  return Object.freeze({
    invalidatedPreviousOccurrenceKeys: Object.freeze(
      [...invalidatedPreviousOccurrenceKeys].sort(compareStrings),
    ),
    occurrenceChanges,
    reasons,
    scope:
      reasons.length === 0
        ? AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE
        : AUDIBLE_MIDI_RECONCILIATION_SCOPE.GLOBAL_RESET,
    trackChanges,
  })
}
