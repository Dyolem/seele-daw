import { InteractionCommitHandoff } from './interaction-commit-handoff'
import {
  InteractionSession,
  type InteractionId,
  type InteractionOperation,
} from './interaction-session'

/**
 * The fact authority a gesture edits. Any commit the gesture did not make itself invalidates it,
 * because its preview was computed against `baseRevision`.
 */
export interface GestureAuthority {
  readonly baseRevision: number
  currentRevision(): number
  watch(observer: { onCommit(): void; onError(): void }): () => void
}

export interface GestureStart<Input, Preview, Result, Target> {
  readonly authority: GestureAuthority
  readonly operation: InteractionOperation<Input, Preview, Result>
  /** Frozen facts the completed gesture is applied to; returned with the intent. */
  readonly target: Target
  /** Treat the press itself as the first update, for gestures that preview immediately. */
  readonly previewOnPress?: boolean
}

export interface GesturePointerInput {
  readonly phase: 'begin' | 'update' | 'end' | 'cancel'
  readonly captureId: symbol
  readonly pointerId: number
}

export type GestureState<Preview> = Readonly<{
  interactionId: InteractionId | null
  phase: 'idle' | 'active' | 'completing'
  /** Set only while the pointer is captured. */
  pointerId: number | null
  preview: Preview | null
  /** The gesture's Commit landed and the view has not observed that revision yet. */
  awaitingAuthority: boolean
}>

export type GestureIntent<Result, Target> = Result &
  Readonly<{ interactionId: InteractionId; target: Target }>

export type GestureOutcome<Result, Target> = Readonly<{
  failure: unknown
  intent: GestureIntent<Result, Target> | null
}>

export interface ResolveGestureCommitInput {
  readonly interactionId: InteractionId
  readonly commitRevision: number
  readonly authorityRevision: number
}

interface ActiveGesture<Target> {
  readonly interactionId: InteractionId
  readonly captureId: symbol
  readonly pointerId: number
  readonly authority: GestureAuthority
  readonly target: Target
}

const IDLE = Object.freeze({
  interactionId: null,
  phase: 'idle',
  pointerId: null,
  preview: null,
  awaitingAuthority: false,
} as const)
const NO_OUTCOME = Object.freeze({ failure: null, intent: null })

/**
 * One captured pointer gesture that ends in at most one Commit: it owns capture identity,
 * cancellation on foreign commits, one-shot completion, and the handoff until the view observes
 * the gesture's own Commit. Specializations only decide how a press starts.
 */
export class GestureSession<
  Input extends GesturePointerInput,
  Preview,
  Result extends object,
  Target,
  Configuration,
