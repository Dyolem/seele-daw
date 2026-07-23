<script setup lang="ts">
import { RouterView } from 'vue-router'

import ProjectNavigationDecisionDialog from '@/features/project-navigation/ProjectNavigationDecisionDialog.vue'
import '@/ui/styles/piano-black.css'
import '@/ui/styles/base.css'
</script>

<template>
  <RouterView />
  <ProjectNavigationDecisionDialog />
</template>
