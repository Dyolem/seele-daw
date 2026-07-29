<script setup lang="ts">
import { RouterView } from 'vue-router'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import UiToastRegion from '@/ui/components/UiToastRegion.vue'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'

const toasts = useUiToastStore()
</script>

<template>
  <RouterView />
  <ProjectNavigationDecisionDialog />
  <UiToastRegion :message="toasts.message" @dismiss="toasts.dismiss" />
</template>
