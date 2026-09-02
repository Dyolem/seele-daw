import type { ScheduledSampleVoicePlan, SoundbankId } from '@seele-daw/playback'

import {
  AUDIO_QUALITY_V1A_RENDER_POLICY,
  calculateAudioQualityV1aVelocityGain,
  type AudioQualityExpressionVoiceLifecycle,
} from '#internal/audio-quality/render-policy'
import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentEnvelopeSegmentV1,
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'
import type { LoadedSampleInstrumentResource } from '#internal/sample-instrument/loading/resource-cache'
import {
  SampleInstrumentZoneSelectionError,
  findSampleInstrumentZoneForPitch,
} from '#internal/sample-instrument/loading/zone-selection'
import {
  evaluateSampleInstrumentEnvelopeTransition,
  scheduleSampleInstrumentEnvelopeTransition,
} from '#internal/sample-instrument/voice/envelope'
import { selectSampleInstrumentVoiceStealCandidate } from '#internal/sample-instrument/voice/polyphony-policy'

type EngineGeneration = ScheduledSampleVoicePlan['engineGeneration']
type NoteOccurrenceKey = ScheduledSampleVoicePlan['occurrenceKey']

export interface SampleInstrumentVoiceToken {
  readonly engineGeneration: EngineGeneration
  readonly occurrenceKey: NoteOccurrenceKey
}

export type SampleInstrumentVoiceScheduleOutcome =
  | 'expired'
  | 'polyphony-dropped'
  | 'scheduled'
  | 'stale-generation'

export interface SampleInstrumentVoiceScheduleResult {
  readonly outcome: SampleInstrumentVoiceScheduleOutcome
  readonly playbackRate: number | null
  readonly token: SampleInstrumentVoiceToken | null
  readonly zoneId: string | null
}

export type SampleInstrumentVoiceReleaseUpdateOutcome =
  | 'no-change'
  | 'not-found'
  | 'one-shot'
  | 'release-started'
  | 'released-now'
  | 'rescheduled'

export interface SampleInstrumentVoiceReleaseUpdateResult {
  readonly outcome: SampleInstrumentVoiceReleaseUpdateOutcome
  readonly releasePlaybackClockSecond: number | null
}

export interface SampleInstrumentVoiceRuntimeStatistics {
  readonly activeVoiceCount: number
  readonly connectedNodeCount: number
  readonly endedListenerCount: number
  readonly sourceNodeCount: number
}

export interface SampleInstrumentVoicePolyphonyStatistics {
  readonly polyphonyDropCount: number
  readonly retirementVoiceCount: number
  readonly soundingVoiceCount: number
  readonly voiceStealCount: number
}

export interface SampleInstrumentVoiceRuntimeOptions {
  readonly fastReleaseSecond?: number
  readonly output: ActiveWebAudioOutput
  readonly preparedResources: PreparedAudibleMidiSampleResources
}

export type SampleInstrumentVoiceRuntimeErrorCode =
  | 'audio-context-unavailable'
  | 'duplicate-instrument'
  | 'duplicate-resource'
  | 'duplicate-voice-token'
  | 'generation-not-active'
  | 'invalid-configuration'
  | 'invalid-generation'
  | 'invalid-voice-plan'
  | 'missing-instrument'
  | 'missing-resource'
  | 'resource-duration-mismatch'
  | 'unsupported-pitch'
  | 'voice-create-failed'
  | 'disposed'

export class SampleInstrumentVoiceRuntimeError extends Error {
  readonly code: SampleInstrumentVoiceRuntimeErrorCode
  readonly soundbankId: SoundbankId | null

  constructor(
    code: SampleInstrumentVoiceRuntimeErrorCode,
    message: string,
    soundbankId: SoundbankId | null = null,
  ) {
    super(message)
    this.name = 'SampleInstrumentVoiceRuntimeError'
    this.code = code
    this.soundbankId = soundbankId
  }
}

interface PreparedInstrumentIndex {
  readonly manifest: SampleInstrumentManifestV1
  readonly resources: ReadonlyMap<string, LoadedSampleInstrumentResource>
}

interface ActiveSampleVoice {
  readonly audioBuffer: AudioBuffer
  readonly baseGain: number
  readonly gain: GainNode
  readonly key: string
  readonly output: AudioNode
  readonly playbackRate: number
  readonly plan: ScheduledSampleVoicePlan
  readonly sources: Set<ActiveSampleSource>
  readonly startTime: number
  readonly token: SampleInstrumentVoiceToken
  readonly zone: SampleInstrumentZoneV1
  forcedRelease: ActiveSampleVoiceForcedRelease | null
  polyphonyRetired: boolean
  releasePlaybackClockSecond: number
}

interface ActiveSampleVoiceForcedRelease {
  readonly mode: 'fast' | 'normal'
  readonly segment: SampleInstrumentEnvelopeSegmentV1
  readonly startGain: number
  readonly startTime: number
}

interface ActiveSampleSource {
  readonly handleEnded: EventListener
  readonly kind: 'primary' | 'release'
  readonly node: AudioBufferSourceNode
}

