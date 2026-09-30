export const PIANO_ROLL_MIDI_CHANNEL_OPTIONS = Object.freeze(
  Array.from({ length: 16 }, (_, channel) =>
    Object.freeze({ value: String(channel), label: String(channel + 1) }),
  ),
)
