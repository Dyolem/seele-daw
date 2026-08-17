import {
  addTicks,
  parsePositiveTick,
  parseTick,
  type ClipId,
  type Tick,
} from '@seele-daw/project-core'

import {
  PIANO_ROLL_TRACK_CLIP_STATUS,
  type ReadyPianoRollTrackClipProjection,
} from '#internal/common/piano-roll/track/clip-projection'
import type {
  PianoRollTrackClipReadModel,
  PianoRollTrackReadModel,
} from '#internal/common/piano-roll/track/track-read-model'

export const PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS = Object.freeze({
  BLOCKED: 'blocked',
  READY: 'ready',
} as const)

export const PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION = Object.freeze({
  ADD_TO_CLIP: 'add-to-clip',
  CREATE_CLIP: 'create-clip',
  EXTEND_CLIP: 'extend-clip',
} as const)

export const PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON = Object.freeze({
  AMBIGUOUS_CLIP_TARGET: 'ambiguous-clip-target',
  EXTENSION_CROSSES_NEXT_CLIP: 'extension-crosses-next-clip',
  LOOPED_CLIP_TARGET: 'looped-clip-target',
} as const)

type PianoRollTrackNotePlacementAction =
  (typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION)[keyof typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION]

type PianoRollTrackNotePlacementBlockReason =
  (typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON)[keyof typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON]

interface PianoRollTrackNotePlacementBase {
  readonly noteDurationTick: Tick
  readonly projectEndTick: Tick
  readonly projectStartTick: Tick
}

export interface AddToPianoRollTrackClipPlacement extends PianoRollTrackNotePlacementBase {
  readonly action: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP
  readonly clipId: ClipId
  readonly sourceStartTick: Tick
  readonly status: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY
}

export interface CreatePianoRollTrackClipPlacement extends PianoRollTrackNotePlacementBase {
  readonly action: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP
  readonly clipSpanTick: Tick
  readonly clipStartTick: Tick
  readonly sourceStartTick: Tick
  readonly status: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY
}

export interface ExtendPianoRollTrackClipPlacement extends PianoRollTrackNotePlacementBase {
  readonly action: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP
  readonly clipId: ClipId
  readonly sourceStartTick: Tick
  readonly status: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY
  readonly targetClipSpanTick: Tick
}

export interface BlockedPianoRollTrackNotePlacement extends PianoRollTrackNotePlacementBase {
  readonly candidateClipIds: readonly ClipId[]
  readonly message: string
  readonly reason: PianoRollTrackNotePlacementBlockReason
  readonly status: typeof PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED
}

export type ReadyPianoRollTrackNotePlacement =
  | AddToPianoRollTrackClipPlacement
  | CreatePianoRollTrackClipPlacement
  | ExtendPianoRollTrackClipPlacement

export type PianoRollTrackNotePlacement =
  | BlockedPianoRollTrackNotePlacement
  | ReadyPianoRollTrackNotePlacement

export interface ResolvePianoRollTrackNotePlacementInput {
  readonly barSpanTick: Tick
  readonly noteDurationTick: Tick
  readonly projectStartTick: Tick
  readonly readModel: PianoRollTrackReadModel
}

interface SelectedClip {
  readonly clip: PianoRollTrackClipReadModel
  readonly blocked: BlockedPianoRollTrackNotePlacement | null
}

function createBlockedPlacement(
  base: PianoRollTrackNotePlacementBase,
  reason: PianoRollTrackNotePlacementBlockReason,
  candidates: readonly PianoRollTrackClipReadModel[],
  message: string,
): BlockedPianoRollTrackNotePlacement {
  return Object.freeze({
    ...base,
    candidateClipIds: Object.freeze(candidates.map(({ clip }) => clip.clipId)),
    message,
    reason,
    status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.BLOCKED,
  })
}

function selectClip(
  candidates: readonly PianoRollTrackClipReadModel[],
  activeClipId: ClipId | null,
  base: PianoRollTrackNotePlacementBase,
): SelectedClip {
  const active = candidates.find(({ clip }) => clip.clipId === activeClipId)
  if (active !== undefined) return { blocked: null, clip: active }
  if (candidates.length === 1) {
    const clip = candidates[0]
    if (clip === undefined) throw new Error('Expected one Piano Roll Track Clip')
    return { blocked: null, clip }
  }

  const first = candidates[0]
  if (first === undefined) throw new Error('Expected a Piano Roll Track Clip candidate')

  const names = candidates.map(({ clip }) => clip.name).join(', ')
  return {
    blocked: createBlockedPlacement(
      base,
      PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.AMBIGUOUS_CLIP_TARGET,
      candidates,
      `Choose an Active Clip before placing a note in the overlapping Clip region (${names}).`,
    ),
    clip: first,
  }
}

function requireReadyClip(
  selected: SelectedClip,
  base: PianoRollTrackNotePlacementBase,
):
  | { readonly blocked: BlockedPianoRollTrackNotePlacement }
  | { readonly clip: ReadyPianoRollTrackClipProjection } {
  if (selected.blocked !== null) return { blocked: selected.blocked }
  if (selected.clip.clip.status === PIANO_ROLL_TRACK_CLIP_STATUS.READY) {
    return { clip: selected.clip.clip }
  }

  return {
    blocked: createBlockedPlacement(
      base,
      PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.LOOPED_CLIP_TARGET,
      [selected.clip],
      `Looped Clip ${selected.clip.clip.name} is visible but cannot receive Track-mode note edits yet.`,
    ),
  }
}

