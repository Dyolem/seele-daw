import type { ValueOf } from '@seele-daw/type-utils'

/**
 * Canonical runtime discriminants for every supported project mutation.
 * Payload shapes remain explicit in ProjectMutation so each variant stays readable.
 */
export const PROJECT_MUTATION_TYPE = {
  PROJECT: {
    REPLACE: 'project.replace',
  },
  MASTER: {
    REPLACE: 'master.replace',
  },
  TRACK: {
    INSERT: 'track.insert',
    REMOVE: 'track.remove',
    REPLACE: 'track.replace',
  },
  CLIP: {
    INSERT: 'clip.insert',
    REMOVE: 'clip.remove',
    REPLACE: 'clip.replace',
  },
  MIDI_SOURCE: {
    INSERT: 'midi-source.insert',
    REMOVE: 'midi-source.remove',
    REPLACE: 'midi-source.replace',
  },
  TEMPO_EVENT: {
    INSERT: 'tempo-event.insert',
    REMOVE: 'tempo-event.remove',
    REPLACE: 'tempo-event.replace',
  },
  TIME_SIGNATURE_EVENT: {
    INSERT: 'time-signature-event.insert',
    REMOVE: 'time-signature-event.remove',
    REPLACE: 'time-signature-event.replace',
  },
  DEVICE: {
    INSERT: 'device.insert',
    REMOVE: 'device.remove',
    REPLACE: 'device.replace',
  },
  TRACK_ORDER: {
    INSERT: 'track-order.insert',
    REMOVE: 'track-order.remove',
  },
  NOTE_PARTITION: {
    INSERT: 'note-partition.insert',
    REMOVE: 'note-partition.remove',
  },
  NOTE: {
    INSERT: 'note.insert',
    REMOVE: 'note.remove',
    REPLACE: 'note.replace',
  },
  SUSTAIN_PEDAL_EVENT_PARTITION: {
    INSERT: 'sustain-pedal-event-partition.insert',
    REMOVE: 'sustain-pedal-event-partition.remove',
  },
  SUSTAIN_PEDAL_EVENT: {
    INSERT: 'sustain-pedal-event.insert',
    REMOVE: 'sustain-pedal-event.remove',
    REPLACE: 'sustain-pedal-event.replace',
  },
} as const

type ProjectMutationTypeGroup = ValueOf<typeof PROJECT_MUTATION_TYPE>

export type ProjectMutationType = ValueOf<ProjectMutationTypeGroup>
