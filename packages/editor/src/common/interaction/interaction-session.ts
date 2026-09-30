import { createInteractionId } from './interaction-symbols'

/** Identifies one semantic interaction independently of reusable browser Pointer IDs. */
export type InteractionId = symbol

export interface InteractionOperation<Input, Preview, Result> {
  update(input: Input): Preview | null
  complete(input: Input): Readonly<{ preview: Preview | null; result: Result | null }>
}

export type InteractionState<Preview> =
  | Readonly<{ phase: 'idle'; interactionId: null; preview: null }>
  | Readonly<{
      phase: 'active' | 'completing' | 'finished' | 'cancelled'
      interactionId: InteractionId
      preview: Preview | null
    }>

/** Owns one operation and its completion capability, without domain, Pointer or revision rules. */
export class InteractionSession<Input, Preview, Result> {
  #state: InteractionState<Preview> = Object.freeze({
    phase: 'idle',
    interactionId: null,
    preview: null,
  })
  #operation: InteractionOperation<Input, Preview, Result> | null = null
  #claimed = false
  #disposed = false

  get state(): InteractionState<Preview> {
    return this.#state
  }

  begin(operation: InteractionOperation<Input, Preview, Result>): InteractionId | null {
    if (this.#disposed || this.#state.phase === 'active' || this.#state.phase === 'completing')
      return null
    const interactionId = createInteractionId()
    this.#operation = operation
    this.#claimed = false
    this.#state = Object.freeze({ phase: 'active', interactionId, preview: null })
    return interactionId
  }

  update(interactionId: InteractionId, input: Input): void {
    if (!this.#matches(interactionId, 'active') || this.#operation === null) return
    try {
      const preview = this.#operation.update(input)
      if (this.#matches(interactionId, 'active'))
        this.#state = Object.freeze({ phase: 'active', interactionId, preview })
    } catch (cause) {
      this.cancel(interactionId)
      throw cause
    }
  }

  complete(interactionId: InteractionId, input: Input): Result | null {
    if (!this.#matches(interactionId, 'active') || this.#operation === null) return null
    this.#state = Object.freeze({ ...this.#state, phase: 'completing', interactionId })
    try {
      const { preview, result } = this.#operation.complete(input)
      if (!this.#matches(interactionId, 'completing')) return null
      this.#operation = null
      this.#state = Object.freeze({ phase: 'completing', interactionId, preview })
      if (result === null) this.finish(interactionId)
      return result
    } catch (cause) {
      this.cancel(interactionId)
      throw cause
    }
  }

  claimCompletion(interactionId: InteractionId): boolean {
    if (!this.#matches(interactionId, 'completing') || this.#claimed) return false
    this.#claimed = true
    return true
  }

  finish(interactionId: InteractionId): boolean {
    if (!this.#matches(interactionId, 'completing')) return false
    this.#close(interactionId, 'finished')
    return true
  }

  cancel(interactionId: InteractionId): boolean {
    if (!this.#matches(interactionId, 'active') && !this.#matches(interactionId, 'completing'))
      return false
    this.#close(interactionId, 'cancelled')
    return true
  }

  dispose(): void {
    if (this.#state.interactionId !== null) this.cancel(this.#state.interactionId)
    this.#disposed = true
  }

  #matches(interactionId: InteractionId, phase: 'active' | 'completing'): boolean {
    return (
      !this.#disposed && this.#state.interactionId === interactionId && this.#state.phase === phase
    )
  }

  #close(interactionId: InteractionId, phase: 'finished' | 'cancelled'): void {
    this.#operation = null
    this.#state = Object.freeze({ phase, interactionId, preview: null })
  }
}
