import {
  parseTempoBpm,
  type ModelRevision,
  type ProjectCommit,
  type ProjectSession,
  type TempoBpm,
  type TempoEventId,
  type TempoEventRecord,
  type Tick,
} from '@seele-daw/project-core'
import {
  computed,
  inject,
  type InjectionKey,
  provide,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from 'vue'

import { createTempoTrackPreviewController } from '@/features/project-workspace/tempo-track/tempo-track-preview'
import type { TempoTrackDragIntent } from '@/features/project-workspace/tempo-track/types/tempo-track-drag'
import type { TempoTrackPreviewController } from '@/features/project-workspace/tempo-track/types/tempo-track-preview'
import {
  PROJECT_TEMPO_CONTROL_MODE,
  createProjectTempoControlPresentation,
  formatProjectTempoBpm,
  parseProjectTempoInput,
  type ProjectTempoControlPresentation,
} from '@/features/project-workspace/tempo/tempo-control'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  STUDIO_ACTION_COMPLETED,
  STUDIO_ACTION_NOT_APPLIED,
  type StudioActionCompletion,
} from '@/workbench/actions/studio-action'
import { staleEdit } from '@/workbench/edits/edit-session'
import {
  ACTIVE_PROJECT_PHASE,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { PROJECT_PLAYBACK_PHASE } from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import { useStudio } from '@/workbench/studio-services'

/** Tempo state and edits for one workspace; every tempo control reads and edits through it. */
export interface TempoEditing {
  /** The Project's tempo events as committed. */
  readonly events: ComputedRef<readonly TempoEventRecord[]>
  /** `events` with the tempo lane's drag preview applied. */
  readonly presentedEvents: ComputedRef<readonly TempoEventRecord[]>
  readonly preview: TempoTrackPreviewController
  readonly selectedEventId: Readonly<ShallowRef<TempoEventId | null>>
  /** Tempo cannot change while playback is loading. */
  readonly editingDisabled: ComputedRef<boolean>
  /** The transport's tempo field: the single tempo, or the tempo map's value at the playhead. */
  readonly field: ComputedRef<ProjectTempoControlPresentation>
  readonly fieldEditable: ComputedRef<boolean>
  /** The live session, while it is still the one the view shows. */
  readonly session: ProjectSession | null
  /** The revision the view shows; gestures are computed against it. */
  readonly projectedRevision: ModelRevision | null
  beginEdit(): void
  commitFieldInput(input: string): void
  select(tempoEventId: TempoEventId): void
  add(bpm: TempoBpm, tick: Tick): void
  move(tempoEventId: TempoEventId, tick: Tick): void
  commitBpmInput(tempoEventId: TempoEventId, input: string): void
  remove(tempoEventId: TempoEventId): StudioActionCompletion
  commitDrag(intent: TempoTrackDragIntent): ProjectCommit | null
}

const DEFAULT_FIELD = Object.freeze<ProjectTempoControlPresentation>({
  bpm: parseTempoBpm(120),
  displayBpm: '120',
  mode: PROJECT_TEMPO_CONTROL_MODE.SINGLE,
})
const ZERO_VISUAL_POSITION_TICK = 0 as ProjectPlaybackVisualPosition['positionTick']

function describeFailure(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim().length > 0) return cause.message
  return 'The Project tempo could not be changed.'
}