type SampleInstrumentVoicePolyphonyAdmission =
  | { readonly kind: 'admit' }
  | { readonly kind: 'drop' }
  | { readonly kind: 'steal'; readonly voice: ActiveSampleVoice }

function fail(
  code: SampleInstrumentVoiceRuntimeErrorCode,
  message: string,
  soundbankId: SoundbankId | null = null,
): never {
  throw new SampleInstrumentVoiceRuntimeError(code, message, soundbankId)
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function voiceKey(token: SampleInstrumentVoiceToken): string {
  return JSON.stringify([token.engineGeneration, token.occurrenceKey])
}

function validateVoiceToken(token: SampleInstrumentVoiceToken): void {
  validateGeneration(token.engineGeneration)
  if (typeof token.occurrenceKey !== 'string' || token.occurrenceKey.trim() === '') {
    fail('invalid-voice-plan', 'Voice Token occurrenceKey must be a nonblank string')
  }
}

function validateGeneration(generation: EngineGeneration): void {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    fail('invalid-generation', 'engineGeneration must be a non-negative safe integer')
  }
}

function validateVoicePlan(plan: ScheduledSampleVoicePlan): void {
  const finiteValues = [
    plan.masterGain,
    plan.pan,
    plan.keyReleasePlaybackClockSecond,
    plan.releasePlaybackClockSecond,
    plan.startPlaybackClockSecond,
    plan.trackGain,
    plan.velocity,
  ]
  if (finiteValues.some((value) => !Number.isFinite(value))) {
    fail('invalid-voice-plan', 'Voice Plan contains a non-finite numeric value', plan.soundbankId)
  }
  if (
    plan.kind !== 'sample-voice' ||
    plan.masterGain < 0 ||
    plan.masterGain > 4 ||
    plan.trackGain < 0 ||
    plan.trackGain > 4 ||
    plan.pan < -1 ||
    plan.pan > 1 ||
    !Number.isInteger(plan.pitch) ||
    plan.pitch < 0 ||
    plan.pitch > 127 ||
    !Number.isInteger(plan.velocity) ||
    plan.velocity < 1 ||
    plan.velocity > 127 ||
    plan.startPlaybackClockSecond < 0 ||
    plan.keyReleasePlaybackClockSecond < 0 ||
    plan.keyReleasePlaybackClockSecond > plan.releasePlaybackClockSecond ||
    (plan.timing === 'on-time' &&
      plan.keyReleasePlaybackClockSecond <= plan.startPlaybackClockSecond) ||
    plan.releasePlaybackClockSecond <= plan.startPlaybackClockSecond
  ) {
    fail('invalid-voice-plan', 'Voice Plan violates the Sample Voice V1 contract', plan.soundbankId)
  }
  validateVoiceToken({
    engineGeneration: plan.engineGeneration,
    occurrenceKey: plan.occurrenceKey,
  })
}

function createInstrumentIndex(
  prepared: PreparedAudibleMidiSampleResources,
): ReadonlyMap<SoundbankId, PreparedInstrumentIndex> {
  const instruments = new Map<SoundbankId, PreparedInstrumentIndex>()
  for (const instrument of prepared.instruments) {
    if (instruments.has(instrument.soundbankId)) {
      fail(
        'duplicate-instrument',
        `Prepared resources repeat ${instrument.soundbankId}`,
        instrument.soundbankId,
      )
    }
    if (instrument.manifest.soundbankId !== instrument.soundbankId) {
      fail(
        'missing-instrument',
        `Prepared Manifest identity does not match ${instrument.soundbankId}`,
        instrument.soundbankId,
      )
    }
    const resources = new Map<string, LoadedSampleInstrumentResource>()
    for (const resource of instrument.resources) {
      if (resources.has(resource.key)) {
        fail(
          'duplicate-resource',
          `${instrument.soundbankId} repeats resource ${resource.key}`,
          instrument.soundbankId,
        )
      }
      resources.set(resource.key, resource)
    }
    instruments.set(
      instrument.soundbankId,
      Object.freeze({ manifest: instrument.manifest, resources }),
    )
  }
  return instruments
}

function requireRunningContext(output: ActiveWebAudioOutput): AudioContext {
  const context = output.audioContext
  if (String(context.state) !== 'running') {
    fail('audio-context-unavailable', `Sample Voice requires a running AudioContext`)
  }
  return context
}

function calculatePlaybackRate(zone: SampleInstrumentZoneV1, pitch: number): number {
  return 2 ** ((pitch - zone.rootMidiPitch + zone.tuneCent / 100) / 12)
}

function assertZoneMatchesResource(
  zone: SampleInstrumentZoneV1,
  resource: LoadedSampleInstrumentResource,
  soundbankId: SoundbankId,
): void {
  const duration = resource.audioBuffer.duration
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    zone.startOffsetSecond >= duration ||
    (zone.loop.kind !== 'none' &&
      (zone.loop.endSecond > duration || zone.startOffsetSecond >= zone.loop.endSecond))
  ) {
    fail(
      'resource-duration-mismatch',
      `${zone.zoneId} timing is outside decoded resource ${resource.key}`,
      soundbankId,
    )
  }
}

