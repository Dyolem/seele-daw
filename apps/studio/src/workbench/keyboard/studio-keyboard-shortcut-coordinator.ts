import { StudioKeyboardShortcutError } from '@/workbench/keyboard/studio-keyboard-shortcut-error'

import type {
  StudioKeyboardBinding,
  StudioKeyboardBindingValidation,
  StudioKeyboardKeymap,
} from '@/workbench/keyboard/studio-keyboard-binding'

export const STUDIO_KEYBOARD_ACTION = {
  HISTORY_REDO: 'history.redo',
  HISTORY_UNDO: 'history.undo',
  PIANO_ROLL_NOTES_REMOVE: 'piano-roll.notes.remove',
  PIANO_ROLL_SELECTION_CLEAR: 'piano-roll.selection.clear',
  PLAYBACK_TOGGLE: 'playback.toggle',
  PROJECT_SAVE: 'project.save',
} as const

export type StudioKeyboardActionId =
  (typeof STUDIO_KEYBOARD_ACTION)[keyof typeof STUDIO_KEYBOARD_ACTION]

export const STUDIO_KEYBOARD_SCOPE = {
  GLOBAL: 0,
  WORKBENCH: 100,
  PIANO_ROLL: 200,
  MODAL: 300,
} as const

export type StudioKeyboardScope = (typeof STUDIO_KEYBOARD_SCOPE)[keyof typeof STUDIO_KEYBOARD_SCOPE]

export type StudioKeyboardShortcutDispose = () => void

export interface StudioKeyboardBindingRegistry {
  formatForDisplay(binding: StudioKeyboardBinding): string
  register(
    binding: StudioKeyboardBinding,
    listener: (event: KeyboardEvent) => void,
  ): StudioKeyboardShortcutDispose
  validate(input: string): StudioKeyboardBindingValidation
}

export interface StudioKeyboardShortcutDefinition {
  readonly actionId: StudioKeyboardActionId
  readonly bindings: readonly StudioKeyboardBinding[]
  readonly description: string
  readonly isEnabled?: () => boolean
  readonly label: string
  readonly run: () => boolean
  readonly scope: StudioKeyboardScope
}

export interface StudioKeyboardShortcutMetadata {
  readonly actionId: StudioKeyboardActionId
  readonly bindings: readonly StudioKeyboardBinding[]
  readonly description: string
  readonly displayBindings: readonly string[]
  readonly label: string
  readonly scope: StudioKeyboardScope
}

export type StudioKeyboardShortcutFailureOperation = 'enabled-check' | 'handler'

export interface StudioKeyboardShortcutFailure {
  readonly actionId: StudioKeyboardActionId
  readonly cause: unknown
  readonly operation: StudioKeyboardShortcutFailureOperation
}

export interface StudioKeyboardShortcutCoordinatorDependencies {
  readonly bindingRegistry: StudioKeyboardBindingRegistry
  readonly keymap: StudioKeyboardKeymap<StudioKeyboardActionId>
  readonly onError?: (failure: StudioKeyboardShortcutFailure) => void
}

export interface StudioKeyboardShortcutCoordinator {
  bindingsFor(actionId: StudioKeyboardActionId): readonly StudioKeyboardBinding[]
  listShortcuts(): readonly StudioKeyboardShortcutMetadata[]
  register(definitions: readonly StudioKeyboardShortcutDefinition[]): StudioKeyboardShortcutDispose
  validateBindingInput(input: string): StudioKeyboardBindingValidation
  dispose(): void
}

interface RegisteredShortcut {
  readonly definition: StudioKeyboardShortcutDefinition
  readonly metadata: StudioKeyboardShortcutMetadata
}

interface PhysicalBinding {
  readonly dispose: StudioKeyboardShortcutDispose
}

const VALID_SCOPES = new Set<StudioKeyboardScope>(Object.values(STUDIO_KEYBOARD_SCOPE))

function requireText(value: string, field: string, actionId: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new StudioKeyboardShortcutError(
      'invalid-action',
      `Keyboard shortcut ${field} cannot be empty`,
      { actionId },
    )
  }
  return normalized
}

