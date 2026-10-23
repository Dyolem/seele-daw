import { ToneJsMidiFileDecoder, type MidiFileDecoder } from '@seele-daw/midi-file'
import { BrowserLocalFileByteReader, type LocalFileByteReader } from '@seele-daw/platform-browser'
import type { ProjectMidiImportIdFactory } from '@seele-daw/project-midi'
import { createPinia } from 'pinia'
import { createApp, type Component, type ComponentPublicInstance } from 'vue'
import type { Router } from 'vue-router'

import { DisposalStack } from '@/bootstrap/disposal-stack'
import { createStudioActionRuntime } from '@/bootstrap/studio-action-runtime'
import { StudioApplicationError } from '@/bootstrap/studio-application-error'
import { installProjectNavigationGuard } from '@/router/project-navigation-guard'
import { STUDIO_SERVICES_KEY } from '@/symbols'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createProjectEdits } from '@/workbench/edits/project-edits'
import { createStudioMidiImportInstrumentDevice } from '@/workbench/instrument/midi-import-instrument-policy'
import {
  createBrowserTanStackHotkeyRegistry,
  createBrowserUserKeymapStorage,
  type StudioKeyboardBindingRegistry,
  type StudioUserKeymapStorage,
} from '@/workbench/keyboard/setup'
import {
  createBrowserActiveProjectRuntime,
  type BrowserActiveProjectRuntime,
} from '@/workbench/project/browser-active-project-runtime'
import {
  createProjectEntryCoordinator,
  type ProjectEntryCoordinator,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  createProjectMidiImportCoordinator,
  type ProjectMidiImportCoordinator,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  createProjectNavigationConfirmationCoordinator,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import {
  createProjectNavigationDecisionVueBinding,
  type ProjectNavigationDecisionVueBinding,
} from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'
import { createBrowserProjectPlaybackVisualFrame } from '@/workbench/project/playback/browser-animation-frame'
import {
  createBrowserProjectPlaybackRuntime,
  createDefaultBuiltInSampleAssetLocations,
} from '@/workbench/project/playback/browser-runtime'
import { createBrowserProjectPlaybackTimer } from '@/workbench/project/playback/browser-timer'
import {
  createProjectPlaybackCoordinator,
  type ProjectPlaybackCoordinator,
  type ProjectPlaybackRuntimePort,
  type ProjectPlaybackTimerPort,
} from '@/workbench/project/playback/project-playback-coordinator'
import type { ProjectPlaybackVisualFramePort } from '@/workbench/project/playback/project-playback-visual-position'
import { createProjectPlaybackVueBinding } from '@/workbench/project/playback/vue/project-playback-vue-binding'
import { createActiveProjectVueBinding } from '@/workbench/project/vue/active-project-vue-binding'
import type { StudioServices } from '@/workbench/studio-services'

export interface BrowserStudioApplicationOptions {
  readonly rootComponent: Component
  readonly router: Router
}

export interface StudioApplicationComposition extends BrowserStudioApplicationOptions {
  /** Ownership transfers to the composed application, even when composition fails. */
  readonly projectRuntime: BrowserActiveProjectRuntime
  readonly createProjectEntityId?: () => string
  readonly createProjectMidiImportId?: ProjectMidiImportIdFactory
  readonly createRandomValue?: () => number
  readonly userKeymapStorage?: StudioUserKeymapStorage
  readonly keyboardBindingRegistry?: StudioKeyboardBindingRegistry
  readonly midiFileDecoder?: MidiFileDecoder
  readonly midiFileReader?: LocalFileByteReader
  readonly projectPlaybackRuntime?: ProjectPlaybackRuntimePort
  readonly projectPlaybackTimer?: ProjectPlaybackTimerPort
  readonly projectPlaybackVisualFrame?: ProjectPlaybackVisualFramePort
}

export interface StudioApplication {
  readonly projectEntry: ProjectEntryCoordinator
  readonly projectMidiImport: ProjectMidiImportCoordinator
  readonly projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator
  mount(rootContainer: Element | string): ComponentPublicInstance
  dispose(): void
}

function createBrowserProjectEntityId(): string {
  return globalThis.crypto.randomUUID()
}

/**
 * Composes one Studio application graph. Resources are acquired so that the reverse order
 * releases them safely: navigation stops first, then UI capabilities, playback, and finally the
 * Project Runtime.
 */
export function composeStudioApplication(
  composition: StudioApplicationComposition,
): StudioApplication {
  const resources = new DisposalStack()
  resources.own(composition.projectRuntime)
  try {
    const { activeProject, projectCatalog } = composition.projectRuntime
    const createId = composition.createProjectEntityId ?? createBrowserProjectEntityId
    const random = composition.createRandomValue ?? Math.random
    const pinia = createPinia()
    const toasts = useUiToastStore(pinia)

    const project = resources.own(createActiveProjectVueBinding(activeProject))

    const playbackRuntime =
      composition.projectPlaybackRuntime ??
      createBrowserProjectPlaybackRuntime({
        assetBaseBySoundbank: createDefaultBuiltInSampleAssetLocations(location.origin),
        expectedOrigin: location.origin,
      })
    let projectPlayback: ProjectPlaybackCoordinator
    try {
      projectPlayback = createProjectPlaybackCoordinator({
        activeProject,
        runtime: playbackRuntime,
        timer: composition.projectPlaybackTimer ?? createBrowserProjectPlaybackTimer(),
      })
    } catch (cause) {
      // The coordinator owns the runtime only once it exists.
      playbackRuntime.dispose()
      throw cause
    }
    resources.own(projectPlayback)
    const playback = resources.own(
      createProjectPlaybackVueBinding(
        projectPlayback,
        composition.projectPlaybackVisualFrame ?? createBrowserProjectPlaybackVisualFrame(),
      ),
    )

    let navigation: ProjectNavigationDecisionVueBinding | null = null
    const actions = resources.own(
      createStudioActionRuntime({
        userKeymapStorage: composition.userKeymapStorage ?? createBrowserUserKeymapStorage(),
        bindingRegistry:
          composition.keyboardBindingRegistry ??
          createBrowserTanStackHotkeyRegistry({ target: document }),
        isModalActive: () => navigation?.context.pendingDecision.value != null,
        reportFailure: (failure) => {
          console.error('Studio Action failed', failure)
          toasts.danger(
            'Action could not complete',
            'Please try again. If the problem persists, reload the project.',
          )
        },
      }),
    )
    navigation = resources.own(createProjectNavigationDecisionVueBinding())
    const projectNavigationConfirmation = createProjectNavigationConfirmationCoordinator({
      activeProject,
      requestDecision: navigation.requestDecision,
    })
    const projectMidiImport = createProjectMidiImportCoordinator({
      activeProject,
      createId: composition.createProjectMidiImportId ?? (() => createBrowserProjectEntityId()),
      createInstrumentDevice: createStudioMidiImportInstrumentDevice,
      createRandomValue: random,
      decoder: composition.midiFileDecoder ?? new ToneJsMidiFileDecoder(),
      fileReader: composition.midiFileReader ?? new BrowserLocalFileByteReader(),
      navigationConfirmation: projectNavigationConfirmation,
    })
    const projectEntry = createProjectEntryCoordinator({ activeProject, projectCatalog })
    resources.defer(
      installProjectNavigationGuard(composition.router, projectNavigationConfirmation),
    )

    const vueApplication = createApp(composition.rootComponent)
    vueApplication.provide(
      STUDIO_SERVICES_KEY,
      Object.freeze<StudioServices>({
        actions,
        edits: createProjectEdits({ activeProject, createId, random }),
        midiImport: projectMidiImport,
        navigation: navigation.context,
        playback: playback.context,
        project: project.context,
        projectEntry,
      }),
    )
    vueApplication.use(pinia)
    // Router installation may start the initial navigation, so app-scoped services go first.
    vueApplication.use(composition.router)

    let mounted = false
    let disposed = false
    return {
      projectEntry,
      projectMidiImport,
      projectNavigationConfirmation,
      mount(rootContainer) {
        if (disposed) {
          throw new StudioApplicationError(
            'application-disposed',
            'The Studio application cannot be mounted after it has been disposed',
          )
        }
        if (mounted) {
          throw new StudioApplicationError(
            'already-mounted',
            'The Studio application has already been mounted',
          )
        }
        const component = vueApplication.mount(rootContainer)
        mounted = true
        return component
      },
      dispose() {
        if (disposed) return
        disposed = true
        try {
          if (mounted) vueApplication.unmount()
        } finally {
          mounted = false
          resources.dispose()
        }
      },
    }
  } catch (cause) {
    resources.dispose()
    throw cause
  }
}

/** Creates the browser-owned resources and composes them for one Studio page lifetime. */
export function createBrowserStudioApplication(
  options: BrowserStudioApplicationOptions,
): StudioApplication {
  return composeStudioApplication({
    rootComponent: options.rootComponent,
    router: options.router,
    projectRuntime: createBrowserActiveProjectRuntime(),
  })
}
