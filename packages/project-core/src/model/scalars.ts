import type { Brand } from '@seele-daw/type-utils'
import { rejectDomainValue, requireFiniteNumber } from './domain-value-error'

export type MidiPitch = Brand<number, 'MidiPitch'>
export type MidiPitchDelta = Brand<number, 'MidiPitchDelta'>
export type MidiVelocity = Brand<number, 'MidiVelocity'>
export type MidiChannel = Brand<number, 'MidiChannel'>
export type MidiControlValue = Brand<number, 'MidiControlValue'>
export type LinearGain = Brand<number, 'LinearGain'>
export type BipolarValue = Brand<number, 'BipolarValue'>
export type ProjectColor = Brand<string, 'ProjectColor'>

export const MIDI_PITCH_MIN = 0
export const MIDI_PITCH_MAX = 127
export const MIDI_VELOCITY_MIN = 1
export const MIDI_VELOCITY_MAX = 127
export const MIDI_CHANNEL_MIN = 0
export const MIDI_CHANNEL_MAX = 15
export const MIDI_CONTROL_VALUE_MIN = 0
export const MIDI_CONTROL_VALUE_MAX = 127
export const LINEAR_GAIN_MIN = 0
export const LINEAR_GAIN_MAX = 4
export const BIPOLAR_VALUE_MIN = -1
export const BIPOLAR_VALUE_MAX = 1
export const MAX_ENTITY_NAME_LENGTH = 128

const PROJECT_COLOR_PATTERN = /^#[\da-f]{6}$/iu

function parseIntegerInRange<Value extends number>(
  value: unknown,
  valueName: string,
  minimum: number,
  maximum: number,
): Value {
  const constraint = `an integer from ${minimum} through ${maximum}`
  const numericValue = requireFiniteNumber(value, valueName, constraint)

  if (!Number.isInteger(numericValue) || numericValue < minimum || numericValue > maximum) {
    rejectDomainValue(valueName, constraint)
  }

  return numericValue as Value
}

function parseFiniteNumberInRange<Value extends number>(
  value: unknown,
  valueName: string,
  minimum: number,
  maximum: number,
): Value {
  const constraint = `a finite number from ${minimum} through ${maximum}`
  const numericValue = requireFiniteNumber(value, valueName, constraint)

  if (numericValue < minimum || numericValue > maximum) {
    rejectDomainValue(valueName, constraint)
  }

  return numericValue as Value
}

export function parseMidiPitch(value: unknown): MidiPitch {
  return parseIntegerInRange<MidiPitch>(value, 'MidiPitch', MIDI_PITCH_MIN, MIDI_PITCH_MAX)
}

export function parseMidiPitchDelta(value: unknown): MidiPitchDelta {
  return parseIntegerInRange<MidiPitchDelta>(
    value,
    'MidiPitchDelta',
    MIDI_PITCH_MIN - MIDI_PITCH_MAX,
    MIDI_PITCH_MAX - MIDI_PITCH_MIN,
  )
}

export function parseMidiVelocity(value: unknown): MidiVelocity {
  return parseIntegerInRange<MidiVelocity>(
    value,
    'MidiVelocity',
    MIDI_VELOCITY_MIN,
    MIDI_VELOCITY_MAX,
  )
}

export function parseMidiChannel(value: unknown): MidiChannel {
  return parseIntegerInRange<MidiChannel>(value, 'MidiChannel', MIDI_CHANNEL_MIN, MIDI_CHANNEL_MAX)
}

export function parseMidiControlValue(value: unknown): MidiControlValue {
  return parseIntegerInRange<MidiControlValue>(
    value,
    'MidiControlValue',
    MIDI_CONTROL_VALUE_MIN,
    MIDI_CONTROL_VALUE_MAX,
  )
}

export function parseLinearGain(value: unknown): LinearGain {
  return parseFiniteNumberInRange<LinearGain>(value, 'LinearGain', LINEAR_GAIN_MIN, LINEAR_GAIN_MAX)
}

export function parseBipolarValue(value: unknown): BipolarValue {
  return parseFiniteNumberInRange<BipolarValue>(
    value,
    'BipolarValue',
    BIPOLAR_VALUE_MIN,
    BIPOLAR_VALUE_MAX,
  )
}

export function parseProjectColor(value: unknown): ProjectColor {
  if (typeof value !== 'string' || !PROJECT_COLOR_PATTERN.test(value)) {
    rejectDomainValue('ProjectColor', 'a six-digit hexadecimal color such as #A0B1C2')
  }

  return value.toUpperCase() as ProjectColor
}

export function parseEntityName(value: unknown): string {
  const constraint = `a non-blank string of 1 through ${MAX_ENTITY_NAME_LENGTH} Unicode characters`

  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Array.from(value).length > MAX_ENTITY_NAME_LENGTH
  ) {
    rejectDomainValue('EntityName', constraint)
  }

  return value
}
