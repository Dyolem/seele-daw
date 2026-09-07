import {
  MIDI_SOURCE_MODE_DECLARATION_KIND,
  MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON,
  MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS,
  assertMidiSourceEnvelope,
  type MidiSourceEnvelope,
  type MidiSourceModeDeclarationKind,
  type UnresolvedMidiSourceSemanticEvidence,
} from '@seele-daw/midi-file'

export const PROJECT_MIDI_SEMANTIC_BINDING_SCHEMA_VERSION = 1 as const

export const PROJECT_MIDI_SEMANTIC_BINDING_POLICY = Object.freeze({
  SMF_MIDI_1_MODE_V1: 'smf-midi-1-mode-binding-v1',
} as const)

export const PROJECT_MIDI_SEMANTIC_BINDING_STATUS = Object.freeze({
  BOUND: 'bound',
  CONFLICTED: 'conflicted',
  UNBOUND: 'unbound',
  UNRESOLVED: 'unresolved',
} as const)

export const PROJECT_MIDI_SEMANTIC_MODE = Object.freeze({
  GENERAL_MIDI_1: 'general-midi-1',
  GENERAL_MIDI_2: 'general-midi-2',
  ROLAND_GS: 'roland-gs',
  YAMAHA_XG: 'yamaha-xg',
} as const)

export type ProjectMidiSemanticMode =
  (typeof PROJECT_MIDI_SEMANTIC_MODE)[keyof typeof PROJECT_MIDI_SEMANTIC_MODE]

export const PROJECT_MIDI_SEMANTIC_BINDING_REASON = Object.freeze({
  GENERAL_MIDI_SYSTEM_OFF: 'general-midi-system-off',
  INCOMPATIBLE_MODE_DECLARATIONS: 'incompatible-mode-declarations',
  MODE_DECLARATION_INSPECTION_FAILED: 'mode-declaration-inspection-failed',
  MODE_DECLARATIONS_NOT_INSPECTED: 'mode-declarations-not-inspected',
  NO_MODE_DECLARATION: 'no-mode-declaration',
  UNCLASSIFIED_SYSTEM_EXCLUSIVE_MESSAGES: 'unclassified-system-exclusive-messages',
} as const)

interface ProjectMidiSemanticBindingBase {
  readonly policy: typeof PROJECT_MIDI_SEMANTIC_BINDING_POLICY.SMF_MIDI_1_MODE_V1
  readonly schemaVersion: typeof PROJECT_MIDI_SEMANTIC_BINDING_SCHEMA_VERSION
  readonly scope: 'file'
  /** Indexes into the paired Source Envelope's immutable declarations array. */
  readonly sourceDeclarationIndexes: readonly number[]
}

export interface BoundProjectMidiSemanticBinding extends ProjectMidiSemanticBindingBase {
  readonly mode: ProjectMidiSemanticMode
  readonly status: typeof PROJECT_MIDI_SEMANTIC_BINDING_STATUS.BOUND
}

export interface ConflictedProjectMidiSemanticBinding extends ProjectMidiSemanticBindingBase {
  readonly candidateModes: readonly ProjectMidiSemanticMode[]
  readonly hasGeneralMidiSystemOff: boolean
  readonly reason: typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.INCOMPATIBLE_MODE_DECLARATIONS
  readonly status: typeof PROJECT_MIDI_SEMANTIC_BINDING_STATUS.CONFLICTED
}

export interface UnboundProjectMidiSemanticBinding extends ProjectMidiSemanticBindingBase {
  readonly reason:
    | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.GENERAL_MIDI_SYSTEM_OFF
    | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.NO_MODE_DECLARATION
  readonly status: typeof PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNBOUND
}

export type UnresolvedProjectMidiSemanticBinding =
  | (ProjectMidiSemanticBindingBase & {
      readonly reason:
        | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATION_INSPECTION_FAILED
        | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATIONS_NOT_INSPECTED
      readonly status: typeof PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNRESOLVED
    })
  | (ProjectMidiSemanticBindingBase & {
      readonly reason: typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.UNCLASSIFIED_SYSTEM_EXCLUSIVE_MESSAGES
      readonly status: typeof PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNRESOLVED
      readonly unclassifiedSystemExclusiveMessageCount: number
    })

export type ProjectMidiSemanticBinding =
  | BoundProjectMidiSemanticBinding
  | ConflictedProjectMidiSemanticBinding
  | UnboundProjectMidiSemanticBinding
  | UnresolvedProjectMidiSemanticBinding

const CANONICAL_MODE_ORDER = Object.freeze([
  PROJECT_MIDI_SEMANTIC_MODE.GENERAL_MIDI_1,
  PROJECT_MIDI_SEMANTIC_MODE.GENERAL_MIDI_2,
  PROJECT_MIDI_SEMANTIC_MODE.ROLAND_GS,
  PROJECT_MIDI_SEMANTIC_MODE.YAMAHA_XG,
] as const)

