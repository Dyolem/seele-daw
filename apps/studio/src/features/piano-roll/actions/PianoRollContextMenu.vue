<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuTrigger,
  injectContextMenuRootContext,
} from 'reka-ui'

import UiMenuSurface from '@/ui/components/UiMenuSurface.vue'
import UiMenuItem from '@/ui/components/UiMenuItem.vue'
import type { PianoRollContextMenuTarget } from '@/features/piano-roll/actions/piano-roll-context-menu-target'
import { STUDIO_ACTION, type StudioActionId } from '@/workbench/actions/studio-action'
import { presentStudioAction } from '@/workbench/actions/studio-action-control'
import {
  useStudioActions,
  useStudioKeyboardLayer,
} from '@/workbench/actions/vue/studio-action-context'

const props = defineProps<{
  readonly prepareTarget: (event: MouseEvent) => PianoRollContextMenuTarget | null
}>()
const root = injectContextMenuRootContext()
const { actions, keyboard } = useStudioActions()
const target = shallowRef<PianoRollContextMenuTarget | null>(null)
let releaseTarget: (() => void) | null = null

const menuActions = computed(() => {
  if (!target.value?.binding.isCurrent()) return []
  return [STUDIO_ACTION.PIANO_ROLL_SELECTION_DELETE, STUDIO_ACTION.PIANO_ROLL_SELECTION_CLEAR].map(
    (actionId) => presentStudioAction(actions, keyboard, actionId),
  )
})
const hasExecutableAction = computed(() => menuActions.value.some((action) => action.enabled))
useStudioKeyboardLayer(() => root.open.value)

function releasePreparedTarget(): void {
  releaseTarget?.()
  releaseTarget = null
  target.value = null
}

function prepareContextMenu(event: MouseEvent): void {
  releasePreparedTarget()
  const prepared = event.defaultPrevented ? null : props.prepareTarget(event)
  if (prepared === null || !prepared.binding.isCurrent()) {
    event.preventDefault()
    return
  }
  target.value = prepared
  if (!hasExecutableAction.value) {
    event.preventDefault()
    return
  }
  releaseTarget = prepared.binding.onInvalidated(() => {
    target.value = null
    root.onOpenChange(false)
  })
}

function invoke(actionId: StudioActionId): void {
  // Invocation by ID must never retarget an already-open menu to a replacement editor.
  if (target.value?.binding.isCurrent()) actions.invoke(actionId, 'context-menu')
}

function restoreFocus(event: Event): void {
  // Restore while the capability is current; a deferred focus could steal focus from a new editor.
  event.preventDefault()
  const currentTarget = target.value
  if (currentTarget?.binding.isCurrent() && currentTarget.focusElement.isConnected) {
    currentTarget.focusElement.focus({ preventScroll: true })
  }
}

watch(
  [root.open, hasExecutableAction],
  ([open, executable]) => {
    // Reka ContextMenuRoot owns its open state, including long-press requests.
    if (open && !executable) root.onOpenChange(false)
  },
  { flush: 'sync' },
)
onBeforeUnmount(releasePreparedTarget)
</script>

<template>
  <ContextMenuTrigger
    as-child
    @contextmenu="prepareContextMenu"
    @pointerdown.capture="releasePreparedTarget"
  >
    <slot />
  </ContextMenuTrigger>
  <ContextMenuPortal>
    <ContextMenuContent
      as-child
      prioritize-position
      aria-label="Piano Roll selection actions"
      :collision-padding="8"
      @close-auto-focus="restoreFocus"
    >
      <UiMenuSurface class="piano-roll-context-menu">
        <ContextMenuItem
          v-for="action in menuActions"
          :key="action.actionId"
          as-child
          :disabled="!action.enabled"
          :aria-busy="action.busy || undefined"
          :aria-description="action.disabledReason ?? undefined"
          :title="action.title"
          @select="invoke(action.actionId)"
        >
          <UiMenuItem class="piano-roll-context-menu__item">
            {{ action.label }}
            <template v-if="action.shortcut" #trailing>
              <span class="piano-roll-context-menu__shortcut">{{ action.shortcut }}</span>
            </template>
          </UiMenuItem>
        </ContextMenuItem>
      </UiMenuSurface>
    </ContextMenuContent>
  </ContextMenuPortal>
</template>
