import type { Tick } from '@seele-daw/project-core'

interface ProjectTimelineMusicalPositionInput {
  readonly barSpanTick: Tick
  readonly tick: Tick
  readonly timeSignatureNumerator: number
}

interface ProjectTimelineMusicalPosition {
  readonly barNumber: number
  readonly beatNumber: number
  readonly beatSpanTick: number
  readonly tickWithinBeat: number
}

function resolveProjectTimelineMusicalPosition(
  input: ProjectTimelineMusicalPositionInput,
): ProjectTimelineMusicalPosition {
  const beatSpanTick = input.barSpanTick / input.timeSignatureNumerator
  const barIndex = Math.floor(input.tick / input.barSpanTick)
  const tickWithinBar = input.tick - barIndex * input.barSpanTick
  const beatIndex = Math.min(
    input.timeSignatureNumerator - 1,
    Math.floor(tickWithinBar / beatSpanTick),
  )

  return Object.freeze({
    barNumber: barIndex + 1,
    beatNumber: beatIndex + 1,
    beatSpanTick,
    tickWithinBeat: tickWithinBar - beatIndex * beatSpanTick,
  })
}

/** Formats the fixed Arrangement grid as bar, beat, and exact in-beat Project Tick. */
export function formatProjectTimelineMusicalPosition(
  input: ProjectTimelineMusicalPositionInput,
): string {
  const position = resolveProjectTimelineMusicalPosition(input)
  return `${position.barNumber} · ${position.beatNumber} · ${position.tickWithinBeat}/${position.beatSpanTick}`
}

/** Describes the same musical address while retaining the raw Project Tick for diagnostics. */
export function describeProjectTimelineMusicalPosition(
  input: ProjectTimelineMusicalPositionInput,
): string {
  const position = resolveProjectTimelineMusicalPosition(input)
  return `Bar ${position.barNumber}, beat ${position.beatNumber}, ${position.tickWithinBeat} of ${position.beatSpanTick} ticks; Project Tick ${input.tick}`
}

/** Formats non-negative Project time without changing Playback's precise value. */
export function formatProjectTimelineTime(projectSecond: number): string {
  const safeProjectSecond = Number.isFinite(projectSecond) ? Math.max(0, projectSecond) : 0
  const safeMillisecond = Math.floor(safeProjectSecond * 1_000)
  const minute = Math.floor(safeMillisecond / 60_000)
  const second = Math.floor((safeMillisecond % 60_000) / 1_000)
  const millisecond = safeMillisecond % 1_000
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(millisecond).padStart(3, '0')}`
}
