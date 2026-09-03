import type { MidiFileControlChange, MidiFileTrack } from '@seele-daw/midi-file'
import {
  MIDI_SUSTAIN_PEDAL_CONTROLLER_NUMBER,
  parseBipolarValue,
  parseLinearGain,
  type BipolarValue,
  type LinearGain,
} from '@seele-daw/project-core'
import { ProjectMidiImportError } from '#internal/import/project-midi-import-error'

const CHANNEL_VOLUME_CONTROLLER = 7
const PAN_CONTROLLER = 10
const MIDI_CONTROL_VALUE_MAX = 127
const MIDI_PAN_CENTER = 64

interface InitialControlCandidate {
  readonly sourceTick: number
  readonly value: number
}

export interface MappedTrackChannel {
  readonly gain: LinearGain
  readonly pan: BipolarValue
  readonly unsupportedControlChanges: readonly MidiFileControlChange[]
}

function requireControlChange(input: unknown, sourceTrackIndex: number): MidiFileControlChange {
  if (input === null || typeof input !== 'object') {
    throwInvalidControlChange(input, sourceTrackIndex)
  }

  const tick: unknown = Reflect.get(input, 'tick')
  const controller: unknown = Reflect.get(input, 'controller')
  const value: unknown = Reflect.get(input, 'value')
  if (
    typeof tick !== 'number' ||
    !Number.isSafeInteger(tick) ||
    tick < 0 ||
    typeof controller !== 'number' ||
    !Number.isSafeInteger(controller) ||
    controller < 0 ||
    controller > MIDI_CONTROL_VALUE_MAX ||
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MIDI_CONTROL_VALUE_MAX
  ) {
    throwInvalidControlChange(input, sourceTrackIndex)
  }

  return Object.freeze({ tick, controller, value })
}

function throwInvalidControlChange(input: unknown, sourceTrackIndex: number): never {
  throw new ProjectMidiImportError(
    'invalid-midi-document',
    'MIDI control-change events require a non-negative safe-integer Tick and integer Controller and value from 0 through 127.',
    { sourceTrackIndex, value: input },
  )
}

function selectLaterInitialControl(
  current: InitialControlCandidate | null,
  event: MidiFileControlChange,
): InitialControlCandidate {
  if (current !== null && event.tick < current.sourceTick) return current
  return { sourceTick: event.tick, value: event.value }
}

function mapPan(value: number): BipolarValue {
  if (value < MIDI_PAN_CENTER) {
    return parseBipolarValue((value - MIDI_PAN_CENTER) / MIDI_PAN_CENTER)
  }
  return parseBipolarValue((value - MIDI_PAN_CENTER) / (MIDI_CONTROL_VALUE_MAX - MIDI_PAN_CENTER))
}

/** Collapses pre-roll CC7 / CC10 into the existing Track Channel while preserving dynamic facts as diagnostics. */
export function mapTrackChannel(
  track: MidiFileTrack,
  firstNoteTick: number | null,
  sourceTrackIndex: number,
): MappedTrackChannel {
  let channelVolume: InitialControlCandidate | null = null
  let pan: InitialControlCandidate | null = null
  const unsupportedControlChanges: MidiFileControlChange[] = []

  for (const input of track.controlChanges) {
    const event = requireControlChange(input, sourceTrackIndex)
    if (event.controller === MIDI_SUSTAIN_PEDAL_CONTROLLER_NUMBER) continue

    const isInitialChannelControl =
      firstNoteTick !== null &&
      event.tick <= firstNoteTick &&
      (event.controller === CHANNEL_VOLUME_CONTROLLER || event.controller === PAN_CONTROLLER)
    if (!isInitialChannelControl) {
      unsupportedControlChanges.push(event)
      continue
    }

    if (event.controller === CHANNEL_VOLUME_CONTROLLER) {
      channelVolume = selectLaterInitialControl(channelVolume, event)
    } else {
      pan = selectLaterInitialControl(pan, event)
    }
  }

  return Object.freeze({
    gain: parseLinearGain(
      (channelVolume?.value ?? MIDI_CONTROL_VALUE_MAX) / MIDI_CONTROL_VALUE_MAX,
    ),
    pan: mapPan(pan?.value ?? MIDI_PAN_CENTER),
    unsupportedControlChanges: Object.freeze(unsupportedControlChanges),
  })
}
