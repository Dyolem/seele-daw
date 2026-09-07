import {
  createStandardMidiFileSourceEnvelope,
  createStandardMidiFileSourceEnvelopeWithEvidence,
  type MidiSourceModeDeclaration,
  type MidiSourceModeDeclarationKind,
} from '@seele-daw/midi-file'
import { describe, expect, it } from 'vitest'
import { createProjectMidiSemanticBinding } from '#internal/import/midi-semantic-binding'

function createDeclaration(
  kind: MidiSourceModeDeclarationKind,
  overrides: Partial<MidiSourceModeDeclaration> = {},
): MidiSourceModeDeclaration {
  return {
    deviceId: kind === 'yamaha-xg-system-on' ? 0 : 0x7f,
    kind,
    scope: 'file',
    sourceEventIndex: 0,
    sourceTrackIndex: 0,
    tick: 0,
    ...overrides,
  }
}

function createInspectedEnvelope(
  declarations: readonly MidiSourceModeDeclaration[],
  unclassifiedSystemExclusiveMessageCount = 0,
) {
  return createStandardMidiFileSourceEnvelopeWithEvidence(1, {
    declarations,
    inspectionPolicy: 'smf-midi-1-mode-declarations-v1',
    status: 'inspected',
    unclassifiedSystemExclusiveMessageCount,
  })
}

describe('Project MIDI semantic binding', () => {
  it('distinguishes source declarations that were not inspected from an inspection failure', () => {
    expect(createProjectMidiSemanticBinding(createStandardMidiFileSourceEnvelope(1))).toEqual({
      policy: 'smf-midi-1-mode-binding-v1',
      reason: 'mode-declarations-not-inspected',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [],
      status: 'unresolved',
    })

    expect(
      createProjectMidiSemanticBinding(
        createStandardMidiFileSourceEnvelopeWithEvidence(1, {
          reason: 'profile-declaration-inspection-failed',
          status: 'unresolved',
        }),
      ),
    ).toEqual({
      policy: 'smf-midi-1-mode-binding-v1',
      reason: 'mode-declaration-inspection-failed',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [],
      status: 'unresolved',
    })
  })

  it('keeps an inspected source with no declarations explicitly unbound', () => {
    expect(createProjectMidiSemanticBinding(createInspectedEnvelope([]))).toEqual({
      policy: 'smf-midi-1-mode-binding-v1',
      reason: 'no-mode-declaration',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [],
      status: 'unbound',
    })
  })

  it('binds repeated declarations only when they identify the same mode', () => {
    const binding = createProjectMidiSemanticBinding(
      createInspectedEnvelope([
        createDeclaration('yamaha-xg-system-on'),
        createDeclaration('yamaha-xg-system-on', {
          deviceId: 3,
          sourceEventIndex: 4,
          tick: 960,
        }),
      ]),
    )

    expect(binding).toEqual({
      mode: 'yamaha-xg',
      policy: 'smf-midi-1-mode-binding-v1',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [0, 1],
      status: 'bound',
    })
    expect(Object.isFrozen(binding)).toBe(true)
    expect(Object.isFrozen(binding.sourceDeclarationIndexes)).toBe(true)
  })

  it('keeps General MIDI System Off without another mode explicitly unbound', () => {
    expect(
      createProjectMidiSemanticBinding(
        createInspectedEnvelope([createDeclaration('general-midi-system-off')]),
      ),
    ).toEqual({
      policy: 'smf-midi-1-mode-binding-v1',
      reason: 'general-midi-system-off',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [0],
      status: 'unbound',
    })
  })

  it('keeps the whole binding unresolved when any SysEx message is unclassified', () => {
    expect(
      createProjectMidiSemanticBinding(
        createInspectedEnvelope([createDeclaration('general-midi-1-system-on')], 2),
      ),
    ).toEqual({
      policy: 'smf-midi-1-mode-binding-v1',
      reason: 'unclassified-system-exclusive-messages',
      schemaVersion: 1,
      scope: 'file',
      sourceDeclarationIndexes: [0],
      status: 'unresolved',
      unclassifiedSystemExclusiveMessageCount: 2,
    })
  })

  it.each([
    {
      declarations: [
        createDeclaration('general-midi-2-system-on'),
        createDeclaration('roland-gs-reset', { deviceId: 0x10, tick: 480 }),
      ],
      expectedModes: ['general-midi-2', 'roland-gs'],
      expectedSystemOff: false,
    },
    {
      declarations: [
        createDeclaration('general-midi-1-system-on'),
        createDeclaration('general-midi-system-off', { sourceEventIndex: 1 }),
      ],
      expectedModes: ['general-midi-1'],
      expectedSystemOff: true,
    },
  ] as const)(
    'reports incompatible mode evidence without applying temporal precedence',
    ({ declarations, expectedModes, expectedSystemOff }) => {
      const binding = createProjectMidiSemanticBinding(createInspectedEnvelope(declarations))

      expect(binding).toEqual({
        candidateModes: expectedModes,
        hasGeneralMidiSystemOff: expectedSystemOff,
        policy: 'smf-midi-1-mode-binding-v1',
        reason: 'incompatible-mode-declarations',
        schemaVersion: 1,
        scope: 'file',
        sourceDeclarationIndexes: [0, 1],
        status: 'conflicted',
      })
      expect(Object.isFrozen(binding)).toBe(true)
      if (binding.status !== 'conflicted') throw new TypeError('Expected conflicted binding')
      expect(Object.isFrozen(binding.candidateModes)).toBe(true)
    },
  )
})
