import {
  PROJECT_COMMAND_TYPE,
  type ModelRevision,
  type ProjectCommandType,
  type ProjectCommit,
  type TrackId,
} from '@seele-daw/project-core'

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
  readonly commandTypes: readonly ProjectCommandType[]
}

export interface AudibleMidiTrackChange {
  readonly trackId: TrackId
  readonly kind: AudibleMidiTrackChangeKind
  readonly before: TrackPlaybackPlan | null
  readonly after: TrackPlaybackPlan | null
  readonly changedFields: readonly AudibleMidiTrackField[]
  readonly commandTypes: readonly ProjectCommandType[]
}

export interface AudibleMidiReconciliationPlan {
  readonly fromModelRevision: ModelRevision
  readonly toModelRevision: ModelRevision
  readonly scope: AudibleMidiReconciliationScope
  readonly reasons: readonly AudibleMidiReconciliationReason[]
  readonly occurrenceChanges: readonly AudibleMidiOccurrenceChange[]
  readonly trackChanges: readonly AudibleMidiTrackChange[]
  readonly affectedTrackIds: readonly TrackId[]
  readonly invalidatedPreviousOccurrenceKeys: readonly NoteOccurrenceKey[]
  readonly unchangedOccurrenceKeys: readonly NoteOccurrenceKey[]
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

function createOccurrenceIndex(
  spans: readonly MidiNoteSpanPlan[],
): ReadonlyMap<NoteOccurrenceKey, MidiNoteSpanPlan> {
  return new Map(spans.map((span) => [span.occurrenceKey, span]))
}

function createTrackIndex(
  tracks: readonly TrackPlaybackPlan[],
): ReadonlyMap<TrackId, TrackPlaybackPlan> {
  return new Map(tracks.map((track) => [track.trackId, track]))
}

function occurrenceChangedFields(
  before: MidiNoteSpanPlan,
  after: MidiNoteSpanPlan,
): readonly AudibleMidiOccurrenceField[] {
  const fields: AudibleMidiOccurrenceField[] = []
  if (before.trackId !== after.trackId) fields.push('trackId')
  if (before.clipId !== after.clipId) fields.push('clipId')
  if (before.sourceId !== after.sourceId) fields.push('sourceId')
  if (before.startTick !== after.startTick) fields.push('startTick')
  if (before.endTick !== after.endTick) fields.push('endTick')
  if (before.pitch !== after.pitch) fields.push('pitch')
  if (before.velocity !== after.velocity) fields.push('velocity')
  if (before.channel !== after.channel) fields.push('channel')
  return Object.freeze(fields)
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
    if (
      commit.baseRevision !== expectedBaseRevision ||
      commit.delta.modelRevision !== commit.modelRevision
    ) {
      return false
    }
    expectedBaseRevision = commit.modelRevision
  }

  return expectedBaseRevision === toModelRevision
}

function commandTypesForOccurrence(
  commits: readonly ProjectCommit[],
  before: MidiNoteSpanPlan | null,
  after: MidiNoteSpanPlan | null,
): readonly ProjectCommandType[] {
  const sourceId = after?.sourceId ?? before?.sourceId
  const noteId = after?.noteId ?? before?.noteId
  const clipId = after?.clipId ?? before?.clipId
  const trackId = after?.trackId ?? before?.trackId
  const commandTypes = new Set<ProjectCommandType>()

  for (const commit of commits) {
    if (
      commit.delta.changes.some((change) => {
        switch (change.type) {
          case 'midi-note.added':
          case 'midi-note.removed':
          case 'midi-note.updated':
            return change.sourceId === sourceId && change.noteId === noteId
          case 'midi-clip.added':
          case 'midi-clip.removed':
          case 'midi-clip.updated':
            return change.clipId === clipId
          case 'instrument-device.updated':
          case 'instrument-track.added':
          case 'instrument-track.removed':
            return change.trackId === trackId
        }
      })
    ) {
      commandTypes.add(commit.origin.commandType)
    }
  }

  return Object.freeze([...commandTypes].sort(compareStrings))
}

function commandTypesForTrack(
  commits: readonly ProjectCommit[],
  trackId: TrackId,
): readonly ProjectCommandType[] {
  const commandTypes = new Set<ProjectCommandType>()

  for (const commit of commits) {
    if (
      commit.delta.changes.some((change) => {
        switch (change.type) {
          case 'instrument-device.updated':
          case 'instrument-track.added':
          case 'instrument-track.removed':
          case 'midi-clip.added':
          case 'midi-clip.removed':
          case 'midi-clip.updated':
            return change.trackId === trackId
          case 'midi-note.added':
          case 'midi-note.removed':
          case 'midi-note.updated':
            return false
        }
      })
    ) {
      commandTypes.add(commit.origin.commandType)
    }
  }

  return Object.freeze([...commandTypes].sort(compareStrings))
}

