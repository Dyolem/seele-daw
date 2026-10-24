import type { ProjectCommandType } from '#internal/commands/protocol/project-command'
import {
  PROJECT_HISTORY_DIRECTION,
  type ProjectHistoryDirection,
} from '#internal/commit/project-commit'
import type { ModelRevision } from '#internal/model/model-revision'
import {
  assertCreatedMutationPlan,
  createMutationPlan,
  type MutationPlan,
} from '#internal/mutation/mutation-plan'
import type { ProjectMutation } from '#internal/mutation/project-mutation'
import {
  createProjectContentStateId,
  type ProjectContentStateId,
} from '#internal/session/project-content-state-id'

interface HistoryEntry {
  readonly commandType: ProjectCommandType
  readonly forward: readonly ProjectMutation[]
  readonly inverse: readonly ProjectMutation[]
  readonly beforeContentStateId: ProjectContentStateId
  readonly afterContentStateId: ProjectContentStateId
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
  #contentStateId = createProjectContentStateId()

  get contentStateId(): ProjectContentStateId {
    return this.#contentStateId
  }

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

    const afterContentStateId = createProjectContentStateId()
    const entry = Object.freeze<HistoryEntry>({
      commandType,
      forward: plan.forward,
      inverse: plan.inverse,
      beforeContentStateId: this.#contentStateId,
      afterContentStateId,
    })
    const nextUndoHead = Object.freeze<HistoryStackNode>({
      entry,
      next: this.#undoHead,
    })

    return this.#createTransition(plan, commandType, null, nextUndoHead, null, afterContentStateId)
  }

  prepareUndo(
    baseRevision: ModelRevision,
  ): PreparedHistoryTransition<typeof PROJECT_HISTORY_DIRECTION.UNDO> | null {
    const node = this.#undoHead

    if (node === null) return null
    if (this.#contentStateId !== node.entry.afterContentStateId) {
      throw new Error('Undo entry does not match the current Project content state')
    }

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
      node.entry.beforeContentStateId,
    )
  }

  prepareRedo(
    baseRevision: ModelRevision,
  ): PreparedHistoryTransition<typeof PROJECT_HISTORY_DIRECTION.REDO> | null {
    const node = this.#redoHead

    if (node === null) return null
    if (this.#contentStateId !== node.entry.beforeContentStateId) {
      throw new Error('Redo entry does not match the current Project content state')
    }

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
      node.entry.afterContentStateId,
    )
  }

  #createTransition<Direction extends ProjectHistoryDirection | null>(
    plan: MutationPlan,
    commandType: ProjectCommandType,
    direction: Direction,
    nextUndoHead: HistoryStackNode | null,
    nextRedoHead: HistoryStackNode | null,
    nextContentStateId: ProjectContentStateId,
  ): PreparedHistoryTransition<Direction> {
    const expectedUndoHead = this.#undoHead
    const expectedRedoHead = this.#redoHead
    const expectedContentStateId = this.#contentStateId
    let state: HistoryTransitionState = 'prepared'

    const stage = (): void => {
      if (state !== 'prepared') {
        throw new Error(`History transition cannot stage from state ${state}`)
      }

      if (
        this.#undoHead !== expectedUndoHead ||
        this.#redoHead !== expectedRedoHead ||
        this.#contentStateId !== expectedContentStateId
      ) {
        throw new Error('History transition no longer matches the current History state')
      }

      this.#undoHead = nextUndoHead
      this.#redoHead = nextRedoHead
      this.#contentStateId = nextContentStateId
      state = 'staged'
    }

    const rollback = (): void => {
      if (state !== 'staged') {
        throw new Error(`History transition cannot roll back from state ${state}`)
      }

      this.#undoHead = expectedUndoHead
      this.#redoHead = expectedRedoHead
      this.#contentStateId = expectedContentStateId
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