function normalizeDefinition(
  definition: StudioKeyboardShortcutDefinition,
): StudioKeyboardShortcutDefinition {
  const actionId = requireText(definition.actionId, 'Action ID', definition.actionId)
  const uniqueBindings = new Set<StudioKeyboardBinding>()

  for (const binding of definition.bindings) {
    uniqueBindings.add(requireText(binding, 'binding', actionId) as StudioKeyboardBinding)
  }
  if (uniqueBindings.size === 0) {
    throw new StudioKeyboardShortcutError(
      'invalid-action',
      'Keyboard shortcut Action must define at least one binding',
      { actionId },
    )
  }
  if (!VALID_SCOPES.has(definition.scope)) {
    throw new StudioKeyboardShortcutError(
      'invalid-action',
      `Keyboard shortcut Action has an unsupported scope: ${definition.scope}`,
      { actionId },
    )
  }

  return Object.freeze({
    actionId: actionId as StudioKeyboardActionId,
    bindings: Object.freeze([...uniqueBindings]),
    description: requireText(definition.description, 'description', actionId),
    isEnabled: definition.isEnabled,
    label: requireText(definition.label, 'label', actionId),
    run: definition.run,
    scope: definition.scope,
  })
}

function createFailure(
  actionId: StudioKeyboardActionId,
  operation: StudioKeyboardShortcutFailureOperation,
  cause: unknown,
): StudioKeyboardShortcutFailure {
  return Object.freeze({ actionId, cause, operation })
}

class StudioKeyboardShortcutCoordinatorImpl implements StudioKeyboardShortcutCoordinator {
  readonly #actionsByBinding = new Map<StudioKeyboardBinding, RegisteredShortcut[]>()
  readonly #actionsById = new Map<StudioKeyboardActionId, RegisteredShortcut>()
  readonly #bindingRegistry: StudioKeyboardBindingRegistry
  readonly #keymap: StudioKeyboardKeymap<StudioKeyboardActionId>
  readonly #onError: ((failure: StudioKeyboardShortcutFailure) => void) | undefined
  readonly #physicalBindings = new Map<StudioKeyboardBinding, PhysicalBinding>()
  #disposed = false

  constructor(dependencies: StudioKeyboardShortcutCoordinatorDependencies) {
    this.#bindingRegistry = dependencies.bindingRegistry
    this.#keymap = dependencies.keymap
    this.#onError = dependencies.onError
  }

  bindingsFor(actionId: StudioKeyboardActionId): readonly StudioKeyboardBinding[] {
    this.#requireActive()
    return this.#keymap[actionId]
  }

  listShortcuts(): readonly StudioKeyboardShortcutMetadata[] {
    this.#requireActive()
    return Object.freeze(
      [...this.#actionsById.values()]
        .map(({ metadata }) => metadata)
        .sort(
          (left, right) => right.scope - left.scope || left.actionId.localeCompare(right.actionId),
        ),
    )
  }

  register(
    definitions: readonly StudioKeyboardShortcutDefinition[],
  ): StudioKeyboardShortcutDispose {
    this.#requireActive()
    const normalizedDefinitions = definitions.map(normalizeDefinition)
    this.#validateRegistrations(normalizedDefinitions)
    const preparedShortcuts = normalizedDefinitions.map((definition) => {
      const metadata: StudioKeyboardShortcutMetadata = Object.freeze({
        actionId: definition.actionId,
        bindings: definition.bindings,
        description: definition.description,
        displayBindings: Object.freeze(
          definition.bindings.map((binding) => this.#bindingRegistry.formatForDisplay(binding)),
        ),
        label: definition.label,
        scope: definition.scope,
      })
      return Object.freeze({ definition, metadata })
    })
    const createdPhysicalBindings: StudioKeyboardBinding[] = []

    try {
      for (const { definition } of preparedShortcuts) {
        for (const binding of definition.bindings) {
          if (this.#physicalBindings.has(binding)) continue

          const dispose = this.#bindingRegistry.register(binding, (event) => {
            this.#dispatch(binding, event)
          })
          this.#physicalBindings.set(binding, Object.freeze({ dispose }))
          createdPhysicalBindings.push(binding)
        }
      }
    } catch (cause) {
      for (const binding of createdPhysicalBindings) {
        this.#physicalBindings.get(binding)?.dispose()
        this.#physicalBindings.delete(binding)
      }
      throw cause
    }

    for (const registered of preparedShortcuts) {
      const { definition } = registered
      this.#actionsById.set(definition.actionId, registered)

      for (const binding of definition.bindings) {
        const actions = this.#actionsByBinding.get(binding) ?? []
        this.#actionsByBinding.set(
          binding,
          [...actions, registered].sort(
            (left, right) => right.definition.scope - left.definition.scope,
          ),
        )
      }
    }

    let active = true
    return () => {
      if (!active) return
      active = false
      this.#unregister(normalizedDefinitions)
    }
  }