function createOccurrenceChanges(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
  commits: readonly ProjectCommit[],
): readonly AudibleMidiOccurrenceChange[] {
  const previous = createOccurrenceIndex(previousPlan.midiNoteSpans)
  const next = createOccurrenceIndex(nextPlan.midiNoteSpans)
  const keys = [...new Set([...previous.keys(), ...next.keys()])].sort(compareStrings)
  const changes: AudibleMidiOccurrenceChange[] = []

  for (const occurrenceKey of keys) {
    const before = previous.get(occurrenceKey) ?? null
    const after = next.get(occurrenceKey) ?? null
    if (before === null && after !== null) {
      changes.push(
        Object.freeze({
          after,
          before,
          changedFields: Object.freeze([]),
          commandTypes: commandTypesForOccurrence(commits, before, after),
          kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.ADDED,
          occurrenceKey,
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
          commandTypes: commandTypesForOccurrence(commits, before, after),
          kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.REMOVED,
          occurrenceKey,
        }),
      )
      continue
    }
    if (before === null || after === null) continue
    const changedFields = occurrenceChangedFields(before, after)
    if (changedFields.length === 0) continue
    changes.push(
      Object.freeze({
        after,
        before,
        changedFields,
        commandTypes: commandTypesForOccurrence(commits, before, after),
        kind: AUDIBLE_MIDI_OCCURRENCE_CHANGE_KIND.UPDATED,
        occurrenceKey,
      }),
    )
  }

  return Object.freeze(changes)
}

function createTrackChanges(
  previousPlan: AudibleMidiProjectPlan,
  nextPlan: AudibleMidiProjectPlan,
  commits: readonly ProjectCommit[],
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
          commandTypes: commandTypesForTrack(commits, trackId),
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
          commandTypes: commandTypesForTrack(commits, trackId),
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
        commandTypes: commandTypesForTrack(commits, trackId),
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

  const occurrenceChanges = createOccurrenceChanges(previousPlan, nextPlan, commits)
  const trackChanges = createTrackChanges(previousPlan, nextPlan, commits)
  const affectedTrackIds = new Set<TrackId>(trackChanges.map(({ trackId }) => trackId))
  for (const change of occurrenceChanges) {
    if (change.before !== null) affectedTrackIds.add(change.before.trackId)
    if (change.after !== null) affectedTrackIds.add(change.after.trackId)
  }

  const invalidatedPreviousOccurrenceKeys = new Set<NoteOccurrenceKey>()
  for (const change of occurrenceChanges) {
    if (change.before !== null) invalidatedPreviousOccurrenceKeys.add(change.occurrenceKey)
  }
  const invalidatedTrackIds = new Set(
    trackChanges
      .filter(({ kind }) => kind !== AUDIBLE_MIDI_TRACK_CHANGE_KIND.ADDED)
      .map(({ trackId }) => trackId),
  )
  for (const span of previousPlan.midiNoteSpans) {
    if (invalidatedTrackIds.has(span.trackId)) {
      invalidatedPreviousOccurrenceKeys.add(span.occurrenceKey)
    }
  }

  const nextOccurrenceKeys = new Set(
    nextPlan.midiNoteSpans.map(({ occurrenceKey }) => occurrenceKey),
  )
  const unchangedOccurrenceKeys = previousPlan.midiNoteSpans
    .map(({ occurrenceKey }) => occurrenceKey)
    .filter(
      (occurrenceKey) =>
        nextOccurrenceKeys.has(occurrenceKey) &&
        !invalidatedPreviousOccurrenceKeys.has(occurrenceKey),
    )
    .sort(compareStrings)
  const reasons = createReasons(previousPlan, nextPlan, commits)

  return Object.freeze({
    affectedTrackIds: Object.freeze([...affectedTrackIds].sort(compareStrings)),
    fromModelRevision: previousPlan.modelRevision,
    invalidatedPreviousOccurrenceKeys: Object.freeze(
      [...invalidatedPreviousOccurrenceKeys].sort(compareStrings),
    ),
    occurrenceChanges,
    reasons,
    scope:
      reasons.length === 0
        ? AUDIBLE_MIDI_RECONCILIATION_SCOPE.SELECTIVE
        : AUDIBLE_MIDI_RECONCILIATION_SCOPE.GLOBAL_RESET,
    toModelRevision: nextPlan.modelRevision,
    trackChanges,
    unchangedOccurrenceKeys: Object.freeze(unchangedOccurrenceKeys),
  })
}

/** Current Note commands whose active-voice behavior is intentionally operation-specific. */
export const AUDIBLE_MIDI_NOTE_RECONCILIATION_COMMAND_TYPES = Object.freeze([
  PROJECT_COMMAND_TYPE.MIDI_NOTE.ADD,
  PROJECT_COMMAND_TYPE.MIDI_NOTE.MOVE,
  PROJECT_COMMAND_TYPE.MIDI_NOTE.REMOVE,
  PROJECT_COMMAND_TYPE.MIDI_NOTE.RESIZE,
] as const)
