import type { ProjectCommandType } from '#internal/commands/project-command'
import { PROJECT_HISTORY_DIRECTION, type ProjectHistoryDirection } from '#internal/commit/project-commit'
import type { ModelRevision } from '#internal/model/model-revision'
import {
  assertCreatedMutationPlan,
  createMutationPlan,
  type MutationPlan,
} from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'

interface HistoryEntry {
  readonly commandType: ProjectCommandType
  readonly forward: readonly ProjectMutation[]
  readonly inverse: readonly ProjectMutation[]
}

interface HistoryStackNode {
  readonly entry: HistoryEntry
  readonly next: HistoryStackNode | null
}

type HistoryTransitionState = 'prepared' | 'staged' | 'rolled-back'

export interface PreparedHistoryTransition<
  Direction extends ProjectHistoryDirection | null = ProjectHistoryDirection | null,
> {
  readonly plan: MutationPlan
  readonly commandType: ProjectCommandType
  readonly direction: Direction

  stage(): void
  rollback(): void
}

/** Owns session-only Undo/Redo stacks without exposing MutationPlan to package consumers. */
export class HistoryController {
  #undoHead: HistoryStackNode | null = null
  #redoHead: HistoryStackNode | null = null

  get canUndo(): boolean {
    return this.#undoHead !== null
  }

  get canRedo(): boolean {
    return this.#redoHead !== null
  }

  prepareCommand(
    commandType: ProjectCommandType,
    plan: MutationPlan,
  ): PreparedHistoryTransition<null> {
    assertCreatedMutationPlan(plan)

    const entry = Object.freeze<HistoryEntry>({
      commandType,
      forward: plan.forward,
      inverse: plan.inverse,
    })
    const nextUndoHead = Object.freeze<HistoryStackNode>({
      entry,
      next: this.#undoHead,
    })

    return this.#createTransition(plan, commandType, null, nextUndoHead, null)
  }

  prepareUndo(
    baseRevision: ModelRevision,
  ): PreparedHistoryTransition<typeof PROJECT_HISTORY_DIRECTION.UNDO> | null {
    const node = this.#undoHead

    if (node === null) return null

    const plan = createMutationPlan(baseRevision, node.entry.inverse)
    const nextRedoHead = Object.freeze<HistoryStackNode>({
      entry: node.entry,
      next: this.#redoHead,
    })

    return this.#createTransition(
      plan,
      node.entry.commandType,
      PROJECT_HISTORY_DIRECTION.UNDO,
      node.next,
      nextRedoHead,
    )
  }

  prepareRedo(
    baseRevision: ModelRevision,
  ): PreparedHistoryTransition<typeof PROJECT_HISTORY_DIRECTION.REDO> | null {
    const node = this.#redoHead

    if (node === null) return null

    const plan = createMutationPlan(baseRevision, node.entry.forward)
    const nextUndoHead = Object.freeze<HistoryStackNode>({
      entry: node.entry,
      next: this.#undoHead,
    })

    return this.#createTransition(
      plan,
      node.entry.commandType,
      PROJECT_HISTORY_DIRECTION.REDO,
      nextUndoHead,
      node.next,
    )
  }

  #createTransition<Direction extends ProjectHistoryDirection | null>(
    plan: MutationPlan,
    commandType: ProjectCommandType,
    direction: Direction,
    nextUndoHead: HistoryStackNode | null,
    nextRedoHead: HistoryStackNode | null,
  ): PreparedHistoryTransition<Direction> {
    const expectedUndoHead = this.#undoHead
    const expectedRedoHead = this.#redoHead
    let state: HistoryTransitionState = 'prepared'

    const stage = (): void => {
      if (state !== 'prepared') {
        throw new Error(`History transition cannot stage from state ${state}`)
      }

      if (this.#undoHead !== expectedUndoHead || this.#redoHead !== expectedRedoHead) {
        throw new Error('History transition no longer matches the current stack heads')
      }

      this.#undoHead = nextUndoHead
      this.#redoHead = nextRedoHead
      state = 'staged'
    }

    const rollback = (): void => {
      if (state !== 'staged') {
        throw new Error(`History transition cannot roll back from state ${state}`)
      }

      this.#undoHead = expectedUndoHead
      this.#redoHead = expectedRedoHead
      state = 'rolled-back'
    }

    return Object.freeze({
      plan,
      commandType,
      direction,
      stage,
      rollback,
    })
  }
}
