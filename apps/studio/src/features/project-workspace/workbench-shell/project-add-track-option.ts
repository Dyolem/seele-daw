export const PROJECT_ADD_TRACK_TYPE = {
  AUDIO: 'audio',
  BASS: 'bass',
  DRUM_MACHINE: 'drum-machine',
  GUITAR: 'guitar',
  INSTRUMENT: 'instrument',
  SAMPLER: 'sampler',
} as const

export type ProjectAddTrackType =
  (typeof PROJECT_ADD_TRACK_TYPE)[keyof typeof PROJECT_ADD_TRACK_TYPE]
