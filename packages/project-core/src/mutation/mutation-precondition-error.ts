import type { ProjectMutationType } from './mutation-type'

export type MutationPreconditionErrorCode =
  | 'before-reference-mismatch'
  | 'insert-target-exists'
  | 'note-partition-content-mismatch'
  | 'target-missing'
  | 'track-order-entry-mismatch'
  | 'track-order-index-out-of-bounds'

/** Raised when a normalized mutation cannot be applied to the current projected state. */
export class MutationPreconditionError extends Error {
  readonly code: MutationPreconditionErrorCode
  readonly mutationIndex: number
  readonly mutationType: ProjectMutationType

  constructor(
    code: MutationPreconditionErrorCode,
    mutationIndex: number,
    mutationType: ProjectMutationType,
    detail: string,
  ) {
    super(`Mutation at index ${mutationIndex} (${mutationType}) ${detail}`)
    this.name = 'MutationPreconditionError'
    this.code = code
    this.mutationIndex = mutationIndex
    this.mutationType = mutationType
  }
}
