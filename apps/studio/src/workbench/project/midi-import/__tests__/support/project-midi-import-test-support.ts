import { createStandardMidiFileSourceEnvelopeWithEvidence } from '@seele-daw/midi-file'
import type { ProjectMidiSemanticBinding } from '@seele-daw/project-midi'

export const NO_MODE_DECLARATION_MIDI_SOURCE_ENVELOPE =
  createStandardMidiFileSourceEnvelopeWithEvidence(1, {
    declarations: [],
    inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
    status: 'inspected',
    unclassifiedSystemExclusiveMessageCount: 0,
  })

export const NO_MODE_DECLARATION_PROJECT_MIDI_SEMANTIC_BINDING = Object.freeze({
  policy: 'smf-midi-1-mode-binding-v1',
  reason: 'no-mode-declaration',
  schemaVersion: 1,
  scope: 'file',
  sourceDeclarationIndexes: Object.freeze([]),
  status: 'unbound',
} as const satisfies ProjectMidiSemanticBinding)

export const UNINSPECTED_PROJECT_MIDI_SEMANTIC_BINDING = Object.freeze({
  policy: 'smf-midi-1-mode-binding-v1',
  reason: 'mode-declarations-not-inspected',
  schemaVersion: 1,
  scope: 'file',
  sourceDeclarationIndexes: Object.freeze([]),
  status: 'unresolved',
} as const satisfies ProjectMidiSemanticBinding)
