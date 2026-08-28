/**
 * Builds the smallest cross-entity-valid ModelStore for a newly created project.
 *
 * The initializer owns structural defaults only. Callers provide opaque entity IDs,
 * while product templates remain responsible for adding tracks, devices, and content.
 */
import { createMasterChannelRecord } from './channel'
import type { ProjectId, TempoEventId, TimeSignatureEventId } from './ids'
import { assertModelInvariants } from './invariant-validator'
import { ModelStore, type ModelStoreSeed } from './model-store'
import { createProjectRecord } from './project'
import { parseLinearGain } from './scalars'
import { createTempoEventRecord, parseTempoBpm } from '#internal/time/tempo-event'
import { ZERO_TICK } from '#internal/time/tick'
import {
  createTimeSignatureEventRecord,
  parseTimeSignatureDenominator,
  parseTimeSignatureNumerator,
} from '#internal/time/time-signature-event'

const INITIAL_TEMPO_BPM = parseTempoBpm(120)
const INITIAL_TIME_SIGNATURE_NUMERATOR = parseTimeSignatureNumerator(4)
const INITIAL_TIME_SIGNATURE_DENOMINATOR = parseTimeSignatureDenominator(4)
const UNITY_GAIN = parseLinearGain(1)

export interface CreateInitialModelStoreInput {
  readonly projectId: ProjectId
  readonly projectName: string
  readonly tempoEventId: TempoEventId
  readonly timeSignatureEventId: TimeSignatureEventId
}

export function createInitialModelStore(input: CreateInitialModelStoreInput): ModelStore {
  const project = createProjectRecord({
    id: input.projectId,
    name: input.projectName,
  })
  const tempoEvent = createTempoEventRecord({
    id: input.tempoEventId,
    tick: ZERO_TICK,
    bpm: INITIAL_TEMPO_BPM,
  })
  const timeSignatureEvent = createTimeSignatureEventRecord({
    id: input.timeSignatureEventId,
    tick: ZERO_TICK,
    numerator: INITIAL_TIME_SIGNATURE_NUMERATOR,
    denominator: INITIAL_TIME_SIGNATURE_DENOMINATOR,
  })
  const master = createMasterChannelRecord({
    gain: UNITY_GAIN,
    muted: false,
    audioEffectIds: [],
  })

  const seed: ModelStoreSeed = {
    project,
    trackOrder: [],
    tracks: new Map(),
    clips: new Map(),
    midiSources: new Map(),
    midiNotesBySource: new Map(),
    midiSustainPedalEventsBySource: new Map(),
    tempoEvents: new Map([[tempoEvent.id, tempoEvent]]),
    timeSignatureEvents: new Map([[timeSignatureEvent.id, timeSignatureEvent]]),
    devices: new Map(),
    master,
  }
  const store = new ModelStore(seed)

  // Keep new-project creation a trusted boundary as the model gains new invariants.
  assertModelInvariants(store)

  return store
}
