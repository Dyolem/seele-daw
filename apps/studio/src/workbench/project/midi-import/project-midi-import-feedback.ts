import type { ProjectMidiImportResult } from '@/workbench/project/midi-import/project-midi-import-coordinator'

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

/** Reports the one shared success summary used by every local MIDI import entry point. */
export function reportProjectMidiImportSuccess(
  feedback: ProjectMidiImportFeedbackSink,
  result: ProjectMidiImportResult,
): void {
  const summary = describeImportSummary(result)
  const noticeCount = result.diagnostics.length
  if (noticeCount === 0) {
    feedback.success('MIDI imported', summary)
    return
  }

  const noticeLabel = noticeCount === 1 ? 'notice was' : 'notices were'
  feedback.warning(
    'MIDI imported with notices',
    `${summary} ${noticeCount} import ${noticeLabel} reported.`,
  )
}
