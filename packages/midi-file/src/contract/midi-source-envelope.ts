export type MidiFileFormat = 0 | 1

export const MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION = 1 as const

export const MIDI_SOURCE_CONTAINER_KIND = Object.freeze({
  STANDARD_MIDI_FILE: 'standard-midi-file',
} as const)

export const MIDI_SOURCE_MESSAGE_PROTOCOL = Object.freeze({
  MIDI_1_0: 'midi-1.0',
} as const)

export const MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS = Object.freeze({
  UNRESOLVED: 'unresolved',
} as const)

export const MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON = Object.freeze({
  PROFILE_DECLARATIONS_NOT_INSPECTED: 'profile-declarations-not-inspected',
} as const)

export interface StandardMidiFileSourceContainer {
  readonly format: MidiFileFormat
  readonly kind: typeof MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE
  readonly timeDivision: 'ppq'
}

export interface UnresolvedMidiSourceSemanticEvidence {
  readonly reason: typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED
  readonly status: typeof MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED
}

/** Parser evidence kept separate from musical events and from any future semantic interpretation. */
export interface MidiSourceEnvelope {
  readonly schemaVersion: typeof MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION
  readonly container: StandardMidiFileSourceContainer
  readonly messageProtocol: typeof MIDI_SOURCE_MESSAGE_PROTOCOL.MIDI_1_0
  readonly semanticEvidence: UnresolvedMidiSourceSemanticEvidence
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validates an envelope received across a package or host boundary. */
export function assertMidiSourceEnvelope(
  value: unknown,
  expectedFormat?: MidiFileFormat,
): asserts value is MidiSourceEnvelope {
  if (!isRecord(value) || !isRecord(value.container) || !isRecord(value.semanticEvidence)) {
    throw new TypeError(
      'MIDI Source Envelope must be an object with container and semantic evidence',
    )
  }
  const format = value.container.format
  if (
    value.container.kind !== MIDI_SOURCE_CONTAINER_KIND.STANDARD_MIDI_FILE ||
    value.container.timeDivision !== 'ppq' ||
    (format !== 0 && format !== 1) ||
    (expectedFormat !== undefined && format !== expectedFormat) ||
    value.schemaVersion !== MIDI_SOURCE_ENVELOPE_SCHEMA_VERSION ||
    value.messageProtocol !== MIDI_SOURCE_MESSAGE_PROTOCOL.MIDI_1_0 ||
    value.semanticEvidence.status !== MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED ||
    value.semanticEvidence.reason !==
      MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED
  ) {
    throw new TypeError('MIDI Source Envelope is unsupported or inconsistent')
  }
}

/** Creates the only source envelope currently proven by the Standard MIDI File decoder. */
export function createStandardMidiFileSourceEnvelope(format: MidiFileFormat): MidiSourceEnvelope {
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
    semanticEvidence: Object.freeze({
      reason: MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATIONS_NOT_INSPECTED,
      status: MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED,
    }),
  })
}
