import {
  MIDI_SOURCE_MODE_DECLARATION_KIND,
  MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON,
  MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS,
  MIDI_SOURCE_SEMANTIC_INSPECTION_POLICY,
  type MidiSourceModeDeclaration,
  type MidiSourceModeDeclarationKind,
  type MidiSourceSemanticEvidence,
} from '#internal/contract/midi-source-envelope'
import { parseMidi, type MidiEvent } from 'midi-file'

const END_OF_EXCLUSIVE = 0xf7
const MAX_RECOGNIZED_DECLARATION_DATA_LENGTH = 10

interface SourceLocation {
  readonly sourceEventIndex: number
  readonly sourceTrackIndex: number
  readonly tick: number
}

interface PendingSystemExclusiveMessage {
  readonly data: number[]
  readonly location: SourceLocation
  terminated: boolean
  totalDataLength: number
}

interface RecognizedMode {
  readonly deviceId: number
  readonly kind: MidiSourceModeDeclarationKind
}

/**
 * Inspects only exact, documented MIDI 1.0 system-mode declarations.
 * Unknown SysEx remains counted but unclassified; it never becomes inferred semantics.
 */
export function inspectSmfMidi1ModeDeclarations(bytes: Uint8Array): MidiSourceSemanticEvidence {
  try {
    const midiData = parseMidi(bytes)
    const declarations: MidiSourceModeDeclaration[] = []
    let unclassifiedSystemExclusiveMessageCount = 0

    for (const [sourceTrackIndex, track] of midiData.tracks.entries()) {
      let tick = 0
      let pending: PendingSystemExclusiveMessage | null = null

      for (const [sourceEventIndex, event] of track.entries()) {
        tick = addDeltaTick(tick, event.deltaTime)
        if (event.type === 'sysEx') {
          if (pending !== null) unclassifiedSystemExclusiveMessageCount += 1
          pending = createPendingMessage(
            event,
            Object.freeze({ sourceEventIndex, sourceTrackIndex, tick }),
          )
        } else if (event.type === 'endSysEx') {
          if (pending === null) {
            unclassifiedSystemExclusiveMessageCount += 1
            continue
          }
          appendMessageData(pending, event.data)
        } else {
          continue
        }

        if (pending !== null && hasEndOfExclusive(pending)) {
          const declaration = recognizeModeDeclaration(pending)
          if (declaration === null) {
            unclassifiedSystemExclusiveMessageCount += 1
          } else {
            declarations.push(declaration)
          }
          pending = null
        }
      }

      if (pending !== null) unclassifiedSystemExclusiveMessageCount += 1
    }

    return {
      declarations,
      inspectionPolicy: MIDI_SOURCE_SEMANTIC_INSPECTION_POLICY.SMF_MIDI_1_MODE_DECLARATIONS_V1,
      status: MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.INSPECTED,
      unclassifiedSystemExclusiveMessageCount,
    }
  } catch {
    return {
      reason: MIDI_SOURCE_SEMANTIC_EVIDENCE_REASON.PROFILE_DECLARATION_INSPECTION_FAILED,
      status: MIDI_SOURCE_SEMANTIC_EVIDENCE_STATUS.UNRESOLVED,
    }
  }
}

function addDeltaTick(tick: number, deltaTime: number): number {
  const nextTick = tick + deltaTime
  if (!Number.isSafeInteger(deltaTime) || deltaTime < 0 || !Number.isSafeInteger(nextTick)) {
    throw new TypeError('SMF mode-declaration location exceeds the safe tick range')
  }
  return nextTick
}

function createPendingMessage(
  event: Extract<MidiEvent, { readonly type: 'sysEx' }>,
  location: SourceLocation,
): PendingSystemExclusiveMessage {
  const pending: PendingSystemExclusiveMessage = {
    data: [],
    location,
    terminated: false,
    totalDataLength: 0,
  }
  appendMessageData(pending, event.data)
  return pending
}