> {
  readonly #start: (
    input: Input,
    configuration: Configuration,
  ) => GestureStart<Input, Preview, Result, Target> | null
  readonly #host = new InteractionSession<Input, Preview, Result>()
  readonly #handoff = new InteractionCommitHandoff()
  readonly #listeners = new Set<(state: GestureState<Preview>) => void>()
  #active: ActiveGesture<Target> | null = null
  #executing: InteractionId | null = null
  #unwatch: (() => void) | null = null
  #state: GestureState<Preview> = IDLE
  #disposed = false

  constructor(
    start: (
      input: Input,
      configuration: Configuration,
    ) => GestureStart<Input, Preview, Result, Target> | null,
  ) {
    this.#start = start
  }

  get state(): GestureState<Preview> {
    return this.#state
  }

  /** The frozen target of the gesture in progress. */
  get target(): Target | null {
    return this.#active?.target ?? null
  }

  handlePointerInput(input: Input, configuration?: Configuration): GestureOutcome<Result, Target> {
    if (this.#disposed) return NO_OUTCOME
    try {
      if (input.phase === 'begin') {
        // A new press supersedes a gesture that is still waiting for its Commit to be observed.
        if (this.#handoff.pending) this.cancel()
        if (this.#active !== null) return NO_OUTCOME
        if (configuration === undefined)
          throw new Error('A gesture needs its configuration on press.')
        this.#begin(input, configuration)
        this.#publish()
        return NO_OUTCOME
      }
      const active = this.#active
      if (active?.captureId !== input.captureId || active.pointerId !== input.pointerId) {
        return NO_OUTCOME
      }
      if (input.phase === 'cancel' || (this.#executing === null && !isCurrent(active))) {
        this.cancel()
        return NO_OUTCOME
      }
      if (input.phase === 'update') {
        this.#host.update(active.interactionId, input)
        this.#publish()
        return NO_OUTCOME
      }
      const result = this.#host.complete(active.interactionId, input)
      this.#publish()
      if (result === null || this.#active?.interactionId !== active.interactionId) return NO_OUTCOME
      return Object.freeze({
        failure: null,
        intent: Object.freeze({
          ...result,
          interactionId: active.interactionId,
          target: active.target,
        }),
      })
    } catch (failure) {
      this.cancel()
      return Object.freeze({ failure, intent: null })
    }
  }

  /** Grants the completed gesture's single execution, unless its authority moved meanwhile. */
  claimCompletion(interactionId: InteractionId): boolean {
    const active = this.#active
    if (active?.interactionId !== interactionId || this.#executing !== null) return false
    if (!isCurrent(active)) {
      this.cancel()
      return false
    }
    if (!this.#host.claimCompletion(interactionId)) return false
    this.#executing = interactionId
    return true
  }

  /** Holds the preview until the view observes `commitRevision`, so it never flashes back. */
  resolveCommit({
    interactionId,
    commitRevision,
    authorityRevision,
  }: ResolveGestureCommitInput): void {
    if (
      this.#disposed ||
      this.#active?.interactionId !== interactionId ||
      this.#executing !== interactionId ||
      this.#handoff.pending ||
      this.#host.state.phase !== 'completing'
    )
      return
    if (this.#handoff.accept(interactionId, commitRevision, authorityRevision)) {
      this.#host.finish(interactionId)
    }
    this.#publish()
  }

  /** Ends a completion that produced no Commit; a pending handoff finishes on its own. */
  finish(interactionId: InteractionId): void {
    if (this.#disposed || this.#handoff.pending) return
    if (this.#host.finish(interactionId)) this.#publish()
  }

  notifyAuthorityRevision(revision: number): void {
    const active = this.#active
    if (this.#disposed || active === null) return
    if (this.#executing === null && revision !== active.authority.baseRevision) {
      this.cancel()
      return
    }
    const completed = this.#handoff.observe(revision)
    if (completed !== null) this.#host.finish(completed)
    this.#publish()
  }

  cancel(): boolean {
    if (this.#disposed || this.#active === null) return false
    const cancelled = this.#host.cancel(this.#active.interactionId)
    this.#publish()
    return cancelled
  }

  dispose(): void {
    if (this.#disposed) return
    try {
      this.cancel()
    } finally {
      this.#disposed = true
      this.#host.dispose()
      this.#listeners.clear()
    }
  }

  subscribe(listener: (state: GestureState<Preview>) => void): () => void {
    if (!this.#disposed) this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  #begin(input: Input, configuration: Configuration): void {
    const start = this.#start(input, configuration)
    if (start === null || !isCurrent(start)) return
    const interactionId = this.#host.begin(start.operation)
    if (interactionId === null) return
    this.#active = Object.freeze({
      interactionId,
      captureId: input.captureId,
      pointerId: input.pointerId,
      authority: start.authority,
      target: start.target,
    })
    this.#handoff.reset(start.authority.baseRevision)
    this.#unwatch = start.authority.watch({
      onCommit: () => {
        // Only the claimed execution may publish its own Commit synchronously.
        if (this.#active?.interactionId === interactionId && this.#executing !== interactionId) {
          this.cancel()
        }
      },
      onError: () => {
        if (this.#active?.interactionId === interactionId) this.cancel()
      },
    })
    if (start.previewOnPress) this.#host.update(interactionId, input)
  }

  #clear(): void {
    const unwatch = this.#unwatch
    this.#unwatch = null
    this.#active = null
    this.#executing = null
    this.#handoff.reset(0)
    this.#state = IDLE
    unwatch?.()
  }

  #publish(): void {
    const host = this.#host.state
    const active = this.#active
    if (active === null || (host.phase !== 'active' && host.phase !== 'completing')) {
      this.#clear()
    } else {
      this.#state = Object.freeze({
        interactionId: active.interactionId,
        phase: host.phase,
        pointerId: host.phase === 'active' ? active.pointerId : null,
        preview: host.preview,
        awaitingAuthority: this.#handoff.pending,
      })
    }
    for (const listener of this.#listeners) {
      try {
        listener(this.#state)
      } catch (cause) {
        // A failed projection must not leave an unsubmitted completion available.
        if (this.#active !== null) this.#host.cancel(this.#active.interactionId)
        this.#clear()
        for (const recipient of this.#listeners) {
          try {
            recipient(IDLE)
          } catch {
            // Cleanup must reach healthy listeners even when one keeps failing.
          }
        }
        throw cause
      }
    }
  }
}

export interface GestureCompletion {
  claimCompletion(interactionId: InteractionId): boolean
  resolveCommit(input: ResolveGestureCommitInput): void
  finish(interactionId: InteractionId): void
}

/**
 * Runs a completed gesture's single execution: claim it, apply it, hand any Commit to the
 * session, run follow-up view work, and always finish. A failure after the Commit is reported as
 * committed, so the caller can tell the user the edit was kept.
 */
export function completeGesture(
  session: GestureCompletion,
  interactionId: InteractionId,
  steps: {
    readonly apply: () => { readonly modelRevision: number } | null
    readonly authorityRevision: () => number
    readonly afterCommit?: () => void
    readonly onFailure: (cause: unknown, committed: boolean) => void
  },
): void {
  if (!session.claimCompletion(interactionId)) return
  let committed = false
  try {
    const commit = steps.apply()
    if (commit === null) return
    committed = true
    session.resolveCommit({
      interactionId,
      commitRevision: commit.modelRevision,
      authorityRevision: steps.authorityRevision(),
    })
    steps.afterCommit?.()
  } catch (cause) {
    steps.onFailure(cause, committed)
  } finally {
    session.finish(interactionId)
  }
}

function isCurrent(gesture: { readonly authority: GestureAuthority }): boolean {
  return gesture.authority.currentRevision() === gesture.authority.baseRevision
}
