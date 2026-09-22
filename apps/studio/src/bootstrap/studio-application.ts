import { STUDIO_EDITOR_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-editor-action-context'
import { STUDIO_INTERFACE_ACTION_TARGET_KEY } from '@/workbench/actions/vue/studio-interface-action-context'
import { ToneJsMidiFileDecoder, type MidiFileDecoder } from '@seele-daw/midi-file'
import { BrowserLocalFileByteReader, type LocalFileByteReader } from '@seele-daw/platform-browser'
import type { ProjectMidiImportIdFactory } from '@seele-daw/project-midi'
import { createPinia } from 'pinia'
import {
  createApp,
  type Component,
  type ComponentPublicInstance,
  type App as VueApplication,
} from 'vue'
import type { Router } from 'vue-router'

import { StudioApplicationError } from '@/bootstrap/studio-application-error'
import {
  installProjectNavigationGuard,
  type ProjectNavigationGuardDispose,
} from '@/router/project-navigation-guard'
import { createBrowserTanStackHotkeyRegistry } from '@/workbench/keyboard/browser-tanstack-hotkey-registry'
import {
  createStudioActionRuntime,
  type StudioActionRuntime,
} from '@/bootstrap/studio-action-runtime'
import {
  PROJECT_WORKBENCH_ACTION_TARGET_KEY,
  ARRANGEMENT_ACTION_TARGETS_KEY,
} from '@/features/project-workspace/actions/project-workbench-action-context'
import { PIANO_ROLL_TOOL_ACTION_TARGET_KEY } from '@/features/piano-roll/actions/piano-roll-action-context'
import { STUDIO_ACTION_CONTEXT_KEY } from '@/workbench/actions/vue/studio-action-context'
import type { StudioKeyboardBindingRegistry } from '@/workbench/keyboard/studio-keyboard-binding-registry'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import { createStudioMidiImportInstrumentDevice } from '@/workbench/instrument/midi-import-instrument-policy'
import {
  createBrowserActiveProjectRuntime,
  type BrowserActiveProjectRuntime,
} from '@/workbench/project/browser-active-project-runtime'
import { createProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { PROJECT_CLIP_CONTEXT_KEY } from '@/workbench/project/clip/vue/project-clip-context'
import {
  createProjectEntryCoordinator,
  type ProjectEntryCoordinator,
} from '@/workbench/project/entry/project-entry-coordinator'
import { PROJECT_ENTRY_CONTEXT_KEY } from '@/workbench/project/entry/vue/project-entry-context'
import { createProjectMidiNoteCoordinator } from '@/workbench/project/midi-note/project-midi-note-coordinator'
import { PROJECT_MIDI_NOTE_CONTEXT_KEY } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import { createProjectMidiSustainPedalCoordinator } from '@/workbench/project/midi-sustain-pedal/project-midi-sustain-pedal-coordinator'
import { PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import {
  createProjectMidiImportCoordinator,
  type ProjectMidiImportCoordinator,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import { PROJECT_MIDI_IMPORT_CONTEXT_KEY } from '@/workbench/project/midi-import/vue/project-midi-import-context'
import {
  createProjectNavigationConfirmationCoordinator,
  type ProjectNavigationConfirmationCoordinator,
} from '@/workbench/project/navigation/project-navigation-confirmation'
import { PROJECT_NAVIGATION_DECISION_CONTEXT_KEY } from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import {
  createProjectNavigationDecisionVueBinding,
  type ProjectNavigationDecisionVueBinding,
} from '@/workbench/project/navigation/vue/project-navigation-decision-vue-binding'
import {
  createBrowserProjectPlaybackRuntime,
  createDefaultBuiltInSampleAssetLocations,
} from '@/workbench/project/playback/browser-runtime'
import { createBrowserProjectPlaybackVisualFrame } from '@/workbench/project/playback/browser-animation-frame'
import { createBrowserProjectPlaybackTimer } from '@/workbench/project/playback/browser-timer'
import {
  createProjectPlaybackCoordinator,
  type ProjectPlaybackCoordinator,
  type ProjectPlaybackRuntimePort,
  type ProjectPlaybackTimerPort,
} from '@/workbench/project/playback/project-playback-coordinator'
import type { ProjectPlaybackVisualFramePort } from '@/workbench/project/playback/project-playback-visual-position'
import { PROJECT_PLAYBACK_CONTEXT_KEY } from '@/workbench/project/playback/vue/project-playback-context'
import {
  createProjectPlaybackVueBinding,
  type ProjectPlaybackVueBinding,
} from '@/workbench/project/playback/vue/project-playback-vue-binding'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import { PROJECT_TRACK_CONTEXT_KEY } from '@/workbench/project/track/vue/project-track-context'
import { createProjectTempoEventCoordinator } from '@/workbench/project/tempo-event/project-tempo-event-coordinator'
import { PROJECT_TEMPO_EVENT_CONTEXT_KEY } from '@/workbench/project/tempo-event/vue/project-tempo-event-context'
import { ACTIVE_PROJECT_CONTEXT_KEY } from '@/workbench/project/vue/active-project-context'
import {
  createActiveProjectVueBinding,
  type ActiveProjectVueBinding,
} from '@/workbench/project/vue/active-project-vue-binding'

export interface BrowserStudioApplicationOptions {
  readonly rootComponent: Component
  readonly router: Router
}

export interface StudioApplicationComposition extends BrowserStudioApplicationOptions {
  /** Ownership transfers to the composed application. */
  readonly projectRuntime: BrowserActiveProjectRuntime
  readonly createProjectEntityId?: () => string
  readonly createProjectMidiImportId?: ProjectMidiImportIdFactory
  readonly createRandomValue?: () => number
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

class StudioApplicationImpl implements StudioApplication {
  readonly projectEntry: ProjectEntryCoordinator
  readonly projectMidiImport: ProjectMidiImportCoordinator
  readonly projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator
  readonly #vueApplication: VueApplication
  readonly #projectRuntime: BrowserActiveProjectRuntime
  readonly #projectPlayback: ProjectPlaybackCoordinator
  readonly #projectPlaybackBinding: ProjectPlaybackVueBinding
  readonly #activeProjectBinding: ActiveProjectVueBinding
  readonly #projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding
  readonly #projectNavigationGuardDispose: ProjectNavigationGuardDispose
  readonly #actionRuntime: StudioActionRuntime
  #mounted = false
  #disposed = false
  #resourcesReleased = false

  constructor(
    vueApplication: VueApplication,
    projectRuntime: BrowserActiveProjectRuntime,
    projectPlayback: ProjectPlaybackCoordinator,
    projectPlaybackBinding: ProjectPlaybackVueBinding,
    activeProjectBinding: ActiveProjectVueBinding,
    projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding,
    projectNavigationGuardDispose: ProjectNavigationGuardDispose,
    actionRuntime: StudioActionRuntime,
    projectEntry: ProjectEntryCoordinator,
    projectMidiImport: ProjectMidiImportCoordinator,
    projectNavigationConfirmation: ProjectNavigationConfirmationCoordinator,
  ) {
    this.#vueApplication = vueApplication
    this.#projectRuntime = projectRuntime
    this.#projectPlayback = projectPlayback
    this.#projectPlaybackBinding = projectPlaybackBinding
    this.#activeProjectBinding = activeProjectBinding
    this.#projectNavigationDecisionBinding = projectNavigationDecisionBinding
    this.#projectNavigationGuardDispose = projectNavigationGuardDispose
    this.#actionRuntime = actionRuntime
    this.projectEntry = projectEntry
    this.projectMidiImport = projectMidiImport
    this.projectNavigationConfirmation = projectNavigationConfirmation
  }

  mount(rootContainer: Element | string): ComponentPublicInstance {
    if (this.#disposed) {
      throw new StudioApplicationError(
        'application-disposed',
        'The Studio application cannot be mounted after it has been disposed',
      )
    }
    if (this.#mounted) {
      throw new StudioApplicationError(
        'already-mounted',
        'The Studio application has already been mounted',
      )
    }

    const component = this.#vueApplication.mount(rootContainer)
    this.#mounted = true
    return component
  }

  dispose(): void {
    if (this.#disposed) return

    this.#disposed = true
    try {
      if (this.#mounted) this.#vueApplication.unmount()
    } finally {
      this.#mounted = false
      this.#releaseResources()
    }
  }

  #releaseResources(): void {
    if (this.#resourcesReleased) return

    this.#resourcesReleased = true
    // Stop new navigation before settling one-shot UI capabilities and browser-owned resources.
    try {
      this.#projectNavigationGuardDispose()
    } finally {
      try {
        this.#projectNavigationDecisionBinding.dispose()
      } finally {
        try {
          this.#actionRuntime.dispose()
        } finally {
          try {
            this.#projectPlaybackBinding.dispose()
          } finally {
            try {
              this.#projectPlayback.dispose()
            } finally {
              try {
                this.#activeProjectBinding.dispose()
              } finally {
                this.#projectRuntime.dispose()
              }
            }
          }
        }
      }
    }
  }
}

function createBrowserProjectEntityId(): string {
  return globalThis.crypto.randomUUID()
}

/** Composes an owned Project Runtime into one Studio application graph. */
export function composeStudioApplication(
  composition: StudioApplicationComposition,
): StudioApplication {
  const { projectRuntime } = composition
  let activeProjectBinding: ActiveProjectVueBinding | null = null
  let projectNavigationDecisionBinding: ProjectNavigationDecisionVueBinding | null = null
  let projectNavigationGuardDispose: ProjectNavigationGuardDispose | null = null
  let actionRuntime: StudioActionRuntime | null = null
  let projectPlayback: ProjectPlaybackCoordinator | null = null
  let projectPlaybackBinding: ProjectPlaybackVueBinding | null = null
  let unownedProjectPlaybackRuntime: ProjectPlaybackRuntimePort | null = null

  const pinia = createPinia()
  const toasts = useUiToastStore(pinia)

  try {
    activeProjectBinding = createActiveProjectVueBinding(projectRuntime.activeProject)
    projectNavigationDecisionBinding = createProjectNavigationDecisionVueBinding()
    const projectEntry = createProjectEntryCoordinator({
      activeProject: projectRuntime.activeProject,
      projectCatalog: projectRuntime.projectCatalog,
    })
    const projectNavigationConfirmation = createProjectNavigationConfirmationCoordinator({
      activeProject: projectRuntime.activeProject,
      requestDecision: projectNavigationDecisionBinding.requestDecision,
    })
    const projectMidiImport = createProjectMidiImportCoordinator({
      activeProject: projectRuntime.activeProject,
      createId: composition.createProjectMidiImportId ?? (() => createBrowserProjectEntityId()),
      createInstrumentDevice: createStudioMidiImportInstrumentDevice,
      createRandomValue: composition.createRandomValue ?? Math.random,
      decoder: composition.midiFileDecoder ?? new ToneJsMidiFileDecoder(),
      fileReader: composition.midiFileReader ?? new BrowserLocalFileByteReader(),
      navigationConfirmation: projectNavigationConfirmation,
    })
    const projectTracks = createProjectTrackCoordinator({
      activeProject: projectRuntime.activeProject,
      createUniqueId: composition.createProjectEntityId ?? createBrowserProjectEntityId,
      createRandomValue: composition.createRandomValue ?? Math.random,
    })
    const projectTempoEvents = createProjectTempoEventCoordinator({
      activeProject: projectRuntime.activeProject,
      createUniqueId: composition.createProjectEntityId ?? createBrowserProjectEntityId,
    })
    const projectClips = createProjectClipCoordinator({
      activeProject: projectRuntime.activeProject,
      createUniqueId: composition.createProjectEntityId ?? createBrowserProjectEntityId,
    })
    const projectMidiNotes = createProjectMidiNoteCoordinator({
      activeProject: projectRuntime.activeProject,
      createUniqueId: composition.createProjectEntityId ?? createBrowserProjectEntityId,
    })
    const projectMidiSustainPedal = createProjectMidiSustainPedalCoordinator({
      activeProject: projectRuntime.activeProject,
      createUniqueId: composition.createProjectEntityId ?? createBrowserProjectEntityId,
    })
    const projectPlaybackRuntime =
      composition.projectPlaybackRuntime ??
      createBrowserProjectPlaybackRuntime({
        assetBaseBySoundbank: createDefaultBuiltInSampleAssetLocations(location.origin),
        expectedOrigin: location.origin,
      })
    unownedProjectPlaybackRuntime = projectPlaybackRuntime
    projectPlayback = createProjectPlaybackCoordinator({
      activeProject: projectRuntime.activeProject,
      runtime: projectPlaybackRuntime,
      timer: composition.projectPlaybackTimer ?? createBrowserProjectPlaybackTimer(),
    })
    unownedProjectPlaybackRuntime = null
    projectPlaybackBinding = createProjectPlaybackVueBinding(
      projectPlayback,
      composition.projectPlaybackVisualFrame ?? createBrowserProjectPlaybackVisualFrame(),
    )
    actionRuntime = createStudioActionRuntime({
      bindingRegistry:
        composition.keyboardBindingRegistry ??
        createBrowserTanStackHotkeyRegistry({ target: document }),
      isModalActive: () => projectNavigationDecisionBinding?.context.pendingDecision.value != null,
      reportFailure: (failure) => {
        console.error('Studio Action failed', failure)
        toasts.danger(
          'Action could not complete',
          'Please try again. If the problem persists, reload the project.',
        )
      },
    })
    projectNavigationGuardDispose = installProjectNavigationGuard(
      composition.router,
      projectNavigationConfirmation,
    )
    const vueApplication = createApp(composition.rootComponent)

    vueApplication.provide(ACTIVE_PROJECT_CONTEXT_KEY, activeProjectBinding.context)
    vueApplication.provide(PROJECT_ENTRY_CONTEXT_KEY, Object.freeze({ projectEntry }))
    vueApplication.provide(PROJECT_MIDI_IMPORT_CONTEXT_KEY, Object.freeze({ projectMidiImport }))
    vueApplication.provide(PROJECT_TRACK_CONTEXT_KEY, Object.freeze({ projectTracks }))
    vueApplication.provide(PROJECT_TEMPO_EVENT_CONTEXT_KEY, Object.freeze({ projectTempoEvents }))
    vueApplication.provide(PROJECT_CLIP_CONTEXT_KEY, Object.freeze({ projectClips }))
    vueApplication.provide(PROJECT_MIDI_NOTE_CONTEXT_KEY, Object.freeze({ projectMidiNotes }))
    vueApplication.provide(
      PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY,
      Object.freeze({ projectMidiSustainPedal }),
    )
    vueApplication.provide(PROJECT_PLAYBACK_CONTEXT_KEY, projectPlaybackBinding.context)
    vueApplication.provide(STUDIO_ACTION_CONTEXT_KEY, actionRuntime)
    vueApplication.provide(PROJECT_WORKBENCH_ACTION_TARGET_KEY, actionRuntime.workbenchTarget)
    vueApplication.provide(PIANO_ROLL_TOOL_ACTION_TARGET_KEY, actionRuntime.pianoRollToolTarget)
    vueApplication.provide(STUDIO_EDITOR_ACTION_CONTEXT_KEY, actionRuntime)
    vueApplication.provide(STUDIO_INTERFACE_ACTION_TARGET_KEY, actionRuntime.interfaceTarget)
    vueApplication.provide(ARRANGEMENT_ACTION_TARGETS_KEY, actionRuntime)
    vueApplication.provide(
      PROJECT_NAVIGATION_DECISION_CONTEXT_KEY,
      projectNavigationDecisionBinding.context,
    )
    vueApplication.use(pinia)
    // Router installation may start initial navigation, so app-scoped dependencies go first.
    vueApplication.use(composition.router)

    return new StudioApplicationImpl(
      vueApplication,
      projectRuntime,
      projectPlayback,
      projectPlaybackBinding,
      activeProjectBinding,
      projectNavigationDecisionBinding,
      projectNavigationGuardDispose,
      actionRuntime,
      projectEntry,
      projectMidiImport,
      projectNavigationConfirmation,
    )
  } catch (failureCause) {
    try {
      projectNavigationGuardDispose?.()
    } finally {
      try {
        projectNavigationDecisionBinding?.dispose()
      } finally {
        try {
          actionRuntime?.dispose()
        } finally {
          try {
            projectPlaybackBinding?.dispose()
          } finally {
            try {
              if (projectPlayback === null) unownedProjectPlaybackRuntime?.dispose()
              else projectPlayback.dispose()
            } finally {
              try {
                activeProjectBinding?.dispose()
              } finally {
                projectRuntime.dispose()
              }
            }
          }
        }
      }
    }
    throw failureCause
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