/** Creates the workspace's tempo model; call from the component that owns the ready Project. */
export function provideTempoEditing(
  readyProject: Readonly<Ref<ReadyActiveProjectState | null>>,
): TempoEditing {
  const studio = useStudio()
  const tempoEdits = studio.edits.tempo
  const { activeProject } = studio.project
  const { projectPlayback, state: playback, visualPosition } = studio.playback
  const toasts = useUiToastStore()
  const preview = createTempoTrackPreviewController()
  const selectedEventId = shallowRef<TempoEventId | null>(null)

  const snapshot = computed(() => readyProject.value?.session.getSnapshot() ?? null)
  const events = computed(
    (): readonly TempoEventRecord[] => snapshot.value?.tempoEvents ?? Object.freeze([]),
  )
  const presentedEvents = computed(() => {
    const current = preview.preview.value
    if (current === null) return events.value
    return Object.freeze(
      events.value.map((tempoEvent) =>
        tempoEvent.id === current.tempoEventId
          ? Object.freeze({ ...tempoEvent, bpm: current.bpm, tick: current.tick })
          : tempoEvent,
      ),
    )
  })
  const editingDisabled = computed(() => playback.value.phase === PROJECT_PLAYBACK_PHASE.LOADING)
  const field = computed(() => {
    const current = snapshot.value
    if (current === null) return DEFAULT_FIELD
    const position = visualPosition.value
    return createProjectTempoControlPresentation(
      current.tempoEvents,
      position.projectId === current.project.id ? position.positionTick : ZERO_VISUAL_POSITION_TICK,
    )
  })
  const fieldEditable = computed(
    () => field.value.mode === PROJECT_TEMPO_CONTROL_MODE.SINGLE && !editingDisabled.value,
  )

  function findEvent(tempoEventId: TempoEventId): TempoEventRecord | undefined {
    return events.value.find(({ id }) => id === tempoEventId)
  }

  /** A tempo edit retimes everything after it, so playback must not run across it. */
  function pausePlayback(): boolean {
    if (playback.value.phase === PROJECT_PLAYBACK_PHASE.LOADING) return false
    if (playback.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING) return true
    projectPlayback.pause()
    return playback.value.phase !== PROJECT_PLAYBACK_PHASE.PLAYING
  }

  /** Runs one tempo edit with playback paused, reporting failures under `title`. */
  function edit(title: string, run: () => void): StudioActionCompletion {
    if (!pausePlayback()) {
      toasts.danger(title, 'Playback could not be paused safely.')
      return STUDIO_ACTION_NOT_APPLIED
    }
    try {
      run()
      return STUDIO_ACTION_COMPLETED
    } catch (cause) {
      toasts.danger(title, describeFailure(cause))
      return { status: 'failed', cause, reported: true }
    }
  }

  function replaceSingleBpm(bpm: TempoBpm): void {
    const ready = readyProject.value
    if (ready === null) return
    const current = ready.session.getSnapshot().tempoEvents
    const tempoEvent = current[0]
    if (current.length !== 1 || tempoEvent === undefined) {
      toasts.info(
        'Tempo Map is read-only',
        'Use the dedicated Tempo Track to edit individual Tempo Events.',
      )
      return
    }
    if (formatProjectTempoBpm(tempoEvent.bpm) === formatProjectTempoBpm(bpm)) return
    tempoEdits.replaceBpm({ bpm, tempoEventId: tempoEvent.id })
  }

  watch(
    () => readyProject.value?.projectId ?? null,
    () => {
      selectedEventId.value = null
      preview.cancelPreview()
    },
  )
  watch(events, (current) => {
    const selected = selectedEventId.value
    if (selected !== null && !current.some(({ id }) => id === selected)) {
      selectedEventId.value = null
    }
  })

  const tempo: TempoEditing = {
    events,
    presentedEvents,
    preview,
    selectedEventId,
    editingDisabled,
    field,
    fieldEditable,
    get session() {
      // The projection can lag the service; never edit a session the view no longer shows.
      const current = activeProject.state
      return current.phase === ACTIVE_PROJECT_PHASE.READY &&
        current.session === readyProject.value?.session
        ? current.session
        : null
    },
    get projectedRevision() {
      return snapshot.value?.modelRevision ?? null
    },
    beginEdit() {
      if (playback.value.phase === PROJECT_PLAYBACK_PHASE.PLAYING) projectPlayback.pause()
    },
    commitFieldInput(input) {
      const parsed = parseProjectTempoInput(input)
      if (parsed.status === 'rejected') {
        toasts.warning('Tempo was not changed', parsed.message)
        return
      }
      if (formatProjectTempoBpm(parsed.bpm) === field.value.displayBpm) return
      edit('Tempo could not be changed', () => replaceSingleBpm(parsed.bpm))
    },
    select(tempoEventId) {
      if (findEvent(tempoEventId) !== undefined) selectedEventId.value = tempoEventId
    },
    add(bpm, tick) {
      edit('Tempo Event could not be added', () => {
        selectedEventId.value = tempoEdits.add({ bpm, tick }).tempoEventId
      })
    },
    move(tempoEventId, tick) {
      edit('Tempo Event could not be moved', () => tempoEdits.move({ tempoEventId, tick }))
    },
    commitBpmInput(tempoEventId, input) {
      const parsed = parseProjectTempoInput(input)
      if (parsed.status === 'rejected') {
        toasts.warning('Tempo Event was not changed', parsed.message)
        return
      }
      const tempoEvent = findEvent(tempoEventId)
      if (
        tempoEvent === undefined ||
        formatProjectTempoBpm(tempoEvent.bpm) === formatProjectTempoBpm(parsed.bpm)
      )
        return
      edit('Tempo Event BPM could not be changed', () =>
        tempoEdits.replaceBpm({ bpm: parsed.bpm, tempoEventId }),
      )
    },
    remove(tempoEventId) {
      return edit('Tempo Event could not be removed', () => {
        tempoEdits.remove(tempoEventId)
        if (selectedEventId.value === tempoEventId) selectedEventId.value = null
      })
    },
    commitDrag(intent) {
      if (readyProject.value?.session !== intent.target.expectedSession) throw staleEdit()
      if (!pausePlayback()) throw new Error('Playback could not be paused safely.')
      // The edit validates the captured session again after playback preparation.
      return intent.axis === 'tick'
        ? tempoEdits.move({
            target: intent.target,
            tempoEventId: intent.tempoEventId,
            tick: intent.tick,
          })
        : tempoEdits.replaceBpm({
            target: intent.target,
            tempoEventId: intent.tempoEventId,
            bpm: intent.bpm,
          })
    },
  }
  provide(TEMPO_EDITING_KEY, tempo)
  return tempo
}

export const TEMPO_EDITING_KEY: InjectionKey<TempoEditing> = Symbol('seele/studio/TempoEditing')

export function useTempoEditing(): TempoEditing {
  const tempo = inject(TEMPO_EDITING_KEY, null)
  if (tempo === null) throw new Error('Tempo editing has not been provided')
  return tempo
}