function createBase(sourceDeclarationIndexes: readonly number[]): ProjectMidiSemanticBindingBase {
  return {
    policy: PROJECT_MIDI_SEMANTIC_BINDING_POLICY.SMF_MIDI_1_MODE_V1,
    schemaVersion: PROJECT_MIDI_SEMANTIC_BINDING_SCHEMA_VERSION,
    scope: 'file',
    sourceDeclarationIndexes: Object.freeze([...sourceDeclarationIndexes]),
  }
}

function modeForDeclaration(kind: MidiSourceModeDeclarationKind): ProjectMidiSemanticMode | null {
  switch (kind) {
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_1_SYSTEM_ON:
      return PROJECT_MIDI_SEMANTIC_MODE.GENERAL_MIDI_1
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_2_SYSTEM_ON:
      return PROJECT_MIDI_SEMANTIC_MODE.GENERAL_MIDI_2
    case MIDI_SOURCE_MODE_DECLARATION_KIND.ROLAND_GS_RESET:
      return PROJECT_MIDI_SEMANTIC_MODE.ROLAND_GS
    case MIDI_SOURCE_MODE_DECLARATION_KIND.YAMAHA_XG_SYSTEM_ON:
      return PROJECT_MIDI_SEMANTIC_MODE.YAMAHA_XG
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_SYSTEM_OFF:
      return null
  }
}

function bindingReasonForUnresolvedEvidence(
  reason: UnresolvedMidiSourceSemanticEvidence['reason'],
):
  | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATION_INSPECTION_FAILED
  | typeof PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATIONS_NOT_INSPECTED {
  switch (reason) {
    case MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATION_INSPECTION_FAILED:
      return PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATION_INSPECTION_FAILED
    case MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED:
      return PROJECT_MIDI_SEMANTIC_BINDING_REASON.MODE_DECLARATIONS_NOT_INSPECTED
  }
}

/** Derives a conservative import interpretation without changing any musical or Project facts. */
export function createProjectMidiSemanticBinding(
  sourceEnvelope: MidiSourceEnvelope,
): ProjectMidiSemanticBinding {
  assertMidiSourceEnvelope(sourceEnvelope)
  const evidence = sourceEnvelope.semanticEvidence

  if (evidence.status === MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED) {
    return Object.freeze({
      ...createBase([]),
      reason: bindingReasonForUnresolvedEvidence(evidence.reason),
      status: PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNRESOLVED,
    })
  }

  const sourceDeclarationIndexes = evidence.declarations.map((_, index) => index)
  if (evidence.unclassifiedSystemExclusiveMessageCount > 0) {
    return Object.freeze({
      ...createBase(sourceDeclarationIndexes),
      reason: PROJECT_MIDI_SEMANTIC_BINDING_REASON.UNCLASSIFIED_SYSTEM_EXCLUSIVE_MESSAGES,
      status: PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNRESOLVED,
      unclassifiedSystemExclusiveMessageCount: evidence.unclassifiedSystemExclusiveMessageCount,
    })
  }

  const candidateModeSet = new Set<ProjectMidiSemanticMode>()
  let hasGeneralMidiSystemOff = false
  for (const declaration of evidence.declarations) {
    const mode = modeForDeclaration(declaration.kind)
    if (mode === null) {
      hasGeneralMidiSystemOff = true
    } else {
      candidateModeSet.add(mode)
    }
  }
  const candidateModes = CANONICAL_MODE_ORDER.filter((mode) => candidateModeSet.has(mode))

  if (candidateModes.length > 1 || (candidateModes.length > 0 && hasGeneralMidiSystemOff)) {
    return Object.freeze({
      ...createBase(sourceDeclarationIndexes),
      candidateModes: Object.freeze([...candidateModes]),
      hasGeneralMidiSystemOff,
      reason: PROJECT_MIDI_SEMANTIC_BINDING_REASON.INCOMPATIBLE_MODE_DECLARATIONS,
      status: PROJECT_MIDI_SEMANTIC_BINDING_STATUS.CONFLICTED,
    })
  }

  const mode = candidateModes[0]
  if (mode !== undefined) {
    return Object.freeze({
      ...createBase(sourceDeclarationIndexes),
      mode,
      status: PROJECT_MIDI_SEMANTIC_BINDING_STATUS.BOUND,
    })
  }

  return Object.freeze({
    ...createBase(sourceDeclarationIndexes),
    reason: hasGeneralMidiSystemOff
      ? PROJECT_MIDI_SEMANTIC_BINDING_REASON.GENERAL_MIDI_SYSTEM_OFF
      : PROJECT_MIDI_SEMANTIC_BINDING_REASON.NO_MODE_DECLARATION,
    status: PROJECT_MIDI_SEMANTIC_BINDING_STATUS.UNBOUND,
  })
}