function calculateSustainReleaseOffset(
  zone: SampleInstrumentZoneV1,
  playbackRate: number,
  startTime: number,
  releaseTime: number,
): number {
  if (zone.loop.kind !== 'sustain') return zone.startOffsetSecond
  const sourcePosition =
    zone.startOffsetSecond + Math.max(0, releaseTime - startTime) * playbackRate
  if (sourcePosition < zone.loop.endSecond) return sourcePosition
  const loopDuration = zone.loop.endSecond - zone.loop.startSecond
  return zone.loop.startSecond + ((sourcePosition - zone.loop.startSecond) % loopDuration)
}

function calculatePlannedGainAtTime(voice: ActiveSampleVoice, time: number): number {
  if (time <= voice.startTime) return 0
  const attack = voice.zone.amplitudeEnvelope.attack
  const attackElapsed = Math.min(attack.durationSecond, time - voice.startTime)
  let gain =
    attack.durationSecond === 0
      ? voice.baseGain
      : evaluateSampleInstrumentEnvelopeTransition(
          0,
          voice.baseGain,
          attackElapsed / attack.durationSecond,
          attack.curve,
        )

  if (voice.zone.triggerMode === 'gated' && time >= voice.releasePlaybackClockSecond) {
    const release = voice.zone.amplitudeEnvelope.release
    if (release === null || release.durationSecond === 0) return 0
    const attackAtRelease = calculatePlannedGainAtTimeBeforeRelease(
      voice,
      voice.releasePlaybackClockSecond,
    )
    gain = evaluateSampleInstrumentEnvelopeTransition(
      attackAtRelease,
      0,
      Math.min(1, (time - voice.releasePlaybackClockSecond) / release.durationSecond),
      release.curve,
    )
  }
  return gain
}

function calculatePlannedGainAtTimeBeforeRelease(voice: ActiveSampleVoice, time: number): number {
  const attack = voice.zone.amplitudeEnvelope.attack
  if (attack.durationSecond === 0) return voice.baseGain
  return evaluateSampleInstrumentEnvelopeTransition(
    0,
    voice.baseGain,
    Math.min(1, Math.max(0, time - voice.startTime) / attack.durationSecond),
    attack.curve,
  )
}

function calculateEffectiveGainAtTime(voice: ActiveSampleVoice, time: number): number {
  const forcedRelease = voice.forcedRelease
  if (forcedRelease === null || time < forcedRelease.startTime) {
    return calculatePlannedGainAtTime(voice, time)
  }
  if (forcedRelease.segment.durationSecond === 0) return 0
  return evaluateSampleInstrumentEnvelopeTransition(
    forcedRelease.startGain,
    0,
    Math.min(1, (time - forcedRelease.startTime) / forcedRelease.segment.durationSecond),
    forcedRelease.segment.curve,
  )
}

function hasReleaseStartedAtTime(voice: ActiveSampleVoice, time: number): boolean {
  return (
    (voice.forcedRelease !== null && voice.forcedRelease.startTime <= time) ||
    (voice.zone.triggerMode === 'gated' && voice.releasePlaybackClockSecond <= time)
  )
}

function classifyVoiceStealLifecycle(
  voice: ActiveSampleVoice,
  time: number,
): AudioQualityExpressionVoiceLifecycle {
  if (hasReleaseStartedAtTime(voice, time)) return 'release-started'
  // For a gated Voice, this middle state is the CC64 pedal-held interval. One-shot Voices also
  // retain their authored trigger semantics, but become preferable to a Voice whose key is held.
  if (voice.plan.keyReleasePlaybackClockSecond <= time) return 'key-released'
  return 'key-held'
}

function calculatePolyphonyPriorityGain(voice: ActiveSampleVoice, time: number): number {
  // A Voice exactly on its Note On boundary is ranked by intended level, not the zero attack origin.
  return time <= voice.startTime ? voice.baseGain : calculateEffectiveGainAtTime(voice, time)
}

/**
 * Bridges the external playback pipeline into disposable Web Audio voices.
 *
 * The caller supplies an activated Web Audio output, prepared sample resources, Scheduler-produced
 * Voice Plans, and generation or cancellation commands. This runtime resolves each plan against
 * its Manifest, creates and schedules the native audio graph, coordinates Note Off and exclusive
 * group behavior, and owns voice cleanup. It deliberately does not own Project state, resource
 * loading, Transport, Scheduler wake-ups, or the AudioContext lifecycle.
 */
export class SampleInstrumentVoiceRuntime {
  readonly #fastRelease: SampleInstrumentEnvelopeSegmentV1
  readonly #instruments: ReadonlyMap<SoundbankId, PreparedInstrumentIndex>
  readonly #output: ActiveWebAudioOutput
  readonly #voices = new Map<string, ActiveSampleVoice>()
  #activeGeneration: EngineGeneration | null = null
  #disposed = false
  #polyphonyDropCount = 0
  #voiceStealCount = 0

