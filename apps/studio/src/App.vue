<script setup lang="ts">
import { onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import StudioKeyboardShortcutsDialog from '@/features/keyboard-shortcuts/StudioKeyboardShortcutsDialog.vue'
import { useStudioInterfaceActionTarget } from '@/workbench/actions/vue/studio-interface-action-context'
import { useStudioActions } from '@/workbench/actions/vue/studio-action-context'
import { STUDIO_ACTION } from '@/workbench/actions/studio-action'
import { RouterView } from 'vue-router'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'

const toasts = useUiToastStore()
const isShortcutsOpen = shallowRef(false)
const notifications = useTemplateRef<InstanceType<typeof UiToastRegion>>('notifications')
const { keyboard } = useStudioActions()
const releaseInterfaceTarget = useStudioInterfaceActionTarget().bind({
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
    :shortcut="keyboard.displayBindingsFor(STUDIO_ACTION.NOTIFICATIONS_FOCUS).join(' / ')"
    @dismiss="toasts.dismiss"
  />
</template>
