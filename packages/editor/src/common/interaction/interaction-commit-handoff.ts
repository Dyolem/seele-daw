import type { InteractionId } from './interaction-session'

/** Optional revision handoff for fact editors; view-only operations do not need this capability. */
export class InteractionCommitHandoff {
  #observedRevision = 0
  #pending: Readonly<{ interactionId: InteractionId; revision: number }> | null = null

  get pending(): boolean {
    return this.#pending !== null
  }

  reset(baseRevision: number): void {
    this.#observedRevision = baseRevision
    this.#pending = null
  }

  accept(interactionId: InteractionId, revision: number, authorityRevision: number): boolean {
    this.#observedRevision = Math.max(this.#observedRevision, authorityRevision)
    if (this.#observedRevision >= revision) return true
    this.#pending = Object.freeze({ interactionId, revision })
    return false
  }

  observe(revision: number): InteractionId | null {
    this.#observedRevision = Math.max(this.#observedRevision, revision)
    if (this.#pending === null || this.#observedRevision < this.#pending.revision) return null
    const interactionId = this.#pending.interactionId
    this.#pending = null
    return interactionId
  }
}
