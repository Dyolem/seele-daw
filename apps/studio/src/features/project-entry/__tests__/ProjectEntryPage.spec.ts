import { createStandardMidiFileSourceEnvelope } from '@seele-daw/midi-file'
import { parseProjectId } from '@seele-daw/project-core'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'

import ProjectEntryPage from '@/features/project-entry/ProjectEntryPage.vue'
import { PROJECT_ROUTE_NAME, PROJECT_ROUTE_QUERY } from '@/router/project-routes'
import { useUiToastStore } from '@/ui/stores/ui-toast-store'
import {
  PROJECT_ENTRY_FAILURE_OPERATION,
  PROJECT_ENTRY_RESOLUTION_KIND,
  PROJECT_ENTRY_SELECTION_REASON,
  type ProjectEntryCoordinator,
  type ProjectEntryResolution,
} from '@/workbench/project/entry/project-entry-coordinator'
import {
  PROJECT_ENTRY_CONTEXT_KEY,
  type ProjectEntryVueContext,
} from '@/workbench/project/entry/vue/project-entry-context'
import type {
  ProjectMidiImportCoordinator,
  ProjectMidiImportResult,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  PROJECT_MIDI_IMPORT_CONTEXT_KEY,
  type ProjectMidiImportVueContext,
} from '@/workbench/project/midi-import/vue/project-midi-import-context'
import type { RecentProjectSummary } from '@/workbench/project/project-catalog-reader'

interface PageFixture {
  readonly importLocalFile: ReturnType<
    typeof vi.fn<ProjectMidiImportCoordinator['importLocalFile']>
  >
  readonly projectEntryContext: ProjectEntryVueContext
  readonly projectMidiImportContext: ProjectMidiImportVueContext
  readonly resolve: ReturnType<typeof vi.fn<ProjectEntryCoordinator['resolve']>>
}

function createImportResult(
  overrides: Partial<ProjectMidiImportResult> = {},
): ProjectMidiImportResult {
  return Object.freeze({
    projectId: parseProjectId('project-entry-imported-midi'),
    diagnostics: Object.freeze([]),
    summary: Object.freeze({
      sourceFormat: 1,
      sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
      sourcePpq: 480,
      sourceTrackCount: 2,
      importedTrackCount: 2,
      importedNoteCount: 24,
    }),
    ...overrides,
  })
}

function createProject(suffix: string, lastCheckpointSavedAt: number): RecentProjectSummary {
  return Object.freeze({
    projectId: parseProjectId(`project-entry-page-${suffix}`),
    name: `Project ${suffix}`,
    lastCheckpointSavedAt,
  })
}

function createSelection(projects: readonly RecentProjectSummary[]): ProjectEntryResolution {
  return Object.freeze({
    kind: PROJECT_ENTRY_RESOLUTION_KIND.SELECTION_REQUIRED,
    reason: PROJECT_ENTRY_SELECTION_REASON.NO_REQUESTED_PROJECT,
    requestedProjectId: null,
    recentProjects: Object.freeze([...projects]),
  })
}

function createFixture(
  initialResolution: ProjectEntryResolution = createSelection([]),
): PageFixture {
  const resolve = vi.fn<ProjectEntryCoordinator['resolve']>(async () => initialResolution)
  const importLocalFile = vi.fn<ProjectMidiImportCoordinator['importLocalFile']>(async () =>
    createImportResult(),
  )

  return {
    importLocalFile,
    projectEntryContext: Object.freeze({
      projectEntry: Object.freeze({ resolve }),
    }),
    projectMidiImportContext: Object.freeze({
      projectMidiImport: Object.freeze({
        importLocalFile,
        importLocalFileAsNewTracks:
          vi.fn<ProjectMidiImportCoordinator['importLocalFileAsNewTracks']>(),
        importLocalFileReplacingActiveProject:
          vi.fn<ProjectMidiImportCoordinator['importLocalFileReplacingActiveProject']>(),
      }),
    }),
    resolve,
  }
}

async function createPageRouter(initialLocation = '/'): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: PROJECT_ROUTE_NAME.ENTRY,
        component: { render: () => null },
      },
      {
        path: '/projects/new',
        name: PROJECT_ROUTE_NAME.CREATE,
        component: { render: () => null },
      },
      {
        path: '/projects/:projectId',
        name: PROJECT_ROUTE_NAME.WORKSPACE,
        component: { render: () => null },
      },
    ],
  })
  await router.push(initialLocation)
  await router.isReady()
  return router
}

async function mountPage(fixture: PageFixture, initialLocation = '/') {
  const router = await createPageRouter(initialLocation)
  const pinia = createPinia()
  const wrapper = mount(ProjectEntryPage, {
    global: {
      plugins: [pinia, router],
      provide: {
        [PROJECT_ENTRY_CONTEXT_KEY as symbol]: fixture.projectEntryContext,
        [PROJECT_MIDI_IMPORT_CONTEXT_KEY as symbol]: fixture.projectMidiImportContext,
      },
    },
  })

  return { pinia, router, wrapper }
}

async function selectMidiFile(
  wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'],
  file: File,
): Promise<void> {
  const input = wrapper.get<HTMLInputElement>('.project-entry__file-input')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: {
      item: (index: number) => (index === 0 ? file : null),
      length: 1,
    },
  })
  await input.trigger('change')
}

