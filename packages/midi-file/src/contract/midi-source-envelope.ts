export type MidiFileFormat = 0 | 1

export const MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION = 1 as const

export const MIDI_SOURCE_CONTAINER_KIND = Object.freeze({
  STANDARD_MIDI_FILE: 'standard-midi-file',
} as const)

export const MIDI_SOURCE_MESSAGE_PROTOCOL = Object.freeze({
  MIDI_1_0: 'midi-1.0',
} as const)

export const MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS = Object.freeze({
  INSPECTED: 'inspected',
  UNRESOLVED: 'unresolved',
} as const)

export const MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON = Object.freeze({
  PROFILE_DECLARATION_INSPECTION_FAILED: 'profile-declaration-inspection-failed',
  PROFILE_DECLARATIONS_NOT_INSPECTED: 'profile-declarations-not-inspected',
} as const)

export const MIDI_SOURCE_SEMANTIC_INSPECTION_POLICY = Object.freeze({
  SMF_MIDI_1_MODE_DECLARATIONS_V1: 'smf-midi-1-mode-declarations-v1',
} as const)

export const MIDI_SOURCE_MODE_DECLARATION_KIND = Object.freeze({
  GENERAL_MIDI_1_SYSTEM_ON: 'general-midi-1-system-on',
  GENERAL_MIDI_2_SYSTEM_ON: 'general-midi-2-system-on',
  GENERAL_MIDI_SYSTEM_OFF: 'general-midi-system-off',
  ROLAND_GS_RESET: 'roland-gs-reset',
  YAMAHA_XG_SYSTEM_ON: 'yamaha-xg-system-on',
} as const)

export type MidiSourceModeDeclarationKind =
  (typeof MIDI_SOURCE_MODE_DECLARATION_KIND)[keyof typeof MIDI_SOURCE_MODE_DECLARATION_KIND]

export interface StandardMidiFileSourceContainer {
  readonly format: MidiFileFormat
  readonly kind: typeof MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE
  readonly timeDivision: 'ppq'
}

export interface UnresolvedMidiSourceSemanticEvidence {
  readonly reason:
    | typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATION_INSPECTION_FAILED
    | typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED
  readonly status: typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED
}

/** A file-wide mode declaration recognized from one exact MIDI 1.0 System Exclusive message. */
export interface MidiSourceModeDeclaration {
  readonly deviceId: number
  readonly kind: MidiSourceModeDeclarationKind
  readonly scope: 'file'
  readonly sourceEventIndex: number
  readonly sourceTrackIndex: number
  readonly tick: number
}

export interface InspectedMidiSourceSemanticEvidence {
  readonly declarations: readonly MidiSourceModeDeclaration[]
  readonly inspectionPolicy: typeof MIDI_SOURCE_SEMANTIC_INSPECTION_POLICY.SMF_MIDI_1_MODE_DECLARATIONS_V1
  readonly status: typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.INSPECTED
  readonly unclassifiedSystemExclusiveMessageCount: number
}

export type MidiSourceSemanticEvidence =
  | InspectedMidiSourceSemanticEvidence
  | UnresolvedMidiSourceSemanticEvidence

