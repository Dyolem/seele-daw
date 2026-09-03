import { PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE } from '@seele-daw/project-midi'
import { parseProjectId } from '@seele-daw/project-core'
import type { ProjectMidiImportDiagnosticCode } from '@seele-daw/project-midi'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectMidiTrackImportResult } from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  reportProjectMidiTrackImportSuccess,
  type ProjectMidiImportFeedbackSink,
} from '@/workbench/project/midi-import/project-midi-import-feedback'

function createResult(
  diagnosticCodes: readonly ProjectMidiImportDiagnosticCode[],
): ProjectMidiTrackImportResult {
  return Object.freeze({
    diagnostics: Object.freeze(
      diagnosticCodes.map((code) =>
        Object.freeze({
          code,
          message: code,
        }),
      ),
    ),
    importedTrackIds: Object.freeze([]),
    projectId: parseProjectId('project-feedback'),
    summary: Object.freeze({
      importedNoteCount: 8,
      importedTrackCount: 1,
      sourceFormat: 1 as const,
      sourcePpq: 480,
      sourceTrackCount: 1,
    }),
  })
}

function createFeedback() {
  return {
    success: vi.fn<ProjectMidiImportFeedbackSink['success']>(),
    warning: vi.fn<ProjectMidiImportFeedbackSink['warning']>(),
  } satisfies ProjectMidiImportFeedbackSink
}

describe('Project MIDI Track import feedback', () => {
  it('treats retained destination timeline diagnostics as expected success semantics', () => {
    const feedback = createFeedback()

    reportProjectMidiTrackImportSuccess(
      feedback,
      createResult([
        PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_NOT_IMPORTED,
        PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_NOT_IMPORTED,
      ]),
    )

    expect(feedback.success).toHaveBeenCalledWith(
      'MIDI tracks imported',
      '1 track and 8 notes imported. Current Project tempo and time signatures were kept.',
    )
    expect(feedback.warning).not.toHaveBeenCalled()
  })

  it('continues to report unrelated unsupported source facts as notices', () => {
    const feedback = createFeedback()

    reportProjectMidiTrackImportSuccess(
      feedback,
      createResult([
        PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_NOT_IMPORTED,
        PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.PROGRAM_UNAVAILABLE,
      ]),
    )

    expect(feedback.warning).toHaveBeenCalledWith(
      'MIDI tracks imported with notices',
      '1 track and 8 notes imported. Current Project tempo and time signatures were kept. 1 import notice was reported.',
    )
    expect(feedback.success).not.toHaveBeenCalled()
  })
})
