import { createApp } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectMidiImportCoordinator } from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  PROJECT_MIDI_IMPORT_CONTEXT_KEY,
  useProjectMidiImport,
  type ProjectMidiImportVueContext,
} from '@/workbench/project/midi-import/vue/project-midi-import-context'
import { ProjectMidiImportVueError } from '@/workbench/project/midi-import/vue/project-midi-import-vue-error'

describe('ProjectMidiImportVueContext', () => {
  it('provides one scoped Coordinator and reports a missing Provider explicitly', () => {
    const context = Object.freeze<ProjectMidiImportVueContext>({
      projectMidiImport: Object.freeze({
        importLocalFile: vi.fn<ProjectMidiImportCoordinator['importLocalFile']>(),
      }),
    })
    const providedApp = createApp({ render: () => null })
    providedApp.provide(PROJECT_MIDI_IMPORT_CONTEXT_KEY, context)
    const missingApp = createApp({ render: () => null })

    expect(providedApp.runWithContext(() => useProjectMidiImport())).toBe(context)
    expect(() => missingApp.runWithContext(() => useProjectMidiImport())).toThrowError(
      expect.objectContaining({
        name: 'ProjectMidiImportVueError',
        code: 'missing-context',
      }),
    )
    expect(() => missingApp.runWithContext(() => useProjectMidiImport())).toThrow(
      ProjectMidiImportVueError,
    )
  })
})
