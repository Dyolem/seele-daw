import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioUserKeymapStorage } from '@/workbench/keyboard/contracts/studio-user-keymap-storage'
import type {
  StudioUserKeymap,
  StudioUserKeymapInspection,
  StudioUserKeymapIssue,
  StudioUserKeymapResult,
  StudioUserKeymapState,
} from '@/workbench/keyboard/contracts/studio-user-keymap'
import {
  createStudioKeyboardKeymap,
  type StudioKeyboardKeymapOverrides,
} from '@/workbench/keyboard/keymap/studio-default-keymap'
import type { StudioKeyboardBinding } from '@/workbench/keyboard/contracts/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/contracts/studio-keyboard-binding-registry'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/runtime/studio-keyboard-input-router'
import { analyzeStudioKeyboardRoutes } from '@/workbench/keyboard/keymap/studio-keyboard-routes'

const USER_KEYMAP_VERSION = 1

export interface StudioUserKeymapRuntime extends StudioUserKeymap {
  subscribe(subscriber: (state: StudioUserKeymapState) => void): () => void
  dispose(): void
}

interface StudioUserKeymapOptions {
  readonly catalogue: readonly StudioActionDescriptor[]
  readonly registry: StudioKeyboardBindingRegistry
  readonly router: StudioKeyboardInputRouter
  readonly storage: StudioUserKeymapStorage
}

function isRecord(record: unknown): record is Record<string, unknown> {
  return typeof record === 'object' && record !== null && !Array.isArray(record)
}

function isBindingList(bindings: unknown): bindings is string[] {
  return Array.isArray(bindings) && bindings.every((binding) => typeof binding === 'string')
}

/** Owns the local preference record and its transaction with physical keyboard registration. */
class StudioUserKeymapImpl implements StudioUserKeymapRuntime {
  readonly #options: StudioUserKeymapOptions
  readonly #defaults: StudioUserKeymapState['keymap']
  readonly #knownIds: ReadonlySet<string>
  readonly #subscribers = new Set<(state: StudioUserKeymapState) => void>()
  #entries: Record<string, unknown> = {}
  #state: StudioUserKeymapState
  #disposed = false
  #updating = false

  constructor(options: StudioUserKeymapOptions) {
    this.#options = options
    this.#defaults = options.router.keymap
    this.#knownIds = new Set(options.catalogue.map((action) => action.actionId))
    this.#state = this.#load()
  }

  get state(): StudioUserKeymapState {
    return this.#state
  }