function appendMessageData(
  pending: PendingSystemExclusiveMessage,
  source: ArrayLike<number>,
): void {
  for (let index = 0; index < source.length; index += 1) {
    const value = source[index]
    if (!Number.isInteger(value) || value === undefined || value < 0 || value > 0xff) {
      throw new TypeError('SMF System Exclusive data contains an invalid byte')
    }
    pending.totalDataLength += 1
    if (pending.data.length < MAX_RECOGNIZED_DECLARATION_DATA_LENGTH) {
      pending.data.push(value)
    }
  }
  pending.terminated = source.length > 0 && source[source.length - 1] === END_OF_EXCLUSIVE
}

function hasEndOfExclusive(pending: PendingSystemExclusiveMessage): boolean {
  return pending.terminated
}

function recognizeModeDeclaration(
  pending: PendingSystemExclusiveMessage,
): MidiSourceModeDeclaration | null {
  if (pending.totalDataLength !== pending.data.length) return null
  const recognized =
    recognizeUniversalGeneralMidi(pending.data) ??
    recognizeRolandGsReset(pending.data) ??
    recognizeYamahaXgSystemOn(pending.data)
  if (recognized === null) return null

  return {
    ...pending.location,
    deviceId: recognized.deviceId,
    kind: recognized.kind,
    scope: 'file',
  }
}

function recognizeUniversalGeneralMidi(data: readonly number[]): RecognizedMode | null {
  if (
    data.length !== 5 ||
    data[0] !== 0x7e ||
    !isSevenBitValue(data[1]) ||
    data[2] !== 0x09 ||
    data[4] !== END_OF_EXCLUSIVE
  ) {
    return null
  }

  const kindBySubId = {
    0x01: MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_1_SYSTEM_ON,
    0x02: MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_SYSTEM_OFF,
    0x03: MIDI_SOURCE_MODE_DECLARATION_KIND.GENERAL_MIDI_2_SYSTEM_ON,
  } as const satisfies Readonly<Partial<Record<number, MidiSourceModeDeclarationKind>>>
  const kind = kindBySubId[data[3] as keyof typeof kindBySubId]
  return kind === undefined ? null : { deviceId: data[1], kind }
}

function recognizeRolandGsReset(data: readonly number[]): RecognizedMode | null {
  if (
    data.length !== 10 ||
    data[0] !== 0x41 ||
    !isIntegerInRange(data[1], 0x00, 0x1f) ||
    data[2] !== 0x42 ||
    data[3] !== 0x12 ||
    data[4] !== 0x40 ||
    data[5] !== 0x00 ||
    data[6] !== 0x7f ||
    data[7] !== 0x00 ||
    data[8] !== 0x41 ||
    data[9] !== END_OF_EXCLUSIVE
  ) {
    return null
  }
  return { deviceId: data[1], kind: MIDI_SOURCE_MODE_DECLARATION_KIND.ROLAND_GS_RESET }
}

function recognizeYamahaXgSystemOn(data: readonly number[]): RecognizedMode | null {
  if (
    data.length !== 8 ||
    data[0] !== 0x43 ||
    !isIntegerInRange(data[1], 0x10, 0x1f) ||
    data[2] !== 0x4c ||
    data[3] !== 0x00 ||
    data[4] !== 0x00 ||
    data[5] !== 0x7e ||
    data[6] !== 0x00 ||
    data[7] !== END_OF_EXCLUSIVE
  ) {
    return null
  }
  return {
    deviceId: data[1] & 0x0f,
    kind: MIDI_SOURCE_MODE_DECLARATION_KIND.YAMAHA_XG_SYSTEM_ON,
  }
}

function isSevenBitValue(value: number | undefined): value is number {
  return isIntegerInRange(value, 0x00, 0x7f)
}

function isIntegerInRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
): value is number {
  return value !== undefined && Number.isInteger(value) && value >= minimum && value <= maximum
}
