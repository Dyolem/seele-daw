import {
  PROJECT_FILE_V2_FORMAT_VERSION,
  type MidiSourceDTO,
  type MidiSustainPedalEventDTO,
  type ProjectFileDTO,
} from '#internal/persistence/project-file-dto'

type ExactFieldMap<Value extends object> = Readonly<{
  [Field in keyof Value]-?: true
}>

function defineFields<Value extends object>(fields: ExactFieldMap<Value>): ExactFieldMap<Value> {
  return Object.freeze(fields)
}

/** Executable schema additions introduced by Project File V2. */
export const PROJECT_FILE_V2_PROTOCOL = Object.freeze({
  formatVersion: PROJECT_FILE_V2_FORMAT_VERSION,
  fields: Object.freeze({
    topLevel: defineFields<ProjectFileDTO>({
      formatVersion: true,
      requiredFeatures: true,
      projectId: true,
      name: true,
      trackOrder: true,
      tracks: true,
      clips: true,
      midiSources: true,
      tempoEvents: true,
      timeSignatureEvents: true,
      devices: true,
      master: true,
    }),
    midiSource: defineFields<MidiSourceDTO>({
      id: true,
      lengthTick: true,
      notes: true,
      sustainPedalEvents: true,
    }),
    midiSustainPedalEvent: defineFields<MidiSustainPedalEventDTO>({
      id: true,
      tick: true,
      value: true,
      channel: true,
    }),
  }),
  supportedRequiredFeatures: Object.freeze({}) as Readonly<Record<string, true>>,
})