  constructor(options: SampleInstrumentVoiceRuntimeOptions) {
    const fastReleaseSecond =
      options.fastReleaseSecond ?? AUDIO_QUALITY_V1A_RENDER_POLICY.defaultFastReleaseSecond
    if (!Number.isFinite(fastReleaseSecond) || fastReleaseSecond <= 0 || fastReleaseSecond > 0.1) {
      fail('invalid-configuration', 'fastReleaseSecond must be greater than 0 through 0.1 seconds')
    }
    this.#output = options.output
    requireRunningContext(options.output)
    this.#instruments = createInstrumentIndex(options.preparedResources)
    this.#fastRelease = Object.freeze({ curve: null, durationSecond: fastReleaseSecond })
  }

  get activeGeneration(): EngineGeneration | null {
    return this.#activeGeneration
  }

  get statistics(): SampleInstrumentVoiceRuntimeStatistics {
    let sourceNodeCount = 0
    for (const voice of this.#voices.values()) sourceNodeCount += voice.sources.size
    return Object.freeze({
      activeVoiceCount: this.#voices.size,
      connectedNodeCount: sourceNodeCount + this.#voices.size * 2,
      endedListenerCount: sourceNodeCount,
      sourceNodeCount,
    })
  }

  get polyphonyStatistics(): SampleInstrumentVoicePolyphonyStatistics {
    let retirementVoiceCount = 0
    for (const voice of this.#voices.values()) {
      if (voice.polyphonyRetired) retirementVoiceCount += 1
    }
    return Object.freeze({
      polyphonyDropCount: this.#polyphonyDropCount,
      retirementVoiceCount,
      soundingVoiceCount: this.#voices.size - retirementVoiceCount,
      voiceStealCount: this.#voiceStealCount,
    })
  }

  advanceGeneration(generation: EngineGeneration): boolean {
    this.#assertUsable()
    validateGeneration(generation)
    const activeGeneration = this.#activeGeneration
    if (activeGeneration !== null && generation < activeGeneration) {
      fail('invalid-generation', `Cannot advance to stale engineGeneration ${generation}`)
    }
    if (activeGeneration === generation) return false
    this.#activeGeneration = generation
    return true
  }

  schedule(plan: ScheduledSampleVoicePlan): SampleInstrumentVoiceScheduleResult {
    this.#assertUsable()
    validateVoicePlan(plan)
    const activeGeneration = this.#activeGeneration
    if (activeGeneration === null || plan.engineGeneration > activeGeneration) {
      fail(
        'generation-not-active',
        `engineGeneration ${plan.engineGeneration} is not active`,
        plan.soundbankId,
      )
    }
    if (plan.engineGeneration < activeGeneration) {
      return Object.freeze({
        outcome: 'stale-generation',
        playbackRate: null,
        token: null,
        zoneId: null,
      })
    }

    const context = requireRunningContext(this.#output)
    if (plan.releasePlaybackClockSecond <= context.currentTime) {
      return Object.freeze({ outcome: 'expired', playbackRate: null, token: null, zoneId: null })
    }
    const instrument = this.#instruments.get(plan.soundbankId)
    if (instrument === undefined) {
      fail(
        'missing-instrument',
        `No prepared Sample Instrument exists for ${plan.soundbankId}`,
        plan.soundbankId,
      )
    }

    let zone: SampleInstrumentZoneV1 | null
    try {
      zone = findSampleInstrumentZoneForPitch(instrument.manifest, plan.pitch)
    } catch (error) {
      if (error instanceof SampleInstrumentZoneSelectionError) {
        fail('invalid-voice-plan', error.message, plan.soundbankId)
      }
      throw error
    }
    if (zone === null) {
      fail(
        'unsupported-pitch',
        `${plan.soundbankId} does not cover MIDI pitch ${plan.pitch}`,
        plan.soundbankId,
      )
    }
    const resource = instrument.resources.get(zone.resource.key)
    if (resource === undefined) {
      fail(
        'missing-resource',
        `${plan.soundbankId} has no prepared resource ${zone.resource.key}`,
        plan.soundbankId,
      )
    }
    assertZoneMatchesResource(zone, resource, plan.soundbankId)

    const token = Object.freeze({
      engineGeneration: plan.engineGeneration,
      occurrenceKey: plan.occurrenceKey,
    })
    const key = voiceKey(token)
    if (this.#voices.has(key)) {
      fail(
        'duplicate-voice-token',
        `Voice ${plan.occurrenceKey} is already active`,
        plan.soundbankId,
      )
    }

    const startTime = Math.max(plan.startPlaybackClockSecond, context.currentTime)
    const playbackRate = calculatePlaybackRate(zone, plan.pitch)
    const baseGain = calculateAudioQualityV1aVelocityGain(plan.velocity) * plan.trackGain
    const polyphonyAdmission = this.#planPolyphonyAdmission(plan, startTime)
    if (polyphonyAdmission.kind === 'drop') {
      this.#polyphonyDropCount += 1
      return Object.freeze({
        outcome: 'polyphony-dropped',
        playbackRate: null,
        token: null,
        zoneId: null,
      })
    }
    const { gain, output } = this.#createVoiceGainAndOutput(context, plan, startTime)
    const voice: ActiveSampleVoice = {
      audioBuffer: resource.audioBuffer,
      baseGain,
      forcedRelease: null,
      gain,
      key,
      output,
      plan,
      playbackRate,
      polyphonyRetired: false,
      releasePlaybackClockSecond: plan.releasePlaybackClockSecond,
      sources: new Set<ActiveSampleSource>(),
      startTime,
      token,
      zone,
    }

    try {
      this.#voices.set(key, voice)
      this.#scheduleVoiceNodes(voice, resource)
      // Master gain is static plan state, not a per-note future event that may outlive generation.
      this.#output.setMasterGainAtTime(plan.masterGain, context.currentTime)
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      if (error instanceof SampleInstrumentVoiceRuntimeError) throw error
      fail(
        'voice-create-failed',
        `Voice ${plan.occurrenceKey} could not be scheduled: ${errorDetail(error)}`,
        plan.soundbankId,
      )
    }
    try {
      if (polyphonyAdmission.kind === 'steal') {
        this.#retireVoiceForPolyphony(polyphonyAdmission.voice, startTime)
      }
      this.#chokeVoicesFor(voice)
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      throw error
    }

    return Object.freeze({ outcome: 'scheduled', playbackRate, token, zoneId: zone.zoneId })
  }

  cancel(token: SampleInstrumentVoiceToken, atAudioContextSecond?: number): boolean {
    this.#assertUsable()
    validateVoiceToken(token)
    const voice = this.#voices.get(voiceKey(token))
    if (voice === undefined) return false
    return this.#releaseVoice(
      voice,
      atAudioContextSecond ?? this.#output.audioContext.currentTime,
      'fast',
    )
  }

  hasVoice(token: SampleInstrumentVoiceToken): boolean {
    this.#assertUsable()
    validateVoiceToken(token)
    return this.#voices.has(voiceKey(token))
  }

  rescheduleRelease(
    token: SampleInstrumentVoiceToken,
    releasePlaybackClockSecond: number,
  ): SampleInstrumentVoiceReleaseUpdateResult {
    this.#assertUsable()
    validateVoiceToken(token)
    if (!Number.isFinite(releasePlaybackClockSecond) || releasePlaybackClockSecond < 0) {
      fail('invalid-voice-plan', 'Voice release time must be a finite non-negative second')
    }
    const voice = this.#voices.get(voiceKey(token))
    if (voice === undefined) {
      return Object.freeze({ outcome: 'not-found', releasePlaybackClockSecond: null })
    }
    if (voice.zone.triggerMode === 'one-shot') {
      return Object.freeze({
        outcome: 'one-shot',
        releasePlaybackClockSecond: voice.releasePlaybackClockSecond,
      })
    }
    if (releasePlaybackClockSecond <= voice.startTime) {
      fail('invalid-voice-plan', 'Voice release time must remain after its scheduled start')
    }
    if (releasePlaybackClockSecond === voice.releasePlaybackClockSecond) {
      return Object.freeze({
        outcome: 'no-change',
        releasePlaybackClockSecond: voice.releasePlaybackClockSecond,
      })
    }

    const context = requireRunningContext(this.#output)
    if (voice.forcedRelease !== null || context.currentTime >= voice.releasePlaybackClockSecond) {
      return Object.freeze({
        outcome: 'release-started',
        releasePlaybackClockSecond: voice.releasePlaybackClockSecond,
      })
    }
    if (releasePlaybackClockSecond <= context.currentTime) {
      this.#releaseVoice(voice, context.currentTime, 'normal')
      return Object.freeze({
        outcome: 'released-now',
        releasePlaybackClockSecond: context.currentTime,
      })
    }

    this.#reschedulePlannedRelease(voice, releasePlaybackClockSecond)
    return Object.freeze({
      outcome: 'rescheduled',
      releasePlaybackClockSecond,
    })
  }

  allNotesOff(atAudioContextSecond?: number): number {
    this.#assertUsable()
    const releaseTime = atAudioContextSecond ?? this.#output.audioContext.currentTime
    let releasedCount = 0
    let firstFailure: unknown = null
    for (const voice of this.#voices.values()) {
      try {
        if (this.#releaseVoice(voice, releaseTime, 'fast')) releasedCount += 1
      } catch (error) {
        firstFailure ??= error
        this.#stopAndDisconnectVoice(voice)
      }
    }
    if (firstFailure !== null) throw firstFailure
    return releasedCount
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const voice of this.#voices.values()) {
      this.#stopAndDisconnectVoice(voice)
    }
    this.#voices.clear()
    this.#activeGeneration = null
  }

  #assertUsable(): void {
    if (this.#disposed) fail('disposed', 'Sample Instrument Voice Runtime is disposed')
  }

  #reschedulePlannedRelease(
    voice: ActiveSampleVoice,
    nextReleasePlaybackClockSecond: number,
  ): void {
    const previousReleasePlaybackClockSecond = voice.releasePlaybackClockSecond
    const cancellationTime = Math.min(
      previousReleasePlaybackClockSecond,
      nextReleasePlaybackClockSecond,
    )
    const release = voice.zone.amplitudeEnvelope.release
    if (release === null) {
      fail(
        'invalid-voice-plan',
        `${voice.zone.zoneId} is gated without release`,
        voice.plan.soundbankId,
      )
    }

    try {
      voice.gain.gain.cancelAndHoldAtTime(cancellationTime)
      this.#scheduleRemainingAttack(voice, cancellationTime, nextReleasePlaybackClockSecond)
      scheduleSampleInstrumentEnvelopeTransition(
        voice.gain.gain,
        calculatePlannedGainAtTimeBeforeRelease(voice, nextReleasePlaybackClockSecond),
        0,
        nextReleasePlaybackClockSecond,
        release,
      )
      this.#rescheduleSourceRelease(voice, nextReleasePlaybackClockSecond, release.durationSecond)
      voice.releasePlaybackClockSecond = nextReleasePlaybackClockSecond
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      if (error instanceof SampleInstrumentVoiceRuntimeError) throw error
      fail(
        'voice-create-failed',
        `Voice ${voice.plan.occurrenceKey} release could not be rescheduled: ${errorDetail(error)}`,
        voice.plan.soundbankId,
      )
    }
  }

  #scheduleRemainingAttack(voice: ActiveSampleVoice, fromTime: number, throughTime: number): void {
    const attack = voice.zone.amplitudeEnvelope.attack
    const attackEndTime = voice.startTime + attack.durationSecond
    const endTime = Math.min(attackEndTime, throughTime)
    if (attack.durationSecond === 0 || endTime <= fromTime) return

    const remainingFraction = (endTime - fromTime) / attack.durationSecond
    const segmentCount = Math.max(
      1,
      Math.ceil(AUDIO_QUALITY_V1A_RENDER_POLICY.envelopeCurveSegmentCount * remainingFraction),
    )
    for (let index = 1; index <= segmentCount; index += 1) {
      const time = fromTime + (endTime - fromTime) * (index / segmentCount)
      voice.gain.gain.linearRampToValueAtTime(
        calculatePlannedGainAtTimeBeforeRelease(voice, time),
        time,
      )
    }
  }

