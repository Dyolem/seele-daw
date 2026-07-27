import { parseProjectId, parseTrackId } from '@seele-daw/project-core'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('Project Workbench Selection Store', () => {
  it('does not create a Track selection without an active Project scope', () => {
    const store = useProjectWorkbenchSelectionStore()

    store.selectTrack(parseTrackId('selection-track-without-project'))

    expect(store.selectedTrackId).toBeNull()
  })

  it('keeps valid Track selection while reconciling the same Project', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project')
    const selectedTrackId = parseTrackId('selection-track')

    store.activateProject(projectId)
    store.selectTrack(selectedTrackId)
    store.reconcileProject(
      projectId,
      Object.freeze([selectedTrackId, parseTrackId('selection-track-other')]),
    )

    expect(store.projectId).toBe(projectId)
    expect(store.selectedTrackId).toBe(selectedTrackId)
  })

  it('clears a Track identity that no longer exists in the latest Project facts', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-reconcile')

    store.activateProject(projectId)
    store.selectTrack(parseTrackId('selection-track-removed'))
    store.reconcileProject(
      projectId,
      Object.freeze([parseTrackId('selection-track-remaining')]),
    )

    expect(store.selectedTrackId).toBeNull()
  })

  it('resets Selection when the active Project identity changes', () => {
    const store = useProjectWorkbenchSelectionStore()
    const firstProjectId = parseProjectId('selection-project-first')
    const secondProjectId = parseProjectId('selection-project-second')

    store.activateProject(firstProjectId)
    store.selectTrack(parseTrackId('selection-track-first'))
    store.reconcileProject(
      secondProjectId,
      Object.freeze([parseTrackId('selection-track-second')]),
    )

    expect(store.projectId).toBe(secondProjectId)
    expect(store.selectedTrackId).toBeNull()
  })

  it('only lets the matching Project lifecycle clear the active Selection', () => {
    const store = useProjectWorkbenchSelectionStore()
    const activeProjectId = parseProjectId('selection-project-active')

    store.activateProject(activeProjectId)
    store.selectTrack(parseTrackId('selection-track-active'))
    store.leaveProject(parseProjectId('selection-project-stale'))
    expect(store.projectId).toBe(activeProjectId)

    store.leaveProject(activeProjectId)
    expect(store.projectId).toBeNull()
    expect(store.selectedTrackId).toBeNull()
  })
})
