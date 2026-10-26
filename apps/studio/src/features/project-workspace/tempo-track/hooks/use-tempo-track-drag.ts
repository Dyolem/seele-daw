import {
  EDITOR_POINTER_INPUT_PHASE,
  completeGesture,
  createEditorPointerInputAdapter,
  type EditorPointerInputAdapter,
} from '@seele-daw/editor'
import type { TempoEventRecord, Tick } from '@seele-daw/project-core'
import { shallowRef, watch, type ShallowRef } from 'vue'
import { createTempoTrackDragSession } from '@/features/project-workspace/tempo-track/interaction/tempo-track-drag-session'
import { useTempoEditing } from '@/features/project-workspace/tempo-track/tempo-editing'
import type { ProjectTempoTrackScale } from '@/features/project-workspace/tempo-track/types/tempo-track'
import type {
  TempoTrackDragIntent,
  TempoTrackPointerInput,
} from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
} from '@/workbench/actions/studio-action'
import { useStudioInteractionTarget } from '@/workbench/actions/vue/studio-editor-action-context'

/** Adapts Tempo input, mapping invalidation and committed preview delivery to Vue. */
export function useTempoTrackDrag({
  layout,
  plotElement,
  tempoScale,
  hitTest,
}: {
  readonly layout: {
    readonly projectId: string
    readonly barSpanTick: Tick
    readonly timelineEndTick: Tick
  }
  readonly plotElement: ShallowRef<HTMLElement | null>
  readonly tempoScale: Readonly<ShallowRef<ProjectTempoTrackScale>>
  readonly hitTest: (event: PointerEvent, bounds: DOMRect) => TempoEventRecord | null
}) {
  const tempo = useTempoEditing()
  const projection = tempo.preview
  const toasts = useUiToastStore()
  const session = createTempoTrackDragSession()
  const state = shallowRef(session.state)
  let disposed = false
  let adapter: EditorPointerInputAdapter | null = null
  let projectedRevision = tempo.projectedRevision
  session.subscribe((next) => {
    const previous = state.value
    if (next.interactionId !== null && next.preview !== null) {
      if (!projection.publishPreview(next.interactionId, next.preview))
        throw new Error('Another Tempo preview is active.')
    } else if (previous.interactionId !== null) projection.cancelPreview(previous.interactionId)
    state.value = next
    if (next.pointerId === null && previous.pointerId !== null) adapter?.cancel()
    if (
      previous.preview?.axis == null &&
      next.preview?.axis != null &&
      next.preview.axis !== 'blocked-tick'
    )
      tempo.beginEdit()
  })

  function cancel(): void {
    try {
      session.cancel()
    } finally {
      adapter?.cancel()
    }
  }

  function reportFailure(cause: unknown, committed = false): void {
    cancel()
    const message =
      cause instanceof Error ? cause.message : 'The Tempo interaction could not complete.'
    if (committed) toasts.warning('Tempo edit was committed but could not be displayed', message)
    else toasts.danger('Tempo edit could not complete', message)
  }

  function complete(intent: TempoTrackDragIntent): void {
    completeGesture(session, intent.interactionId, {
      apply: () =>
        tempo.session === intent.target.expectedSession && !tempo.editingDisabled.value
          ? tempo.commitDrag(intent)
          : null,
      authorityRevision: () => projectedRevision ?? intent.target.baseRevision,
      onFailure: reportFailure,
    })
  }

  function onInput(input: TempoTrackPointerInput): void {
    if (disposed) return
    if (input.phase === EDITOR_POINTER_INPUT_PHASE.BEGIN) {
      const projectSession = tempo.session
      const bounds = plotElement.value?.getBoundingClientRect()
      if (
        tempo.editingDisabled.value ||
        input.hit === null ||
        projectSession === null ||
        projectedRevision === null ||
        bounds === undefined
      ) {
        adapter?.cancel()
        return
      }
      const { failure } = session.handlePointerInput(input, {
        session: projectSession,
        projectedRevision,
        mapping: {
          width: bounds.width,
          height: bounds.height,
          scale: tempoScale.value,
          timelineEndTick: layout.timelineEndTick,
        },
      })
      if (failure !== null) reportFailure(failure)
      else if (session.state.pointerId === null) adapter?.cancel()
      return
    }
    const { failure, intent } = session.handlePointerInput(input)
    if (failure !== null) reportFailure(failure)
    else if (intent !== null) complete(intent)
  }

  const stopInvalidation = watch(
    [
      () => tempo.session,
      () => layout.projectId,
      () => tempo.editingDisabled.value,
      () => layout.barSpanTick,
      () => layout.timelineEndTick,
      () => tempoScale.value.minimumBpm,
      () => tempoScale.value.maximumBpm,
    ],
    cancel,
    { flush: 'sync' },
  )
  const stopSelection = watch(
    () => tempo.selectedEventId.value,
    (id) => {
      if (state.value.preview !== null && state.value.preview.tempoEventId !== id) cancel()
    },
    { flush: 'sync' },
  )
  const stopProjection = watch(
    () => tempo.projectedRevision,
    (revision) => {
      if (disposed || revision === null) return
      projectedRevision = revision
      const committed = state.value.awaitingAuthority
      try {
        session.notifyAuthorityRevision(revision)
      } catch (cause) {
        reportFailure(cause, committed)
      }
    },
    { flush: 'post' },
  )

  useStudioInteractionTarget({
    isActive: () => state.value.pointerId !== null,
    cancel: () => {
      if (state.value.pointerId === null) return STUDIO_ACTION_NOT_APPLIED
      cancel()
      return STUDIO_ACTION_COMPLETED
    },
  })

  function dispose(): void {
    if (disposed) return
    disposed = true
    stopInvalidation()
    stopSelection()
    stopProjection()
    try {
      adapter?.dispose()
    } finally {
      adapter = null
      session.dispose()
    }
  }

  return {
    state,
    mount() {
      const plot = plotElement.value
      if (disposed || plot === null || adapter !== null) return
      adapter = createEditorPointerInputAdapter({
        surface: plot,
        resolveHit: (event) => {
          const point =
            event.target instanceof Element
              ? event.target.closest<HTMLButtonElement>('.tempo-track-lane__point')
              : null
          if (point === null) return null
          const target = hitTest(event, plot.getBoundingClientRect())
          if (target === null) return null
          point.focus({ preventScroll: true })
          tempo.select(target.id)
          event.preventDefault()
          return { tempoEventId: target.id }
        },
        onInput,
      })
    },
    dispose,
  }
}
