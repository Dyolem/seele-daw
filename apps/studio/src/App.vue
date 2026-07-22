<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'

import { ACTIVE_PROJECT_PHASE } from '@/workbench/project/active-project-state'
import { useActiveProject } from '@/workbench/project/vue/active-project-context'

const { state } = useActiveProject()
const readyProject = computed(() =>
  state.value.phase === ACTIVE_PROJECT_PHASE.READY ? state.value : null,
)
</script>

<template>
  <section v-if="readyProject" class="project-ready" aria-labelledby="project-ready-title">
    <div class="project-ready__mark" aria-hidden="true">✓</div>
    <p>PROJECT READY</p>
    <h1 id="project-ready-title">Project ready</h1>
    <code>{{ readyProject.projectId }}</code>
    <span>The editor interface will be designed in the next UI phase.</span>
  </section>
  <RouterView v-else />
</template>

<style>
:root {
  color-scheme: dark;
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  min-width: 320px;
  min-height: 100%;
  margin: 0;
}

body {
  min-height: 100vh;
  background: #0b0b0d;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

.project-ready {
  display: grid;
  min-height: 100vh;
  place-items: center;
  align-content: center;
  padding: 32px;
  color: #f5f5f7;
  text-align: center;
  background: radial-gradient(circle at 50% 38%, rgb(200 255 69 / 10%), transparent 22rem), #0b0b0d;
}

.project-ready__mark {
  display: grid;
  width: 58px;
  height: 58px;
  margin-bottom: 22px;
  place-items: center;
  border-radius: 18px;
  color: #0b0b0d;
  background: #c8ff45;
  font-size: 25px;
  font-weight: 800;
}

.project-ready p {
  margin: 0 0 12px;
  color: #c8ff45;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.18em;
}

.project-ready h1 {
  margin: 0 0 10px;
  font-size: clamp(36px, 7vw, 68px);
  letter-spacing: -0.05em;
}

.project-ready code {
  margin-bottom: 28px;
  color: #8e8e98;
  font-size: 12px;
}

.project-ready span {
  color: #ababb4;
  font-size: 14px;
}
</style>