  // Keep public capabilities bound; subscriptions and per-transaction callbacks stay local.
  readonly bindingsForEditing = (actionId: StudioActionId): readonly string[] => {
    const saved = this.#entries[actionId]
    return Object.freeze(isBindingList(saved) ? [...saved] : [...this.#state.keymap[actionId]])
  }

  readonly inspectBindings = (
    actionId: StudioActionId,
    inputs: readonly string[],
  ): StudioUserKeymapInspection => {
    const parsed = this.#parseBindings(inputs)
    const candidate = this.#evaluate({ ...this.#entries, [actionId]: inputs })
    const relations = analyzeStudioKeyboardRoutes(
      this.#options.catalogue,
      candidate.requestedKeymap,
      this.#options.registry,
    ).relations.filter((relation) => relation.actionIds.includes(actionId))
    const conflicts = relations.filter((relation) => relation.kind === 'conflict')
    // Never overwrite an unrelated damaged record while removing one conflicting key.
    const damagedPeer = conflicts
      .flatMap((relation) => relation.actionIds)
      .find(
        (id) =>
          id !== actionId &&
          Object.hasOwn(this.#entries, id) &&
          this.#parseBindings(this.#entries[id]).error !== null,
      )
    return Object.freeze({
      error: parsed.error,
      relations: Object.freeze(relations),
      conflicts: Object.freeze(conflicts),
      reassignBlockedReason: damagedPeer
        ? `Repair the saved bindings for ${this.#options.catalogue.find((action) => action.actionId === damagedPeer)?.label} before reassigning this shortcut.`
        : null,
    })
  }

  readonly setBindings = (
    actionId: StudioActionId,
    inputs: readonly string[],
  ): StudioUserKeymapResult =>
    this.#save({ ...this.#entries, [actionId]: inputs.map((input) => input.trim()) }, [actionId])

  readonly reassignBindings = (
    actionId: StudioActionId,
    inputs: readonly string[],
    expectedState: StudioUserKeymapState,
  ): StudioUserKeymapResult => {
    if (expectedState !== this.#state)
      return {
        status: 'rejected',
        code: 'validation',
        message:
          'Shortcuts changed while you were reviewing conflicts. Review them again before reassigning.',
      }
    const inspection = this.inspectBindings(actionId, inputs)
    const message = inspection.error ?? inspection.reassignBlockedReason
    if (message) return { status: 'rejected', code: 'validation', message }
    const candidateEntries = { ...this.#entries, [actionId]: inputs.map((input) => input.trim()) }
    const requested = this.#evaluate(candidateEntries).requestedKeymap
    const editedIds = new Set<StudioActionId>([actionId])
    for (const conflict of inspection.conflicts) {
      const identity = this.#options.registry.identity(conflict.binding)
      for (const peer of conflict.actionIds) {
        if (peer === actionId) continue
        const bindings = this.#parseBindings(candidateEntries[peer] ?? requested[peer]).bindings
        candidateEntries[peer] = bindings.filter(
          (binding) => this.#options.registry.identity(binding) !== identity,
        )
        editedIds.add(peer)
      }
    }
    return this.#save(candidateEntries, [...editedIds])
  }

  readonly restoreAction = (actionId: StudioActionId): StudioUserKeymapResult => {
    const candidate = { ...this.#entries }
    delete candidate[actionId]
    return this.#save(candidate, [actionId])
  }

  readonly restoreAll = (): StudioUserKeymapResult => {
    // Unknown actions survive normal edits and resets, for compatibility with another app version.
    return this.#save(
      Object.fromEntries(Object.entries(this.#entries).filter(([id]) => !this.#knownIds.has(id))),
      [],
      true,
    )
  }

  readonly subscribe = (subscriber: (state: StudioUserKeymapState) => void): (() => void) => {
    if (!this.#disposed) this.#subscribers.add(subscriber)
    return () => {
      this.#subscribers.delete(subscriber)
    }
  }

  readonly dispose = (): void => {
    this.#disposed = true
    this.#subscribers.clear()
  }

  #parseBindings(inputs: unknown) {
    if (!isBindingList(inputs))
      return { bindings: [], error: 'Saved bindings must be a list of key combinations.' }
    const bindings: StudioKeyboardBinding[] = []
    const identities = new Set<string>()
    for (const input of inputs) {
      const validation = this.#options.registry.validate(input)
      if (validation.binding === null)
        return { bindings, error: validation.errors.join(' ') || 'Enter a valid key combination.' }
      const identity = this.#options.registry.identity(validation.binding)
      if (identities.has(identity))
        return { bindings, error: 'This action has the same key combination more than once.' }
      identities.add(identity)
      bindings.push(validation.binding)
    }
    return { bindings, error: null }
  }

  #evaluate(candidate: Record<string, unknown>) {
    const overrides: StudioKeyboardKeymapOverrides = {}
    const rejected = new Map<StudioActionId, string>()
    for (const { actionId } of this.#options.catalogue) {
      if (!Object.hasOwn(candidate, actionId)) continue
      const parsed = this.#parseBindings(candidate[actionId])
      if (parsed.error !== null) rejected.set(actionId, parsed.error)
      else overrides[actionId] = Object.freeze(parsed.bindings)
    }
    let keymap = createStudioKeyboardKeymap({ ...this.#defaults, ...overrides })
    const requestedKeymap = keymap
    // Removing one conflicting override restores its default, which may reveal another conflict.
    for (;;) {
      const { conflicts } = analyzeStudioKeyboardRoutes(
        this.#options.catalogue,
        keymap,
        this.#options.registry,
      )
      if (!conflicts.length) break
      let removed = false
      for (const conflict of conflicts) {
        const labels = conflict.actionIds
          .map((id) => this.#options.catalogue.find((action) => action.actionId === id)?.label)
          .join(' / ')
        for (const actionId of conflict.actionIds) {
          if (!Object.hasOwn(overrides, actionId)) continue
          delete overrides[actionId]
          rejected.set(
            actionId,
            `${this.#options.registry.formatForDisplay(conflict.binding)} conflicts with ${labels} in overlapping contexts.`,
          )
          removed = true
        }
      }
      if (!removed) throw new Error('The default keymap contains conflicting bindings.')
      keymap = createStudioKeyboardKeymap({ ...this.#defaults, ...overrides })
    }
    return {
      keymap,
      requestedKeymap,
      rejectedOverrides: Object.freeze(
        [...rejected].map(([actionId, message]) => Object.freeze({ actionId, message })),
      ),
    }
  }

  #snapshot(
    rejectedOverrides: readonly StudioUserKeymapIssue[],
    problem: StudioUserKeymapState['problem'] = null,
  ): StudioUserKeymapState {
    return Object.freeze({
      keymap: this.#options.router.keymap,
      modifiedActionIds: Object.freeze(
        this.#options.catalogue
          .filter((action) => Object.hasOwn(this.#entries, action.actionId))
          .map((action) => action.actionId),
      ),
      unknownActionIds: Object.freeze(
        Object.keys(this.#entries).filter((id) => !this.#knownIds.has(id)),
      ),
      rejectedOverrides: Object.freeze(rejectedOverrides),
      problem,
      canEdit: problem === null || problem.code === 'registration-failed',
    })
  }

  #load(): StudioUserKeymapState {
    let serialized: string | null
    try {
      serialized = this.#options.storage.read()
    } catch {
      return this.#snapshot(
        [],
        Object.freeze({
          code: 'storage-unavailable',
          message:
            'Saved shortcuts could not be read. Defaults are active. Reload to retry, or explicitly reset the saved record.',
        }),
      )
    }
    if (serialized === null) return this.#snapshot([])
    let record: unknown
    try {
      record = JSON.parse(serialized)
    } catch {
      return this.#snapshot(
        [],
        Object.freeze({
          code: 'invalid-record',
          message:
            'The saved shortcut record is damaged. Defaults are active. Reset the saved record to edit shortcuts.',
        }),
      )
    }
    if (!isRecord(record) || !isRecord(record.overrides)) {
      return this.#snapshot(
        [],
        Object.freeze({
          code: 'invalid-record',
          message:
            'The saved shortcut record has an invalid format. Defaults are active. Reset the saved record to edit shortcuts.',
        }),
      )
    }
    if (record.version !== USER_KEYMAP_VERSION) {
      return this.#snapshot(
        [],
        Object.freeze({
          code: 'unsupported-version',
          message:
            'This shortcut record uses an unsupported version. Defaults are active. Resetting will replace the saved record.',
        }),
      )
    }
    this.#entries = record.overrides
    try {
      const candidate = this.#evaluate(this.#entries)
      this.#options.router.replaceKeymap(candidate.keymap, () => {})
      return this.#snapshot(candidate.rejectedOverrides)
    } catch {
      return this.#snapshot(
        Object.freeze(
          this.#options.catalogue
            .filter((action) => Object.hasOwn(this.#entries, action.actionId))
            .map(({ actionId }) =>
              Object.freeze({
                actionId,
                message:
                  'Saved shortcuts could not be registered. Edit or restore this action to retry.',
              }),
            ),
        ),
        Object.freeze({
          code: 'registration-failed',
          message:
            'Saved shortcuts could not be activated. Defaults are active; your saved record is unchanged.',
        }),
      )
    }
  }

  #save(
    candidateEntries: Record<string, unknown>,
    editedIds: readonly StudioActionId[],
    reset = false,
  ): StudioUserKeymapResult {
    if (this.#disposed || this.#updating || (!reset && !this.#state.canEdit))
      return {
        status: 'rejected',
        code: 'unavailable',
        message: 'Shortcuts cannot be changed right now.',
      }
    const candidate = this.#evaluate(candidateEntries)
    const previousRejected = new Set(this.#state.rejectedOverrides.map((issue) => issue.actionId))
    const invalid = candidate.rejectedOverrides.find(
      (issue) => editedIds.includes(issue.actionId) || !previousRejected.has(issue.actionId),
    )
    if (invalid) return { status: 'rejected', code: 'validation', message: invalid.message }
    const transaction: { failureCode: 'registration' | 'storage' } = { failureCode: 'registration' }
    this.#updating = true
    try {
      this.#options.router.replaceKeymap(
        candidate.keymap,
        () => {
          transaction.failureCode = 'storage'
          this.#options.storage.write(
            JSON.stringify({ version: USER_KEYMAP_VERSION, overrides: candidateEntries }),
          )
        },
        () => {
          this.#entries = candidateEntries
          this.#state = this.#snapshot(candidate.rejectedOverrides)
          for (const subscriber of this.#subscribers) {
            try {
              subscriber(this.#state)
            } catch (cause) {
              console.error('Shortcut state subscription failed', cause)
            }
          }
        },
      )
      return { status: 'saved' }
    } catch {
      return {
        status: 'rejected',
        code: transaction.failureCode,
        message:
          transaction.failureCode === 'storage'
            ? 'Shortcuts could not be saved in this browser. Your previous shortcuts are still active. Try again.'
            : 'These shortcuts could not be registered. Your previous shortcuts are still active. Try another combination.',
      }
    } finally {
      this.#updating = false
    }
  }
}

/** Preserves the existing construction contract without exposing the concrete instance type. */
export function createStudioUserKeymap(options: StudioUserKeymapOptions): StudioUserKeymapRuntime {
  return new StudioUserKeymapImpl(options)
}