  validateBindingInput(input: string): StudioKeyboardBindingValidation {
    this.#requireActive()
    return this.#bindingRegistry.validate(input)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true

    for (const physicalBinding of this.#physicalBindings.values()) {
      physicalBinding.dispose()
    }
    this.#physicalBindings.clear()
    this.#actionsByBinding.clear()
    this.#actionsById.clear()
  }

  #validateRegistrations(definitions: readonly StudioKeyboardShortcutDefinition[]): void {
    const actionIds = new Set<StudioKeyboardActionId>()
    const scopeBindings = new Set<string>()

    for (const definition of definitions) {
      if (actionIds.has(definition.actionId) || this.#actionsById.has(definition.actionId)) {
        throw new StudioKeyboardShortcutError(
          'action-already-registered',
          `Keyboard shortcut Action is already registered: ${definition.actionId}`,
          { actionId: definition.actionId },
        )
      }
      actionIds.add(definition.actionId)

      for (const binding of definition.bindings) {
        const scopeBinding = `${definition.scope}:${binding}`
        const hasExistingConflict = this.#actionsByBinding
          .get(binding)
          ?.some((action) => action.definition.scope === definition.scope)
        if (scopeBindings.has(scopeBinding) || hasExistingConflict === true) {
          throw new StudioKeyboardShortcutError(
            'scope-binding-conflict',
            `Keyboard shortcut binding is already owned in scope ${definition.scope}: ${binding}`,
            { actionId: definition.actionId, binding },
          )
        }
        scopeBindings.add(scopeBinding)
      }
    }
  }

  #unregister(definitions: readonly StudioKeyboardShortcutDefinition[]): void {
    if (this.#disposed) return
    const affectedBindings = new Set<StudioKeyboardBinding>()

    for (const definition of definitions) {
      this.#actionsById.delete(definition.actionId)
      for (const binding of definition.bindings) {
        affectedBindings.add(binding)
        const remaining = this.#actionsByBinding
          .get(binding)
          ?.filter((action) => action.definition.actionId !== definition.actionId)
        if (remaining === undefined || remaining.length === 0) {
          this.#actionsByBinding.delete(binding)
        } else {
          this.#actionsByBinding.set(binding, remaining)
        }
      }
    }

    for (const binding of affectedBindings) {
      if (this.#actionsByBinding.has(binding)) continue
      this.#physicalBindings.get(binding)?.dispose()
      this.#physicalBindings.delete(binding)
    }
  }

  #dispatch(binding: StudioKeyboardBinding, event: KeyboardEvent): void {
    if (this.#disposed || event.defaultPrevented || event.isComposing || event.keyCode === 229) {
      return
    }

    for (const shortcut of this.#actionsByBinding.get(binding) ?? []) {
      const { definition } = shortcut
      try {
        if (definition.isEnabled?.() === false) continue
      } catch (cause) {
        this.#deliverFailure(createFailure(definition.actionId, 'enabled-check', cause))
        return
      }

      let handled: boolean
      try {
        handled = definition.run()
      } catch (cause) {
        this.#deliverFailure(createFailure(definition.actionId, 'handler', cause))
        return
      }
      if (!handled) continue

      event.preventDefault()
      event.stopPropagation()
      return
    }
  }

  #deliverFailure(failure: StudioKeyboardShortcutFailure): void {
    try {
      this.#onError?.(failure)
    } catch {
      // Keyboard delivery must not escape into the browser event loop.
    }
  }

  #requireActive(): void {
    if (this.#disposed) {
      throw new StudioKeyboardShortcutError(
        'coordinator-disposed',
        'Studio Keyboard Shortcut Coordinator has been disposed',
      )
    }
  }
}

/** Owns Studio Action identity, scope priority and handled-event policy. */
export function createStudioKeyboardShortcutCoordinator(
  dependencies: StudioKeyboardShortcutCoordinatorDependencies,
): StudioKeyboardShortcutCoordinator {
  return new StudioKeyboardShortcutCoordinatorImpl(dependencies)
}
