import {
  parseProjectColor,
  parseProjectId,
  parseTrackId,
  type ProjectCommit,
  type TrackId,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import ProjectWorkbenchShell from '@/features/project-workspace/ProjectWorkbenchShell.vue'
import ProjectWorkbenchArrangement from '@/features/project-workspace/workbench-shell/ProjectWorkbenchArrangement.vue'
import ProjectWorkbenchContextEditorDock from '@/features/project-workspace/workbench-shell/ProjectWorkbenchContextEditorDock.vue'
import ProjectWorkbenchGlobalBar from '@/features/project-workspace/workbench-shell/ProjectWorkbenchGlobalBar.vue'
import ProjectWorkbenchTransport from '@/features/project-workspace/workbench-shell/ProjectWorkbenchTransport.vue'
import ProjectWorkbenchWorkspace from '@/features/project-workspace/workbench-shell/ProjectWorkbenchWorkspace.vue'
import { useProjectWorkbenchSelectionStore } from '@/features/project-workspace/project-workbench-selection-store'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import {
  ACTIVE_PROJECT_SAVE_STATUS,
  type ActiveProjectSaveStatus,
} from '@/workbench/project/active-project-state'
import type { ProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'
import {
  PROJECT_TRACK_CONTEXT_KEY,
  type ProjectTrackVueContext,
} from '@/workbench/project/track/vue/project-track-context'

interface MountShellOptions {
  readonly isDirty?: boolean
  readonly saveFailureMessage?: string | null
  readonly saveStatus?: ActiveProjectSaveStatus
  readonly selectedTrackId?: TrackId | null
  readonly tracks?: readonly ProjectTrackPresentation[]
}

function mountShell(options: MountShellOptions = {}) {
  const pinia = createPinia()
  const selection = useProjectWorkbenchSelectionStore(pinia)
  selection.activateProject(parseProjectId('workbench-shell-project'))
  if (options.selectedTrackId) selection.selectTrack(options.selectedTrackId)
  const projectTracks: ProjectTrackCoordinator = Object.freeze({
    addInstrumentTrack: vi.fn<ProjectTrackCoordinator['addInstrumentTrack']>(
      () =>
        Object.freeze({
          commit: Object.freeze({}) as ProjectCommit,
          trackId: parseTrackId('shell-created-track'),
        }),
    ),
  })
  const projectTrackContext: ProjectTrackVueContext = Object.freeze({ projectTracks })

  return mount(ProjectWorkbenchShell, {
    props: {
      canRedo: false,
      canUndo: true,
      isDirty: options.isDirty ?? false,
      projectId: 'workbench-shell-project',
      projectName: 'Midnight Study',
      saveFailureMessage: options.saveFailureMessage,
      saveStatus: options.saveStatus ?? ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      tempo: 120,
      timeSignatureDenominator: 4,
      timeSignatureNumerator: 4,
      tracks: options.tracks ?? Object.freeze([]),
    },
    global: {
      plugins: [pinia],
      provide: {
        [PROJECT_TRACK_CONTEXT_KEY as symbol]: projectTrackContext,
      },
    },
  })
}

describe('ProjectWorkbenchShell', () => {
  it('composes the Workbench modules through explicit component boundaries', () => {
    const wrapper = mountShell()
    const workspace = wrapper.getComponent(ProjectWorkbenchWorkspace)

    expect(wrapper.findComponent(ProjectWorkbenchGlobalBar).exists()).toBe(true)
    expect(wrapper.findComponent(ProjectWorkbenchTransport).exists()).toBe(true)
    expect(workspace.findComponent(ProjectWorkbenchArrangement).exists()).toBe(true)
    expect(workspace.findComponent(ProjectWorkbenchContextEditorDock).exists()).toBe(true)
  })

  it('renders authentic Project chrome and keeps unavailable product controls disabled', () => {
    const wrapper = mountShell()

    expect(wrapper.get('.project-workbench__project-identity').text()).toContain('Midnight Study')
    expect(wrapper.get('.project-workbench__save-status').text()).toBe('Saved')
    expect(wrapper.get('.project-workbench__save').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="Undo"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('button[aria-label="Redo"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label^="Play —"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.get('.project-workbench__track-actions button').attributes('disabled'),
    ).toBeUndefined()
  })

  it('emits history intents only from enabled controls', async () => {
    const wrapper = mountShell()

    await wrapper.get('button[aria-label="Undo"]').trigger('click')
    await wrapper.get('button[aria-label="Redo"]').trigger('click')

    expect(wrapper.emitted('undo')).toHaveLength(1)
    expect(wrapper.emitted('redo')).toBeUndefined()
  })

  it('renders the Project menu through its portal with the styled overlay classes', async () => {
    const wrapper = mountShell()

    await wrapper.get('button[aria-label="Open project menu"]').trigger('click')
    await nextTick()

    const menu = document.body.querySelector('.project-workbench__menu')
    expect(menu).not.toBeNull()
    expect(menu?.querySelectorAll('.project-workbench__menu-item')).toHaveLength(3)
    expect(menu?.querySelectorAll('.project-workbench__menu-separator')).toHaveLength(1)

    wrapper.unmount()
  })

  it('exposes dirty and failed Save states and emits the real Save intent', async () => {
    const wrapper = mountShell({
      isDirty: true,
      saveFailureMessage: 'Checkpoint write failed',
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.FAILED,
    })

    expect(wrapper.get('.project-workbench__save-status').text()).toBe('Couldn’t save')
    expect(wrapper.get('.project-workbench__save-status').attributes('title')).toBe(
      'Checkpoint write failed',
    )
    expect(wrapper.get('.project-workbench__save').text()).toContain('Retry save')

    await wrapper.get('.project-workbench__save').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('moves the Context Editor through minimized, fullscreen, closed and restored modes', async () => {
    const wrapper = mountShell()
    const workspace = wrapper.get('.project-workbench__workspace')

    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Minimize MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('minimized')

    await wrapper.get('button[aria-label="Restore MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Maximize MIDI editor"]').trigger('click')
    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe('460')

    await wrapper.get('button[aria-label="Restore MIDI editor height"]').trigger('click')
    expect(wrapper.get('[role="separator"]').attributes('aria-valuenow')).toBe('304')

    await wrapper
      .get('button[aria-label="Open MIDI editor in workspace fullscreen"]')
      .trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('fullscreen')
    expect(wrapper.find('.project-workbench__arrangement-layout').exists()).toBe(false)

    await wrapper.get('button[aria-label="Exit workspace fullscreen"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')

    await wrapper.get('button[aria-label="Close MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('closed')
    expect(wrapper.find('.project-workbench__dock').exists()).toBe(false)
    expect(wrapper.get('button[aria-label="Open MIDI editor"]').attributes('aria-pressed')).toBe(
      'false',
    )

    await wrapper.get('button[aria-label="Open MIDI editor"]').trigger('click')
    expect(workspace.attributes('data-dock-mode')).toBe('docked')
    expect(wrapper.get('button[aria-label="Open MIDI editor"]').attributes('aria-pressed')).toBe(
      'true',
    )
  })

  it('supports keyboard resizing through the semantic Splitter', async () => {
    const wrapper = mountShell()
    const splitter = wrapper.get('[role="separator"]')

    expect(splitter.attributes('aria-valuenow')).toBe('304')

    await splitter.trigger('keydown', { key: 'ArrowUp' })

    expect(splitter.attributes('aria-valuenow')).toBe('320')
    expect(splitter.attributes('aria-orientation')).toBe('horizontal')
  })

  it('projects the selected Track into the Context Editor Dock', () => {
    const selectedTrackId = parseTrackId('shell-selected-track')
    const wrapper = mountShell({
      selectedTrackId,
      tracks: Object.freeze([
        Object.freeze({
          color: parseProjectColor('#8B5CF6'),
          id: selectedTrackId,
          kind: 'instrument',
          name: 'Instrument 1',
        }),
      ]),
    })

    expect(wrapper.get('.project-workbench__inspector').text()).toContain('Instrument 1')
    expect(wrapper.get('.project-workbench__dock-heading').text()).toContain('Instrument 1')
    expect(wrapper.get('.project-workbench__context-host').text()).toContain(
      'No MIDI clip selected',
    )
  })
})