function findNextClip(
  readModel: PianoRollTrackReadModel,
  target: ReadyPianoRollTrackClipProjection,
): PianoRollTrackClipReadModel | null {
  let next: PianoRollTrackClipReadModel | null = null

  for (const candidate of readModel.clips) {
    if (candidate.clip.clipId === target.clipId || candidate.clip.startTick < target.endTick) {
      continue
    }
    if (
      next === null ||
      candidate.clip.startTick < next.clip.startTick ||
      (candidate.clip.startTick === next.clip.startTick && candidate.clip.clipId < next.clip.clipId)
    ) {
      next = candidate
    }
  }

  return next
}

function resolveReadyClipPlacement(
  readModel: PianoRollTrackReadModel,
  clip: ReadyPianoRollTrackClipProjection,
  base: PianoRollTrackNotePlacementBase,
): PianoRollTrackNotePlacement {
  const sourceStartTick = addTicks(
    clip.context.sourceStartTick,
    parseTick(base.projectStartTick - clip.startTick),
  )

  if (base.projectEndTick <= clip.endTick) {
    return Object.freeze({
      ...base,
      action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.ADD_TO_CLIP,
      clipId: clip.clipId,
      sourceStartTick,
      status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY,
    })
  }

  const nextClip = findNextClip(readModel, clip)
  if (nextClip !== null && base.projectEndTick > nextClip.clip.startTick) {
    const targetClip = readModel.clips.find(
      ({ clip: candidate }) => candidate.clipId === clip.clipId,
    )
    if (targetClip === undefined) {
      throw new Error(`Piano Roll Track Clip ${clip.clipId} is missing from its Read Model`)
    }
    return createBlockedPlacement(
      base,
      PIANO_ROLL_TRACK_NOTE_PLACEMENT_BLOCK_REASON.EXTENSION_CROSSES_NEXT_CLIP,
      [targetClip, nextClip],
      `The note would extend ${clip.name} across the next Clip ${nextClip.clip.name}.`,
    )
  }

  return Object.freeze({
    ...base,
    action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.EXTEND_CLIP,
    clipId: clip.clipId,
    sourceStartTick,
    status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY,
    targetClipSpanTick: parsePositiveTick(base.projectEndTick - clip.startTick),
  })
}

function createClipPlacement(
  barSpanTick: Tick,
  base: PianoRollTrackNotePlacementBase,
): CreatePianoRollTrackClipPlacement {
  const barIndex = Math.floor(base.projectStartTick / barSpanTick)
  const clipStartTick = parseTick(barIndex * barSpanTick)
  const requiredSpanTick = parsePositiveTick(base.projectEndTick - clipStartTick)

  return Object.freeze({
    ...base,
    action: PIANO_ROLL_TRACK_NOTE_PLACEMENT_ACTION.CREATE_CLIP,
    clipSpanTick: parsePositiveTick(Math.max(barSpanTick, requiredSpanTick)),
    clipStartTick,
    sourceStartTick: parseTick(base.projectStartTick - clipStartTick),
    status: PIANO_ROLL_TRACK_NOTE_PLACEMENT_STATUS.READY,
  })
}

/** Resolves one global Track-time note start into an atomic Project placement action. */
export function resolvePianoRollTrackNotePlacement(
  input: ResolvePianoRollTrackNotePlacementInput,
): PianoRollTrackNotePlacement {
  const barSpanTick = parsePositiveTick(input.barSpanTick)
  const noteDurationTick = parsePositiveTick(input.noteDurationTick)
  const projectStartTick = parseTick(input.projectStartTick)
  const base = Object.freeze({
    noteDurationTick,
    projectEndTick: addTicks(projectStartTick, noteDurationTick),
    projectStartTick,
  })
  const containing = input.readModel.clips.filter(
    ({ clip }) => projectStartTick >= clip.startTick && projectStartTick < clip.endTick,
  )

  if (containing.length > 0) {
    const ready = requireReadyClip(selectClip(containing, input.readModel.activeClipId, base), base)
    return 'blocked' in ready
      ? ready.blocked
      : resolveReadyClipPlacement(input.readModel, ready.clip, base)
  }

  let nearestLeftEndTick = -1
  const nearestLeft: PianoRollTrackClipReadModel[] = []
  for (const clip of input.readModel.clips) {
    if (clip.clip.endTick > projectStartTick) continue
    if (clip.clip.endTick > nearestLeftEndTick) {
      nearestLeftEndTick = clip.clip.endTick
      nearestLeft.length = 0
      nearestLeft.push(clip)
    } else if (clip.clip.endTick === nearestLeftEndTick) {
      nearestLeft.push(clip)
    }
  }

  if (nearestLeftEndTick >= 0 && projectStartTick - nearestLeftEndTick <= barSpanTick) {
    const ready = requireReadyClip(
      selectClip(nearestLeft, input.readModel.activeClipId, base),
      base,
    )
    return 'blocked' in ready
      ? ready.blocked
      : resolveReadyClipPlacement(input.readModel, ready.clip, base)
  }

  return createClipPlacement(barSpanTick, base)
}

export type { PianoRollTrackNotePlacementAction, PianoRollTrackNotePlacementBlockReason }
