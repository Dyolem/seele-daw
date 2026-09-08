import type { ProjectSession, Tick } from '@seele-daw/project-core'
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import { createProjectWorkspaceLocation } from '@/router/project-routes'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  STUDIO_ACTION_CANCELLED,
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import type { ReadyActiveProjectState } from '@/workbench/project/active-project-state'
import {
  reportProjectMidiImportSuccess,
  reportProjectMidiTrackImportSuccess,
} from '@/workbench/project/midi-import/project-midi-import-feedback'
import { useProjectMidiImport } from '@/workbench/project/midi-import/vue/project-midi-import-context'

type MidiImportDestination =
  | { readonly target: 'new-project' }
  | { readonly target: 'new-tracks'; readonly placementTick: Tick }

type PendingMidiImport = MidiImportDestination & {
  readonly session: ProjectSession
  finish(result: StudioActionCompletion): void
}

/** The mounted page owns the native chooser and its pending result, never Pinia or the catalogue. */
export function useProjectWorkbenchMidiImport(options: {
  getRouteProjectId(): string
  getReadyProject(): ReadyActiveProjectState | null
  getPlacementTick(): Tick
}) {
  const { projectMidiImport } = useProjectMidiImport()
  const selection = useProjectWorkbenchSelectionStore()
  const toasts = useUiToastStore()
  const router = useRouter()
  const input = shallowRef<HTMLInputElement | null>(null)
  const phase = shallowRef<'idle' | 'selecting' | 'importing'>('idle')
  let pending: PendingMidiImport | null = null

  function finish(result: StudioActionCompletion): void {
    const request = pending
    pending = null
    phase.value = 'idle'
    if (input.value !== null) input.value.value = ''
    request?.finish(result)
  }

  function request(target: PendingMidiImport['target']): Promise<StudioActionCompletion> {
    const ready = options.getReadyProject()
    const chooser = input.value
    if (pending !== null || ready === null || chooser === null) {
      return Promise.resolve(STUDIO_ACTION_NOT_APPLIED)
    }
    const destination: MidiImportDestination =
      target === 'new-tracks' ? { target, placementTick: options.getPlacementTick() } : { target }
    const completion = new Promise<StudioActionCompletion>((resolve) => {
      pending = { ...destination, session: ready.session, finish: resolve }
    })
    phase.value = 'selecting'
    try {
      // Keep this synchronous with the originating menu/button/keyboard user activation.
      chooser.click()
    } catch (cause) {
      finish({ status: 'failed', cause, reported: false })
    }
    return completion
  }

  function cancelSelection(): void {
    if (phase.value === 'selecting') finish(STUDIO_ACTION_NOT_APPLIED)
  }

  async function importSelection(): Promise<void> {
    const request = pending
    if (request === null || phase.value !== 'selecting') return
    const file = input.value?.files?.item(0) ?? null
    if (file === null || options.getReadyProject()?.session !== request.session) {
      finish(STUDIO_ACTION_NOT_APPLIED)
      return
    }
    if (input.value !== null) input.value.value = ''
    phase.value = 'importing'
    try {
      if (request.target === 'new-project') {
        const result = await projectMidiImport.importLocalFileReplacingActiveProject(file)
        if (pending !== request) return
        if (result === null) {
          finish(STUDIO_ACTION_NOT_APPLIED)
          return
        }
        reportProjectMidiImportSuccess(toasts, result)
        await router.push(createProjectWorkspaceLocation(result.projectId))
      } else {
        const result = await projectMidiImport.importLocalFileAsNewTracks(
          file,
          request.placementTick,
        )
        if (pending !== request) return
        // The import owner resolves the destination after decoding. Do not apply a result's
        // selection to a different mounted project when that authoritative destination changes.
        if (options.getReadyProject()?.projectId === result.projectId) {
          const firstTrackId = result.importedTrackIds[0]
          if (firstTrackId !== undefined) selection.selectTrack(firstTrackId)
          reportProjectMidiTrackImportSuccess(toasts, result)
        }
      }
      if (pending === request) finish(STUDIO_ACTION_COMPLETED)
    } catch (cause) {
      if (pending !== request) return
      const message =
        cause instanceof Error && cause.message.trim().length > 0
          ? cause.message
          : 'The MIDI file could not be imported. Please try another file.'
      toasts.danger('MIDI could not be imported', message)
      finish({ status: 'failed', cause, reported: true })
    }
  }

  watch(options.getRouteProjectId, () => finish(STUDIO_ACTION_CANCELLED), { flush: 'sync' })
  watch(
    () => options.getReadyProject()?.session ?? null,
    () => {
      // New-project import deliberately activates a new Session before returning its result;
      // that business flow still owns navigation. Track import must retire with its old target.
      if (phase.value === 'selecting' || pending?.target === 'new-tracks')
        finish(STUDIO_ACTION_CANCELLED)
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => finish(STUDIO_ACTION_CANCELLED))

  return { input, phase, request, cancelSelection, importSelection }
}
