import App from '@/App.vue'
import { createBrowserStudioApplication } from '@/bootstrap/studio-application'
import router from '@/router'

const studioApplication = createBrowserStudioApplication({
  rootComponent: App,
  router,
})

studioApplication.mount('#app')

if (import.meta.hot) {
  import.meta.hot.dispose(() => studioApplication.dispose())
}