/** Parser evidence kept separate from musical events and from any future semantic interpretation. */
export interface MidiSourceEnvelope {
  readonly schemaVersion: typeof MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION
  readonly container: StandardMidiFileSourceContainer
  readonly messageProtocol: typeof MIDI_SOURCE_MESSAGE_PROTOCOL.MIDI_1_0
  readonly semanticEvidence: MidiSourceSemanticEvidence
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isModeDeclarationKind(value: unknown): value is MidiSourceModeDeclarationKind {
  return Object.values(MIDI_SOURCE_MODE_DECLARATION_KIND).some((kind) => value === kind)
}

function hasValidDeviceId(declaration: Readonly<Record<string, unknown>>): boolean {
  if (!isNonNegativeSafeInteger(declaration.deviceId)) return false

  switch (declaration.kind) {
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_1_SYSTEM_ON:
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_2_SYSTEM_ON:
    case MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_SYSTEM_OFF:
      return declaration.deviceId <= 0x7f
    case MIDI_SOURCE_MODE_DECLARATION_KIND.ROLAND_GS_RESET:
      return declaration.deviceId <= 0x1f
    case MIDI_SOURCE_MODE_DECLARATION_KIND.YAMAHA_XG_SYSTEM_ON:
      return declaration.deviceId <= 0x0f
    default:
      return false
  }
}

function isModeDeclaration(value: unknown): value is MidiSourceModeDeclaration {
  return (
    isRecord(value) &&
    isModeDeclarationKind(value.kind) &&
    value.scope === 'file' &&
    isNonNegativeSafeInteger(value.sourceEventIndex) &&
    isNonNegativeSafeInteger(value.sourceTrackIndex) &&
    isNonNegativeSafeInteger(value.tick) &&
    hasValidDeviceId(value)
  )
}

function assertMidiSourceSemanticEvidence(
  value: unknown,
): asserts value is MidiSourceSemanticEvidence {
  if (!isRecord(value)) {
    throw new TypeError('MIDI Source Envelope semantic evidence must be an object')
  }

  if (value.status === MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED) {
    if (
      value.reason !== MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATION_INSPECTION_FAILED &&
      value.reason !== MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED
    ) {
      throw new TypeError('MIDI Source Envelope unresolved reason is unsupported')
    }
    return
  }

  if (
    value.status !== MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.INSPECTED ||
    value.inspectionPolicy !==
      MIDI_SOURCE_SEMANTIC_INSPECTION_POLICY.SMF_MIDI_1_MODE_DECLARATIONS_V1 ||
    !Array.isArray(value.declarations) ||
    !value.declarations.every(isModeDeclaration) ||
    !isNonNegativeSafeInteger(value.unclassifiedSystemExclusiveMessageCount)
  ) {
    throw new TypeError('MIDI Source Envelope inspected evidence is unsupported or invalid')
  }
}

function copySemanticEvidence(evidence: MidiSourceSemanticEvidence): MidiSourceSemanticEvidence {
  assertMidiSourceSemanticEvidence(evidence)
  if (evidence.status === MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED) {
    return Object.freeze({ ...evidence })
  }
  return Object.freeze({
    ...evidence,
    declarations: Object.freeze(
      evidence.declarations.map((declaration) => Object.freeze({ ...declaration })),
    ),
  })
}

/** Validates an envelope received across a package or host boundary. */
export function assertMidiSourceEnvelope(
  value: unknown,
  expectedFormat?: MidiFileFormat,
): asserts value is MidiSourceEnvelope {
  if (!isRecord(value) || !isRecord(value.container)) {
    throw new TypeError(
      'MIDI Source Envelope must be an object with container and semantic evidence',
    )
  }
  assertMidiSourceSemanticEvidence(value.semanticEvidence)
  const format = value.container.format
  if (
    value.container.kind !== MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE ||
    value.container.timeDivision !== 'ppq' ||
    (format !== 0 && format !== 1) ||
    (expectedFormat !== undefined && format !== expectedFormat) ||
    value.schemaVersion !== MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION ||
    value.messageProtocol !== MIDI_SOURCE_MESSAGE_PROTOCOL.MIDI_1_0
  ) {
    throw new TypeError('MIDI Source Envelope is unsupported or inconsistent')
  }
}

/** Creates the only source envelope currently proven by the Standard MIDI File decoder. */
export function createStandardMidiFileSourceEnvelope(format: MidiFileFormat): MidiSourceEnvelope {
  return createStandardMidiFileSourceEnvelopeWithEvidence(format, {
    reason: MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED,
    status: MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED,
  })
}

/** Creates a deeply immutable SMF envelope from evidence produced by a bounded inspector. */
export function createStandardMidiFileSourceEnvelopeWithEvidence(
  format: MidiFileFormat,
  semanticEvidence: MidiSourceSemanticEvidence,
): MidiSourceEnvelope {
  if (format !== 0 && format !== 1) {
    throw new TypeError(`Unsupported Standard MIDI File format ${String(format)}`)
  }
  return Object.freeze({
    schemaVersion: MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION,
    container: Object.freeze({
      format,
      kind: MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE,
      timeDivision: 'ppq',
    }),
    messageProtocol: MIDI_SOURCE_MESSAGE_PROTOCOL.MIDI_1_0,
    semanticEvidence: copySemanticEvidence(semanticEvidence),
  })
}

/** Validates and deeply copies an envelope before another package retains it. */
export function copyMidiSourceEnvelope(value: unknown): MidiSourceEnvelope {
  assertMidiSourceEnvelope(value)
  return createStandardMidiFileSourceEnvelopeWithEvidence(
    value.container.format,
    value.semanticEvidence,
  )
}
