<script setup lang="ts">
import { onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import StudioKeyboardShortcutsDialog from '@/features/keyboard-shortcuts/StudioKeyboardShortcutsDialog.vue'
import { INTERFACE_CONTEXT } from '@/workbench/actions/studio-interface-actions'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import { RouterView } from 'vue-router'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'

const toasts = useUiToastStore()
const isShortcutsOpen = shallowRef(false)
const notifications = useTemplateRef<InstanceType<typeof UiToastRegion>>('notifications')
const { contexts, keyboard } = useStudioActions()
const releaseInterfaceTarget = contexts.bind(INTERFACE_CONTEXT, {
  showShortcuts: () => {
    isShortcutsOpen.value = true
  },
  focusNotifications: () => notifications.value?.focus(),
})
onBeforeUnmount(releaseInterfaceTarget)
</script>

<template>
  <RouterView />
  <ProjectNavigationDecisionDialog />
  <StudioKeyboardShortcutsDialog v-model:open="isShortcutsOpen" />
  <UiToastRegion
    ref="notifications"
    :message="toasts.message"
    :shortcut="keyboard.displayBindingsFor('notifications.focus').join(' / ')"
    @dismiss="toasts.dismiss"
  />
</template>