  #rescheduleSourceRelease(
    voice: ActiveSampleVoice,
    releaseTime: number,
    releaseDurationSecond: number,
  ): void {
    const stopTime =
      releaseTime + releaseDurationSecond + AUDIO_QUALITY_V1A_RENDER_POLICY.sourceStopSafetySecond
    if (voice.zone.loop.kind !== 'sustain' || releaseDurationSecond === 0) {
      // Web Audio applies the latest stop() call while an earlier scheduled stop has not fired.
      for (const source of voice.sources) source.node.stop(stopTime)
      return
    }

    const sourcesBeforeReplacement = Array.from(voice.sources)
    for (const source of sourcesBeforeReplacement) {
      if (source.kind === 'release') {
        this.#discardSource(voice, source)
      } else {
        source.node.stop(releaseTime)
      }
    }
    const releaseSource = this.#createSource(
      voice,
      voice.audioBuffer,
      false,
      releaseTime,
      'release',
    )
    releaseSource.start(
      releaseTime,
      calculateSustainReleaseOffset(voice.zone, voice.playbackRate, voice.startTime, releaseTime),
    )
    releaseSource.stop(stopTime)
  }

  #discardSource(voice: ActiveSampleVoice, source: ActiveSampleSource): void {
    source.node.removeEventListener('ended', source.handleEnded)
    try {
      source.node.stop(this.#output.audioContext.currentTime)
    } catch {
      // A source that has already ended is still detached from the replacement Voice schedule.
    }
    try {
      source.node.disconnect()
    } catch {
      // Detachment stays idempotent for partially scheduled browser nodes.
    }
    voice.sources.delete(source)
  }

  #scheduleVoiceNodes(voice: ActiveSampleVoice, resource: LoadedSampleInstrumentResource): void {
    const { gain, output, plan, releasePlaybackClockSecond: releaseTime, startTime, zone } = voice
    gain.connect(output)
    output.connect(this.#output.masterInput)

    // releaseTime is the compiled final Gate Release. A prior key release under CC64 does not
    // override the Zone's own loop, trigger, or envelope contract.
    const attackLimit =
      zone.triggerMode === 'gated'
        ? Math.max(0, releaseTime - startTime)
        : zone.amplitudeEnvelope.attack.durationSecond
    const gainAtRelease = scheduleSampleInstrumentEnvelopeTransition(
      gain.gain,
      0,
      voice.baseGain,
      startTime,
      zone.amplitudeEnvelope.attack,
      attackLimit,
    )
    if (zone.triggerMode === 'gated') {
      const release = zone.amplitudeEnvelope.release
      if (release === null) {
        fail('invalid-voice-plan', `${zone.zoneId} is gated without release`, plan.soundbankId)
      }
      scheduleSampleInstrumentEnvelopeTransition(gain.gain, gainAtRelease, 0, releaseTime, release)
    }

    const source = this.#createSource(voice, resource.audioBuffer)
    source.start(startTime, zone.startOffsetSecond)

    if (zone.triggerMode === 'one-shot') return
    const release = zone.amplitudeEnvelope.release
    if (release === null) return
    const releaseEndTime = releaseTime + release.durationSecond
    if (zone.loop.kind === 'sustain' && release.durationSecond > 0) {
      source.stop(releaseTime)
      const releaseSource = this.#createSource(
        voice,
        resource.audioBuffer,
        false,
        releaseTime,
        'release',
      )
      releaseSource.start(
        releaseTime,
        calculateSustainReleaseOffset(zone, voice.playbackRate, startTime, releaseTime),
      )
      releaseSource.stop(releaseEndTime + AUDIO_QUALITY_V1A_RENDER_POLICY.sourceStopSafetySecond)
      return
    }
    source.stop(releaseEndTime + AUDIO_QUALITY_V1A_RENDER_POLICY.sourceStopSafetySecond)
  }

  #createSource(
    voice: ActiveSampleVoice,
    audioBuffer: AudioBuffer,
    useZoneLoop = true,
    playbackRateTime = voice.startTime,
    kind: ActiveSampleSource['kind'] = 'primary',
  ): AudioBufferSourceNode {
    const source = this.#output.audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.playbackRate.setValueAtTime(voice.playbackRate, playbackRateTime)
    if (useZoneLoop && voice.zone.loop.kind !== 'none') {
      source.loop = true
      source.loopStart = voice.zone.loop.startSecond
      source.loopEnd = voice.zone.loop.endSecond
    }
    source.connect(voice.gain)
    const handleEnded: EventListener = () => {
      source.removeEventListener('ended', handleEnded)
      try {
        source.disconnect()
      } catch {
        // The source can already be detached by an explicit runtime cleanup.
      }
      voice.sources.delete(activeSource)
      if (voice.sources.size === 0) this.#finishVoice(voice)
    }
    const activeSource = Object.freeze({ handleEnded, kind, node: source })
    voice.sources.add(activeSource)
    source.addEventListener('ended', handleEnded, { once: true })
    return source
  }

  #createVoiceOutput(context: AudioContext, pan: number, startTime: number): AudioNode {
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner()
      panner.pan.setValueAtTime(pan, startTime)
      return panner
    }
    if (pan !== 0) {
      fail('audio-context-unavailable', 'Stereo panning is unavailable in this AudioContext')
    }
    // Capability fallback preserves centered output without inventing a different pan law.
    return context.createGain()
  }

  #createVoiceGainAndOutput(
    context: AudioContext,
    plan: ScheduledSampleVoicePlan,
    startTime: number,
  ): { readonly gain: GainNode; readonly output: AudioNode } {
    let gain: GainNode | null = null
    try {
      gain = context.createGain()
      return Object.freeze({
        gain,
        output: this.#createVoiceOutput(context, plan.pan, startTime),
      })
    } catch (error) {
      try {
        gain?.disconnect()
      } catch {
        // A partially created node has no live graph ownership, but cleanup stays defensive.
      }
      if (error instanceof SampleInstrumentVoiceRuntimeError) throw error
      fail(
        'voice-create-failed',
        `Voice ${plan.occurrenceKey} output could not be created: ${errorDetail(error)}`,
        plan.soundbankId,
      )
    }
  }

  #planPolyphonyAdmission(
    plan: ScheduledSampleVoicePlan,
    startTime: number,
  ): SampleInstrumentVoicePolyphonyAdmission {
    const soundingVoices = [...this.#voices.values()].filter((voice) => !voice.polyphonyRetired)
    const instrumentSoundingVoiceCount = soundingVoices.reduce(
      (count, voice) => count + Number(voice.plan.instrumentDeviceId === plan.instrumentDeviceId),
      0,
    )
    const instrumentLimitReached =
      instrumentSoundingVoiceCount >=
      AUDIO_QUALITY_V1A_RENDER_POLICY.maximumInstrumentSoundingVoiceCount
    const runtimeLimitReached =
      soundingVoices.length >= AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRuntimeSoundingVoiceCount
    if (!instrumentLimitReached && !runtimeLimitReached) return Object.freeze({ kind: 'admit' })

    const retirementVoiceCount = this.#voices.size - soundingVoices.length
    if (retirementVoiceCount >= AUDIO_QUALITY_V1A_RENDER_POLICY.maximumRetirementVoiceCount) {
      return Object.freeze({ kind: 'drop' })
    }
    const eligibleVoices = instrumentLimitReached
      ? soundingVoices.filter((voice) => voice.plan.instrumentDeviceId === plan.instrumentDeviceId)
      : soundingVoices
    const selectedVoice = selectSampleInstrumentVoiceStealCandidate(
      eligibleVoices.map((voice) =>
        Object.freeze({
          effectiveGain: calculatePolyphonyPriorityGain(voice, startTime),
          lifecycle: classifyVoiceStealLifecycle(voice, startTime),
          stableToken: voice.key,
          startTime: voice.startTime,
          value: voice,
        }),
      ),
    )
    return selectedVoice === null
      ? Object.freeze({ kind: 'drop' })
      : Object.freeze({ kind: 'steal', voice: selectedVoice })
  }

  #retireVoiceForPolyphony(voice: ActiveSampleVoice, releaseTime: number): void {
    if (voice.polyphonyRetired) return
    this.#releaseVoice(voice, releaseTime, 'fast')
    // A retired Voice stays owned until its fast-release source ends; it no longer consumes a
    // sounding slot, and the independent tail limit prevents unbounded overlap.
    voice.polyphonyRetired = true
    this.#voiceStealCount += 1
  }

  #chokeVoicesFor(newVoice: ActiveSampleVoice): void {
    const groupId = newVoice.zone.exclusiveGroup?.groupId
    if (groupId === undefined) return
    for (const voice of this.#voices.values()) {
      if (voice === newVoice || voice.zone.exclusiveGroup?.offByGroupId !== groupId) continue
      try {
        this.#releaseVoice(voice, newVoice.startTime, voice.zone.exclusiveGroup.offMode)
      } catch (error) {
        // Keep the new voice valid, but surface a deterministic cleanup failure to diagnostics.
        this.#stopAndDisconnectVoice(voice)
        if (error instanceof SampleInstrumentVoiceRuntimeError) throw error
        fail(
          'voice-create-failed',
          `Voice ${voice.plan.occurrenceKey} could not be choked: ${errorDetail(error)}`,
          voice.plan.soundbankId,
        )
      }
    }
  }

  #releaseVoice(voice: ActiveSampleVoice, requestedTime: number, mode: 'fast' | 'normal'): boolean {
    if (!Number.isFinite(requestedTime) || requestedTime < 0) {
      fail('invalid-voice-plan', 'Voice release time must be a finite non-negative second')
    }
    const context = this.#output.audioContext
    if (String(context.state) !== 'running') {
      this.#stopAndDisconnectVoice(voice)
      return true
    }
    const releaseTime = Math.max(requestedTime, context.currentTime)
    const normalRelease = voice.zone.amplitudeEnvelope.release
    let releaseMode: ActiveSampleVoiceForcedRelease['mode'] = 'fast'
    let release = this.#fastRelease
    if (mode === 'normal' && normalRelease !== null) {
      releaseMode = 'normal'
      release = normalRelease
    }
    const previousForcedRelease = voice.forcedRelease
    if (
      previousForcedRelease !== null &&
      releaseTime >= previousForcedRelease.startTime &&
      !(releaseMode === 'fast' && previousForcedRelease.mode === 'normal')
    ) {
      return false
    }

    const startGain = calculateEffectiveGainAtTime(voice, releaseTime)
    try {
      voice.gain.gain.cancelAndHoldAtTime(releaseTime)
      scheduleSampleInstrumentEnvelopeTransition(
        voice.gain.gain,
        startGain,
        0,
        releaseTime,
        release,
      )
      const stopTime =
        releaseTime +
        release.durationSecond +
        AUDIO_QUALITY_V1A_RENDER_POLICY.sourceStopSafetySecond
      if (
        releaseMode === 'normal' &&
        voice.zone.loop.kind === 'sustain' &&
        release.durationSecond > 0 &&
        releaseTime >= voice.startTime &&
        releaseTime < voice.releasePlaybackClockSecond
      ) {
        const sourcesBeforeRelease = [...voice.sources]
        for (const source of sourcesBeforeRelease) source.node.stop(releaseTime)
        const releaseSource = this.#createSource(
          voice,
          voice.audioBuffer,
          false,
          releaseTime,
          'release',
        )
        releaseSource.start(
          releaseTime,
          calculateSustainReleaseOffset(
            voice.zone,
            voice.playbackRate,
            voice.startTime,
            releaseTime,
          ),
        )
        releaseSource.stop(stopTime)
      } else {
        for (const source of voice.sources) source.node.stop(stopTime)
      }
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      if (error instanceof SampleInstrumentVoiceRuntimeError) throw error
      fail(
        'voice-create-failed',
        `Voice ${voice.plan.occurrenceKey} release could not be scheduled: ${errorDetail(error)}`,
        voice.plan.soundbankId,
      )
    }
    voice.forcedRelease = Object.freeze({
      mode: releaseMode,
      segment: release,
      startGain,
      startTime: releaseTime,
    })
    return true
  }

  #finishVoice(voice: ActiveSampleVoice): void {
    if (this.#voices.get(voice.key) !== voice) return
    this.#disconnectVoice(voice)
  }

  #disconnectVoice(voice: ActiveSampleVoice): void {
    for (const source of voice.sources) {
      source.node.removeEventListener('ended', source.handleEnded)
      try {
        source.node.disconnect()
      } catch {
        // Cleanup remains idempotent when a partial graph failed before connection.
      }
    }
    voice.sources.clear()
    try {
      voice.gain.disconnect()
    } catch {
      // Cleanup remains idempotent when a partial graph failed before connection.
    }
    try {
      voice.output.disconnect()
    } catch {
      // Cleanup remains idempotent when a partial graph failed before connection.
    }
    if (this.#voices.get(voice.key) === voice) this.#voices.delete(voice.key)
  }

  #stopAndDisconnectVoice(voice: ActiveSampleVoice): void {
    for (const source of voice.sources) {
      try {
        source.node.stop()
      } catch {
        // An already-ended source is detached with the rest of the failed or disposed graph.
      }
    }
    this.#disconnectVoice(voice)
  }
}
