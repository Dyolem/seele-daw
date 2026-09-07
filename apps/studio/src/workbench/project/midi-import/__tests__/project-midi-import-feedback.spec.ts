import {
  createStandardMidiFileSourceEnvelope,
  createStandardMidiFileSourceEnvelopeWithEvidence,
  type MidiSourceEnvelope,
  type MidiSourceModeDeclaration,
  type MidiSourceModeDeclarationKind,
} from '@seele-daw/midi-file'
import {
  PROJECT_MIDI_IMPORT_DIAGNOSTIC_CODE,
  type ProjectMidiImportDiagnosticCode,
  type ProjectMidiSemanticBinding,
} from '@seele-daw/project-midi'
import { parseProjectId } from '@seele-daw/project-core'
import { describe, expect, it, vi } from 'vitest'

import type { ProjectMidiTrackImportResult } from '@/workbench/project/midi-import/project-midi-import-coordinator'
import {
  reportProjectMidiImportSuccess,
  reportProjectMidiTrackImportSuccess,
  type ProjectMidiImportFeedbackSink,
} from '@/workbench/project/midi-import/project-midi-import-feedback'
import {
  NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
  NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
} from '@/workbench/project/midi-import/__tests__/support/project-midi-import-test-support'

function createResult(
  diagnosticCodes: readonly ProjectMidiImportDiagnosticCode[],
  semanticBinding: ProjectMidiSemanticBinding = NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING,
  sourceEnvelope: MidiSourceEnvelope = NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE,
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
      sourceEnvelope,
      semanticBinding,
      sourcePpq: 480,
      sourceTrackCount: 1,
    }),
  })
}

function createInspectedSourceEnvelope(
  declarations: readonly MidiSourceModeDeclaration[],
  unclassifiedSystemExclusiveMessageCount = 0,
): MidiSourceEnvelope {
  return createStandardMidiFileSourceEnvelopeWithEvidence(1, {
    declarations,
    inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
    status: 'inspected',
    unclassifiedSystemExclusiveMessageCount,
  })
}

function createModeDeclaration(
  kind: MidiSourceModeDeclarationKind,
  overrides: Partial<MidiSourceModeDeclaration> = {},
): MidiSourceModeDeclaration {
  let deviceId = 0x7f
  if (kind === 'roland-gs-reset') deviceId = 0x10
  if (kind === 'yamaha-xg-system-on') deviceId = 0
  return {
    deviceId,
    kind,
    scope: 'file',
    sourceEventIndex: 0,
    sourceTrackIndex: 0,
    tick: 0,
    ...overrides,
  }
}

function createFeedback() {
  return {
    success: vi.fn<ProjectMidiImportFeedbackSink['success']>(),
    warning: vi.fn<ProjectMidiImportFeedbackSink['warning']>(),
  } satisfies ProjectMidiImportFeedbackSink
}

describe('Project MIDI import feedback', () => {
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

  it('reports a bound source mode without implying that Instrument routing changed', () => {
    const feedback = createFeedback()

    reportProjectMidiImportSuccess(
      feedback,
      createResult(
        [],
        {
          mode: 'yamaha-xg',
          policy: 'smf-midi-1-mode-binding-v1',
          schemaVersion: 1,
          scope: 'file',
          sourceDeclarationIndexes: Object.freeze([0]),
          status: 'bound',
        },
        createInspectedSourceEnvelope([createModeDeclaration('yamaha-xg-system-on')]),
      ),
    )

    expect(feedback.success).toHaveBeenCalledWith(
      'MIDI imported',
      '1 track and 8 notes imported. Source declares Yamaha XG; detection did not change Instrument routing.',
    )
    expect(feedback.warning).not.toHaveBeenCalled()
  })

  it.each([
    {
      binding: {
        candidateModes: ['general-midi-1', 'roland-gs'],
        hasGeneralMidiSystemOff: false,
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'incompatible-mode-declarations',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [0, 1],
        status: 'conflicted',
      },
      description:
        'Source contains incompatible MIDI mode declarations; Instrument routing was left unchanged.',
      sourceEnvelope: createInspectedSourceEnvelope([
        createModeDeclaration('general-midi-1-system-on'),
        createModeDeclaration('roland-gs-reset', { sourceEventIndex: 1 }),
      ]),
    },
    {
      binding: {
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'mode-declarations-not-inspected',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [],
        status: 'unresolved',
      },
      description:
        'MIDI mode declarations were not inspected; Instrument routing was left unchanged.',
      sourceEnvelope: createStandardMidiFileSourceEnvelope(1),
    },
    {
      binding: {
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'general-midi-system-off',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [0],
        status: 'unbound',
      },
      description:
        'Source explicitly turns General MIDI off; Instrument routing was left unchanged.',
      sourceEnvelope: createInspectedSourceEnvelope([
        createModeDeclaration('general-midi-system-off'),
      ]),
    },
    {
      binding: {
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'mode-declaration-inspection-failed',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [],
        status: 'unresolved',
      },
      description: 'MIDI mode inspection failed; Instrument routing was left unchanged.',
      sourceEnvelope: createStandardMidiFileSourceEnvelopeWithEvidence(1, {
        reason: 'profile-declaration-inspection-failed',
        status: 'unresolved',
      }),
    },
    {
      binding: {
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'unclassified-system-exclusive-messages',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [0],
        status: 'unresolved',
        unclassifiedSystemExclusiveMessageCount: 2,
      },
      description:
        'MIDI mode remains unresolved because the source contains 2 unclassified SysEx messages; Instrument routing was left unchanged.',
      sourceEnvelope: createInspectedSourceEnvelope(
        [createModeDeclaration('general-midi-1-system-on')],
        2,
      ),
    },
  ] as const)(
    'turns unsafe mode evidence into one visible import notice',
    ({ binding, description, sourceEnvelope }) => {
      const feedback = createFeedback()

      reportProjectMidiImportSuccess(feedback, createResult([], binding, sourceEnvelope))

      expect(feedback.warning).toHaveBeenCalledWith(
        'MIDI imported with notices',
        `1 track and 8 notes imported. ${description} 1 import notice was reported.`,
      )
      expect(feedback.success).not.toHaveBeenCalled()
    },
  )
})
