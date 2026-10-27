import type { MidiFileControlChange, MidiFileTrack } from '@seele-daw/midi-file'
import {
  MIDI_SUSTAIN_PEDAL_CONTROLLER_NUMBER,
  parseBipolarValue,
  parseLinearGain,
  type BipolarValue,
  type LinearGain,
} from '@seele-daw/project-core'

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
): MappedTrackChannel {
  let channelVolume: InitialControlCandidate | null = null
  let pan: InitialControlCandidate | null = null
  const unsupportedControlChanges: MidiFileControlChange[] = []

  for (const event of track.controlChanges) {
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
