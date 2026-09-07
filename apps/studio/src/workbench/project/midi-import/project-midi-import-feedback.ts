import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  PROJECT_MIDI_SEMANTIC_BINDING_REASON,
  PROJECT_MIDI_SEMANTIC_BINDING_STATUS,
  type ProjectMidiSemanticBinding,
  type ProjectMidiSemanticMode,
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

const MIDI_SEMANTIC_MODE_LABELS = Object.freeze({
  'general-midi-1': 'General MIDI 1',
  'general-midi-2': 'General MIDI 2',
  'roland-gs': 'Roland GS',
  'yamaha-xg': 'Yamaha XG',
} as const satisfies Readonly<Record<ProjectMidiSemanticMode, string>>)

interface MidiSemanticBindingFeedback {
  readonly noticeCount: number
  readonly suffix: string
}

function describeMidiSemanticBinding(
  binding: ProjectMidiSemanticBinding,
): MidiSemanticBindingFeedback {
  switch (binding.status) {
    case PROJECT_MIDI_SEMANTIC_BINDING_STATUS.BOUND:
      return {
        noticeCount: 0,
        suffix: ` Source declares ${MIDI_SEMANTIC_MODE_LABELS[binding.mode]}; detection did not change Instrument routing.`,
      }
    case PROJECT_MIDI_SEMANTIC_BINDING_STATUS.CONFLICTED:
      return {
        noticeCount: 1,
        suffix:
          ' Source contains incompatible MIDI mode declarations; Instrument routing was left unchanged.',
      }
    case PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNBOUND:
      return binding.reason === PROJECT_MIDI_SEMANTIC_BINDING_REASON.GENERAL_MIDI_SYSTEM_OFF
        ? {
            noticeCount: 1,
            suffix:
              ' Source explicitly turns General MIDI off; Instrument routing was left unchanged.',
          }
        : { noticeCount: 0, suffix: '' }
    case PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNRESOLVED:
      switch (binding.reason) {
        case PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATIONS_NOT_INSPECTED:
          return {
            noticeCount: 1,
            suffix:
              ' MIDI mode declarations were not inspected; Instrument routing was left unchanged.',
          }
        case PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATION_INSPECTION_FAILED:
          return {
            noticeCount: 1,
            suffix: ' MIDI mode inspection failed; Instrument routing was left unchanged.',
          }
        case PROJECT_MIDI_SEMANTIC_BINDING_REASON.UNCLASSIFIED_SYSTEM_EXCLUSIVE_MESSAGES: {
          const messageLabel =
            binding.unclassifiedSystemExclusiveMessageCount === 1 ? 'message' : 'messages'
          return {
            noticeCount: 1,
            suffix: ` MIDI mode remains unresolved because the source contains ${binding.unclassifiedSystemExclusiveMessageCount} unclassified SysEx ${messageLabel}; Instrument routing was left unchanged.`,
          }
        }
      }
  }
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
  const semanticBindingFeedback = describeMidiSemanticBinding(result.summary.semanticBinding)
  const summary = `${describeImportSummary(result)}${suffix}${semanticBindingFeedback.suffix}`
  const totalNoticeCount = noticeCount + semanticBindingFeedback.noticeCount
  if (totalNoticeCount === 0) {
    feedback.success(titles.success, summary)
    return
  }

  const noticeLabel = totalNoticeCount === 1 ? 'notice was' : 'notices were'
  feedback.warning(titles.warning, `${summary} ${totalNoticeCount} import ${noticeLabel} reported.`)
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