describe('ProjectEntryPage', () => {
  it('shows the Create-only empty state after loading the local Catalog', async () => {
    const fixture = createFixture()
    const { wrapper } = await mountPage(fixture)

    await flushPromises()

    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
    expect(wrapper.get('h1').text()).toBe('Create something worth hearing.')
    expect(wrapper.text()).toContain('No projects yet')
    expect(wrapper.get('.project-entry__create').text()).toContain('Create new project')
    expect(wrapper.get('.project-entry__create').classes()).toContain('ui-button--primary')
  })

  it('navigates the primary action to the guarded Create Route', async () => {
    const fixture = createFixture()
    const { router, wrapper } = await mountPage(fixture)
    await flushPromises()

    await wrapper.get('.project-entry__create').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.CREATE)
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('imports one selected MIDI file, opens its clean Project, and summarizes diagnostics', async () => {
    const fixture = createFixture()
    fixture.importLocalFile.mockResolvedValueOnce(
      createImportResult({
        diagnostics: Object.freeze([
          Object.freeze({
            code: 'program-unavailable',
            message: 'The source program was imported as a silent placeholder.',
            sourceTrackIndex: 0,
            sourceProgramNumber: 40,
          }),
        ]),
      }),
    )
    const { pinia, router, wrapper } = await mountPage(fixture)
    await flushPromises()
    const input = wrapper.get<HTMLInputElement>('.project-entry__file-input')
    const clickFileInput = vi.spyOn(input.element, 'click').mockImplementation(() => undefined)

    expect(input.attributes('accept')).toBe('.mid,.midi,audio/midi,audio/x-midi')
    await wrapper.get('.project-entry__import').trigger('click')
    expect(clickFileInput).toHaveBeenCalledOnce()
    clickFileInput.mockRestore()

    const file = new File([new Uint8Array([0x4d, 0x54, 0x68, 0x64])], 'song.mid', {
      type: 'audio/midi',
    })
    await selectMidiFile(wrapper, file)
    await flushPromises()

    expect(fixture.importLocalFile).toHaveBeenCalledExactlyOnceWith(file)
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe('project-entry-imported-midi')
    expect(useUiToastStore(pinia).message).toMatchObject({
      tone: 'warning',
      title: 'MIDI imported with notices',
      description: '2 tracks and 24 notes imported. 1 import notice was reported.',
    })
  })

  it('keeps a blocking MIDI import failure on Project Entry without creating a success notice', async () => {
    const fixture = createFixture()
    fixture.importLocalFile.mockRejectedValueOnce(new Error('SMF Type 2 is not supported.'))
    const { pinia, router, wrapper } = await mountPage(fixture)
    await flushPromises()

    await selectMidiFile(wrapper, new File([], 'unsupported.mid', { type: 'audio/midi' }))
    await flushPromises()

    expect(wrapper.get('.project-entry__error > span').text()).toBe('SMF Type 2 is not supported.')
    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.ENTRY)
    expect(wrapper.get('.project-entry__import').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.project-entry__retry').exists()).toBe(false)
    expect(useUiToastStore(pinia).message).toBeNull()
  })

  it('renders recent Projects and navigates to the selected Project Route', async () => {
    const recentProject = createProject('Recent', Date.UTC(2026, 6, 22, 4, 30))
    const fixture = createFixture(createSelection([recentProject]))
    const { router, wrapper } = await mountPage(fixture)
    await flushPromises()

    expect(wrapper.text()).toContain('Project Recent')
    expect(wrapper.text()).toContain('Saved')
    expect(wrapper.get('.project-entry__count').text()).toBe('1')

    await wrapper.get('.project-entry__project').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe(PROJECT_ROUTE_NAME.WORKSPACE)
    expect(router.currentRoute.value.params.projectId).toBe(recentProject.projectId)
    expect(fixture.resolve).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('explains and hides a Project that a requested Route could not find', async () => {
    const missingProject = createProject('Missing', 100)
    const availableProject = createProject('Available', 90)
    const fixture = createFixture(createSelection([missingProject, availableProject]))
    const { wrapper } = await mountPage(
      fixture,
      `/?${PROJECT_ROUTE_QUERY.UNAVAILABLE_PROJECT_ID}=${missingProject.projectId}`,
    )
    await flushPromises()

    expect(wrapper.get('.project-entry__error > span').text()).toBe(
      'That project is no longer available.',
    )
    expect(wrapper.text()).toContain('Project Available')
    expect(wrapper.text()).not.toContain('Project Missing')
  })

  it('surfaces Catalog failures and can retry the initial selection', async () => {
    const fixture = createFixture()
    fixture.resolve.mockResolvedValueOnce(
      Object.freeze({
        kind: PROJECT_ENTRY_RESOLUTION_KIND.FAILED,
        operation: PROJECT_ENTRY_FAILURE_OPERATION.LIST_RECENT_PROJECTS,
        requestedProjectId: null,
        failureCause: new Error('Local project catalog is unavailable'),
      }),
    )
    const { wrapper } = await mountPage(fixture)
    await flushPromises()

    expect(wrapper.get('.project-entry__error > span').text()).toBe(
      'Local project catalog is unavailable',
    )

    await wrapper.get('.project-entry__retry').trigger('click')
    await flushPromises()

    expect(fixture.resolve).toHaveBeenNthCalledWith(2, null)
    expect(wrapper.text()).toContain('No projects yet')
  })
})
