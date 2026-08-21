import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  type ProjectMidiImportDiagnostic,
} from '@seele-daw/project-midi'
import type {
  ProjectMidiImportResult,
  ProjectMidiTrackImportResult,
} from '@/workbench/project/midi-import/project-midi-import-coordinator'

export interface ProjectMidiImportFeedbackSink {
  success(title: string, description?: string): unknown
  warning(title: string, description?: string): unknown
}

function describeImportSummary(result: ProjectMidiImportResult): string {
  const { importedNoteCount, importedTrackCount } = result.summary
  const trackLabel = importedTrackCount === 1 ? 'track' : 'tracks'
  const noteLabel = importedNoteCount === 1 ? 'note' : 'notes'
  return `${importedTrackCount} ${trackLabel} and ${importedNoteCount} ${noteLabel} imported.`
}

function reportImportResult(
  feedback: ProjectMidiImportFeedbackSink,
  result: ProjectMidiImportResult | ProjectMidiTrackImportResult,
  titles: { readonly success: string; readonly warning: string },
  suffix = '',
  noticeCount = result.diagnostics.length,
): void {
  const summary = `${describeImportSummary(result)}${suffix}`
  if (noticeCount === 0) {
    feedback.success(titles.success, summary)
    return
  }

  const noticeLabel = noticeCount === 1 ? 'notice was' : 'notices were'
  feedback.warning(titles.warning, `${summary} ${noticeCount} import ${noticeLabel} reported.`)
}

function isExpectedCurrentProjectTimelineDiagnostic(
  diagnostic: ProjectMidiImportDiagnostic,
): boolean {
  return (
    diagnostic.code === PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TEMPO_EVENTS_NOT_IMPORTED ||
    diagnostic.code === PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE.TIME_SIGNATURE_EVENTS_NOT_IMPORTED
  )
}

/** Reports the one shared success summary used by every local MIDI import entry point. */
export function reportProjectMidiImportSuccess(
  feedback: ProjectMidiImportFeedbackSink,
  result: ProjectMidiImportResult,
): void {
  reportImportResult(feedback, result, {
    success: 'MIDI imported',
    warning: 'MIDI imported with notices',
  })
}

/** Reports the current-Project append semantics, including the preserved timeline facts. */
export function reportProjectMidiTrackImportSuccess(
  feedback: ProjectMidiImportFeedbackSink,
  result: ProjectMidiTrackImportResult,
): void {
  const noticeCount = result.diagnostics.filter(
    (diagnostic) => !isExpectedCurrentProjectTimelineDiagnostic(diagnostic),
  ).length
  reportImportResult(
    feedback,
    result,
    {
      success: 'MIDI tracks imported',
      warning: 'MIDI tracks imported with notices',
    },
    ' Current Project tempo and time signatures were kept.',
    noticeCount,
  )
}
