import type { StudioActionDescriptor, StudioActionId } from '@/workbench/actions/studio-action'
import type { StudioUserKeymapStorage } from '@/workbench/keyboard/browser-user-keymap-storage'
import {
  createStudioKeyboardKeymap,
  type StudioKeyboardKeymapOverrides,
} from '@/workbench/keyboard/studio-default-keymap'
import type {
  StudioKeyboardBinding,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/studio-keyboard-binding-registry'
import type { StudioKeyboardInputRouter } from '@/workbench/keyboard/studio-keyboard-input-router'
import { analyzeStudioKeyboardRoutes } from '@/workbench/keyboard/studio-keyboard-routes'

const USER_KEYMAP_VERSION = 1

export interface StudioUserKeymapIssue {
  readonly actionId: StudioActionId
  readonly message: string
}

export interface StudioUserKeymapState {
  readonly keymap: StudioKeyboardKeymap<StudioActionId>
  readonly modifiedActionIds: readonly StudioActionId[]
  readonly unknownActionIds: readonly string[]
  readonly rejectedOverrides: readonly StudioUserKeymapIssue[]
  readonly problem: Readonly<{
    code: 'invalid-record' | 'unsupported-version' | 'storage-unavailable' | 'registration-failed'
    message: string
  }> | null
  readonly canEdit: boolean
}

export type StudioUserKeymapResult =
  | { readonly status: 'saved' }
  | {
      readonly status: 'rejected'
      readonly code: 'validation' | 'storage' | 'registration' | 'unavailable'
      readonly message: string
    }

function isRecord(record: unknown): record is Record<string, unknown> {
  return typeof record === 'object' && record !== null && !Array.isArray(record)
}

function isBindingList(bindings: unknown): bindings is string[] {
  return Array.isArray(bindings) && bindings.every((binding) => typeof binding === 'string')
}

/** Owns the local preference record and its transaction with physical keyboard registration. */
export function createStudioUserKeymap(options: {
  readonly catalogue: readonly StudioActionDescriptor[]
  readonly registry: StudioKeyboardBindingRegistry
  readonly router: StudioKeyboardInputRouter
  readonly storage: StudioUserKeymapStorage
}) {
  const defaults = options.router.keymap
  const knownIds = new Set<string>(options.catalogue.map((action) => action.actionId))
  const subscribers = new Set<(state: StudioUserKeymapState) => void>()
  let entries: Record<string, unknown> = {}
  let disposed = false
  let updating = false

  function evaluate(candidate: Record<string, unknown>) {
    const overrides: StudioKeyboardKeymapOverrides = {}
    const rejected = new Map<StudioActionId, string>()
    for (const { actionId } of options.catalogue) {
      if (!Object.hasOwn(candidate, actionId)) continue
      const inputs = candidate[actionId]
      if (!isBindingList(inputs)) {
        rejected.set(actionId, 'Saved bindings must be a list of key combinations.')
        continue
      }
      const bindings: StudioKeyboardBinding[] = []
      const identities = new Set<string>()
      for (const input of inputs) {
        const validation = options.registry.validate(input)
        if (validation.binding === null) {
          rejected.set(actionId, validation.errors.join(' ') || 'Enter a valid key combination.')
          break
        }
        const identity = options.registry.identity(validation.binding)
        if (identities.has(identity)) {
          rejected.set(actionId, 'This action has the same key combination more than once.')
          break
        }
        identities.add(identity)
        bindings.push(validation.binding)
      }
      if (!rejected.has(actionId)) overrides[actionId] = Object.freeze(bindings)
    }
    let keymap = createStudioKeyboardKeymap({ ...defaults, ...overrides })
    // Removing one conflicting override restores its default, which may reveal another conflict.
    for (;;) {
      const { conflicts } = analyzeStudioKeyboardRoutes(options.catalogue, keymap, options.registry)
      if (!conflicts.length) break
      let removed = false
      for (const conflict of conflicts) {
        const labels = conflict.actionIds
          .map((id) => options.catalogue.find((action) => action.actionId === id)?.label)
          .join(' / ')
        for (const actionId of conflict.actionIds) {
          if (!Object.hasOwn(overrides, actionId)) continue
          delete overrides[actionId]
          rejected.set(
            actionId,
            `${options.registry.formatForDisplay(conflict.binding)} conflicts with ${labels} in overlapping contexts.`,
          )
          removed = true
        }
      }
      if (!removed) throw new Error('The default keymap contains conflicting bindings.')
      keymap = createStudioKeyboardKeymap({ ...defaults, ...overrides })
    }
    return {
      keymap,
      rejectedOverrides: Object.freeze(
        [...rejected].map(([actionId, message]) => Object.freeze({ actionId, message })),
      ),
    }
  }

  function snapshot(
    rejectedOverrides: readonly StudioUserKeymapIssue[],
    problem: StudioUserKeymapState['problem'] = null,
  ): StudioUserKeymapState {
    return Object.freeze({
      keymap: options.router.keymap,
      modifiedActionIds: Object.freeze(
        options.catalogue
          .filter((action) => Object.hasOwn(entries, action.actionId))
          .map((action) => action.actionId),
      ),
      unknownActionIds: Object.freeze(Object.keys(entries).filter((id) => !knownIds.has(id))),
      rejectedOverrides: Object.freeze(rejectedOverrides),
      problem,
      canEdit: problem === null || problem.code === 'registration-failed',
    })
  }

  function load(): StudioUserKeymapState {
    let serialized: string | null
    try {
      serialized = options.storage.read()
    } catch {
      return snapshot(
        [],
        Object.freeze({
          code: 'storage-unavailable',
          message:
            'Saved shortcuts could not be read. Defaults are active. Reload to retry, or explicitly reset the saved record.',
        }),
      )
    }
    if (serialized === null) return snapshot([])
    let record: unknown
    try {
      record = JSON.parse(serialized)
    } catch {
      return snapshot(
        [],
        Object.freeze({
          code: 'invalid-record',
          message:
            'The saved shortcut record is damaged. Defaults are active. Reset the saved record to edit shortcuts.',
        }),
      )
    }
    if (!isRecord(record) || !isRecord(record.overrides)) {
      return snapshot(
        [],
        Object.freeze({
          code: 'invalid-record',
          message:
            'The saved shortcut record has an invalid format. Defaults are active. Reset the saved record to edit shortcuts.',
        }),
      )
    }
    if (record.version !== USER_KEYMAP_VERSION) {
      return snapshot(
        [],
        Object.freeze({
          code: 'unsupported-version',
          message:
            'This shortcut record uses an unsupported version. Defaults are active. Resetting will replace the saved record.',
        }),
      )
    }
    entries = record.overrides
    try {
      const candidate = evaluate(entries)
      options.router.replaceKeymap(candidate.keymap, () => {})
      return snapshot(candidate.rejectedOverrides)
    } catch {
      return snapshot(
        Object.freeze(
          options.catalogue
            .filter((action) => Object.hasOwn(entries, action.actionId))
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

  let state = load()

  function save(
    candidateEntries: Record<string, unknown>,
    editedIds: readonly StudioActionId[],
    reset = false,
  ): StudioUserKeymapResult {
    if (disposed || updating || (!reset && !state.canEdit))
      return {
        status: 'rejected',
        code: 'unavailable',
        message: 'Shortcuts cannot be changed right now.',
      }
    const candidate = evaluate(candidateEntries)
    const previousRejected = new Set(state.rejectedOverrides.map((issue) => issue.actionId))
    const invalid = candidate.rejectedOverrides.find(
      (issue) => editedIds.includes(issue.actionId) || !previousRejected.has(issue.actionId),
    )
    if (invalid) return { status: 'rejected', code: 'validation', message: invalid.message }
    const transaction: { failureCode: 'registration' | 'storage' } = { failureCode: 'registration' }
    updating = true
    try {
      options.router.replaceKeymap(
        candidate.keymap,
        () => {
          transaction.failureCode = 'storage'
          options.storage.write(
            JSON.stringify({ version: USER_KEYMAP_VERSION, overrides: candidateEntries }),
          )
        },
        () => {
          entries = candidateEntries
          state = snapshot(candidate.rejectedOverrides)
          for (const subscriber of subscribers) {
            try {
              subscriber(state)
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
      updating = false
    }
  }

  return {
    get state() {
      return state
    },
    bindingsForEditing(actionId: StudioActionId): readonly string[] {
      const saved = entries[actionId]
      return Object.freeze(isBindingList(saved) ? [...saved] : [...state.keymap[actionId]])
    },
    setBindings(actionId: StudioActionId, inputs: readonly string[]): StudioUserKeymapResult {
      return save({ ...entries, [actionId]: inputs.map((input) => input.trim()) }, [actionId])
    },
    restoreAction(actionId: StudioActionId): StudioUserKeymapResult {
      const candidate = { ...entries }
      delete candidate[actionId]
      return save(candidate, [actionId])
    },
    restoreAll(): StudioUserKeymapResult {
      // Unknown actions survive normal edits and resets, for compatibility with another app version.
      return save(
        Object.fromEntries(Object.entries(entries).filter(([id]) => !knownIds.has(id))),
        [],
        true,
      )
    },
    subscribe(subscriber: (state: StudioUserKeymapState) => void): () => void {
      if (!disposed) subscribers.add(subscriber)
      return () => {
        subscribers.delete(subscriber)
      }
    },
    dispose(): void {
      disposed = true
      subscribers.clear()
    },
  }
}

export type StudioUserKeymap = ReturnType<typeof createStudioUserKeymap>
