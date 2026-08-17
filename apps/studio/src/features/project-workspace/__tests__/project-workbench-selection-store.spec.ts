import { parseClipId, parseProjectId, parseTrackId } from '@seele-daw/project-core'
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
    store.selectClip(
      parseTrackId('selection-track-without-project'),
      parseClipId('selection-clip-without-project'),
    )

    expect(store.selectedTrackId).toBeNull()
    expect(store.selectedClipId).toBeNull()
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
    expect(store.selectedClipId).toBeNull()
  })

  it('selects a Clip together with its owning Track', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-clip')
    const trackId = parseTrackId('selection-track-clip')
    const clipId = parseClipId('selection-clip')

    store.activateProject(projectId)
    store.selectClip(trackId, clipId)

    expect(store.selectedTrackId).toBe(trackId)
    expect(store.selectedClipId).toBe(clipId)
  })

  it('leaves Clip Selection when a Track is selected directly', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-track-after-clip')
    const clipTrackId = parseTrackId('selection-track-for-clip')
    const nextTrackId = parseTrackId('selection-track-direct')

    store.activateProject(projectId)
    store.selectClip(clipTrackId, parseClipId('selection-clip-before-track'))
    store.selectTrack(nextTrackId)

    expect(store.selectedTrackId).toBe(nextTrackId)
    expect(store.selectedClipId).toBeNull()
  })

  it('clears a removed Clip while retaining its available Track', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-clip-removed')
    const trackId = parseTrackId('selection-track-clip-remaining')

    store.activateProject(projectId)
    store.selectClip(trackId, parseClipId('selection-clip-removed'))
    store.reconcileProject(projectId, Object.freeze([trackId]), Object.freeze([]))

    expect(store.selectedTrackId).toBe(trackId)
    expect(store.selectedClipId).toBeNull()
  })

  it('reconciles the selected Track to the Clip current owner', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-clip-owner')
    const previousTrackId = parseTrackId('selection-track-owner-previous')
    const currentTrackId = parseTrackId('selection-track-owner-current')
    const clipId = parseClipId('selection-clip-owner')

    store.activateProject(projectId)
    store.selectClip(previousTrackId, clipId)
    store.reconcileProject(
      projectId,
      Object.freeze([previousTrackId, currentTrackId]),
      Object.freeze([Object.freeze({ clipId, trackId: currentTrackId })]),
    )

    expect(store.selectedTrackId).toBe(currentTrackId)
    expect(store.selectedClipId).toBe(clipId)
  })

  it('clears a Track identity that no longer exists in the latest Project facts', () => {
    const store = useProjectWorkbenchSelectionStore()
    const projectId = parseProjectId('selection-project-reconcile')

    store.activateProject(projectId)
    store.selectTrack(parseTrackId('selection-track-removed'))
    store.reconcileProject(projectId, Object.freeze([parseTrackId('selection-track-remaining')]))

    expect(store.selectedTrackId).toBeNull()
    expect(store.selectedClipId).toBeNull()
  })

  it('resets Selection when the active Project identity changes', () => {
    const store = useProjectWorkbenchSelectionStore()
    const firstProjectId = parseProjectId('selection-project-first')
    const secondProjectId = parseProjectId('selection-project-second')

    store.activateProject(firstProjectId)
    store.selectTrack(parseTrackId('selection-track-first'))
    store.reconcileProject(secondProjectId, Object.freeze([parseTrackId('selection-track-second')]))

    expect(store.projectId).toBe(secondProjectId)
    expect(store.selectedTrackId).toBeNull()
    expect(store.selectedClipId).toBeNull()
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
    expect(store.selectedClipId).toBeNull()
  })
})
