import type { PlaybackVoice, ScheduledSampleVoicePlan } from '@seele-daw/playback'

import {
  SAMPLE_VOICE_POLICY,
  velocityGain,
  type SampleVoiceLifecycle,
} from '#internal/sample-instrument/voice/sample-voice-policy'
import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import type {
  SampleInstrumentEnvelopeSegmentV1,
  SampleInstrumentManifestV1,
  SampleInstrumentZoneV1,
} from '#internal/sample-instrument/contract/manifest'
import type { LoadedSampleInstrumentResource } from '#internal/sample-instrument/loading/resource-cache'
import { findSampleInstrumentZoneForPitch } from '#internal/sample-instrument/loading/zone-selection'
import {
  evaluateSampleInstrumentEnvelopeTransition,
  scheduleSampleInstrumentEnvelopeTransition,
} from '#internal/sample-instrument/voice/envelope'
import { selectSampleInstrumentVoiceStealCandidate } from '#internal/sample-instrument/voice/polyphony-policy'

/** What a voice plays: an instrument's Manifest and the decoded resources its zones use. */
export interface SampleInstrument {
  readonly manifest: SampleInstrumentManifestV1
  readonly resources: ReadonlyMap<string, LoadedSampleInstrumentResource>
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
  readonly output: ActiveWebAudioOutput
}

const FAST_RELEASE = Object.freeze<SampleInstrumentEnvelopeSegmentV1>({
  curve: null,
  durationSecond: SAMPLE_VOICE_POLICY.defaultFastReleaseSecond,
})

interface ActiveSampleVoice {
  readonly audioBuffer: AudioBuffer
  readonly baseGain: number
  readonly gain: GainNode
  readonly output: AudioNode
  readonly playbackRate: number
  readonly plan: ScheduledSampleVoicePlan
  readonly sources: Set<ActiveSampleSource>
  /** Breaks polyphony ties in scheduling order. */
  readonly stableToken: string
  readonly startTime: number
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

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function calculatePlaybackRate(zone: SampleInstrumentZoneV1, pitch: number): number {
  return 2 ** ((pitch - zone.rootMidiPitch + zone.tuneCent / 100) / 12)
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
    // A gated zone always has a release; the Manifest validator rejects one without.
    const release = voice.zone.amplitudeEnvelope.release!
    if (release.durationSecond === 0) return 0
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

function classifyVoiceStealLifecycle(voice: ActiveSampleVoice, time: number): SampleVoiceLifecycle {
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
 * Plays sample voices on one Web Audio output. Voices of every plan revision share it, so the
 * polyphony limits and all-notes-off cover all of them. Each voice resolves its plan against the
 * instrument's Manifest, schedules its own native graph, and disconnects it once it has ended.
 */
export class SampleInstrumentVoiceRuntime {
  readonly #output: ActiveWebAudioOutput
  readonly #voices = new Set<ActiveSampleVoice>()
  #masterGain: number | null = null
  #disposed = false
  #polyphonyDropCount = 0
  #scheduledCount = 0
  #voiceStealCount = 0

  constructor(options: SampleInstrumentVoiceRuntimeOptions) {
    this.#output = options.output
  }

  get statistics(): SampleInstrumentVoiceRuntimeStatistics {
    let sourceNodeCount = 0
    for (const voice of this.#voices) sourceNodeCount += voice.sources.size
    return Object.freeze({
      activeVoiceCount: this.#voices.size,
      connectedNodeCount: sourceNodeCount + this.#voices.size * 2,
      endedListenerCount: sourceNodeCount,
      sourceNodeCount,
    })
  }

  get polyphonyStatistics(): SampleInstrumentVoicePolyphonyStatistics {
    let retirementVoiceCount = 0
    for (const voice of this.#voices) {
      if (voice.polyphonyRetired) retirementVoiceCount += 1
    }
    return Object.freeze({
      polyphonyDropCount: this.#polyphonyDropCount,
      retirementVoiceCount,
      soundingVoiceCount: this.#voices.size - retirementVoiceCount,
      voiceStealCount: this.#voiceStealCount,
    })
  }

  /**
   * Starts one voice of `instrument`. Returns null when the voice would already have ended, the
   * instrument has no zone for its pitch, or the polyphony limits drop it.
   */
  schedule(plan: ScheduledSampleVoicePlan, instrument: SampleInstrument): PlaybackVoice | null {
    if (this.#disposed) throw new Error('Sample voices are disposed')
    const context = this.#runningContext()
    if (plan.releasePlaybackClockSecond <= context.currentTime) return null

    const zone = findSampleInstrumentZoneForPitch(instrument.manifest, plan.pitch)
    if (zone === null) return null
    const resource = instrument.resources.get(zone.resource.key)
    if (resource === undefined) {
      throw new Error(`${plan.soundbankId} has no loaded resource ${zone.resource.key}`)
    }

    const startTime = Math.max(plan.startPlaybackClockSecond, context.currentTime)
    const playbackRate = calculatePlaybackRate(zone, plan.pitch)
    const baseGain = velocityGain(plan.velocity) * plan.trackGain
    const polyphonyAdmission = this.#planPolyphonyAdmission(plan, startTime)
    if (polyphonyAdmission.kind === 'drop') {
      this.#polyphonyDropCount += 1
      return null
    }
    const { gain, output } = this.#createVoiceGainAndOutput(context, plan, startTime)
    this.#scheduledCount += 1
    const voice: ActiveSampleVoice = {
      audioBuffer: resource.audioBuffer,
      baseGain,
      forcedRelease: null,
      gain,
      output,
      plan,
      playbackRate,
      polyphonyRetired: false,
      releasePlaybackClockSecond: plan.releasePlaybackClockSecond,
      sources: new Set<ActiveSampleSource>(),
      stableToken: String(this.#scheduledCount).padStart(16, '0'),
      startTime,
      zone,
    }

    try {
      this.#voices.add(voice)
      this.#scheduleVoiceNodes(voice, resource)
      // The master gain belongs to the plan; it only moves when a plan with another one plays.
      if (this.#masterGain !== plan.masterGain) {
        this.#output.setMasterGainAtTime(plan.masterGain, context.currentTime)
        this.#masterGain = plan.masterGain
      }
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      throw new Error(`Voice ${plan.occurrenceKey} could not be scheduled: ${errorDetail(error)}`, {
        cause: error,
      })
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

    return Object.freeze({
      cancel: (atPlaybackClockSecond?: number) => {
        if (!this.#voices.has(voice)) return
        this.#releaseVoice(voice, atPlaybackClockSecond ?? context.currentTime, 'fast')
      },
      isActive: () => this.#voices.has(voice),
      rescheduleRelease: (releasePlaybackClockSecond: number) => {
        this.#rescheduleRelease(voice, releasePlaybackClockSecond)
      },
    })
  }

  /** Fades out every voice from the given time, or now. */
  allNotesOff(atAudioContextSecond?: number): void {
    if (this.#disposed) return
    const releaseTime = atAudioContextSecond ?? this.#output.audioContext.currentTime
    let firstFailure: unknown = null
    for (const voice of this.#voices) {
      try {
        this.#releaseVoice(voice, releaseTime, 'fast')
      } catch (error) {
        firstFailure ??= error
        this.#stopAndDisconnectVoice(voice)
      }
    }
    if (firstFailure !== null) throw firstFailure
  }

  /** Stops every voice at once and disconnects its graph. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const voice of this.#voices) this.#stopAndDisconnectVoice(voice)
    this.#voices.clear()
  }

  #rescheduleRelease(voice: ActiveSampleVoice, releasePlaybackClockSecond: number): void {
    if (!this.#voices.has(voice) || voice.zone.triggerMode === 'one-shot') return
    if (releasePlaybackClockSecond === voice.releasePlaybackClockSecond) return

    const context = this.#runningContext()
    if (voice.forcedRelease !== null || context.currentTime >= voice.releasePlaybackClockSecond) {
      return
    }
    if (releasePlaybackClockSecond <= context.currentTime) {
      this.#releaseVoice(voice, context.currentTime, 'normal')
      return
    }
    this.#reschedulePlannedRelease(voice, releasePlaybackClockSecond)
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
    // A gated zone always has a release; the Manifest validator rejects one without.
    const release = voice.zone.amplitudeEnvelope.release!

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
      this.#endSourcesAt(
        voice,
        nextReleasePlaybackClockSecond,
        release.durationSecond,
        voice.zone.loop.kind === 'sustain',
      )
      voice.releasePlaybackClockSecond = nextReleasePlaybackClockSecond
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      throw new Error(
        `Voice ${voice.plan.occurrenceKey} release could not be rescheduled: ${errorDetail(error)}`,
        { cause: error },
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
      Math.ceil(SAMPLE_VOICE_POLICY.envelopeCurveSegmentCount * remainingFraction),
    )
    for (let index = 1; index <= segmentCount; index += 1) {
      const time = fromTime + (endTime - fromTime) * (index / segmentCount)
      voice.gain.gain.linearRampToValueAtTime(
        calculatePlannedGainAtTimeBeforeRelease(voice, time),
        time,
      )
    }
  }

  /**
   * Stops the voice's sources once a release of `durationSecond` from `time` has ended. With
   * `leaveSustainLoop`, a sustain loop instead leaves its loop at `time`: an unlooped tail source
   * continues from the same position, and a tail planned for a later release never starts.
   */
  #endSourcesAt(
    voice: ActiveSampleVoice,
    time: number,
    durationSecond: number,
    leaveSustainLoop: boolean,
  ): void {
    const stopTime = time + durationSecond + SAMPLE_VOICE_POLICY.sourceStopSafetySecond
    if (!leaveSustainLoop || durationSecond === 0) {
      // Web Audio applies the latest stop() call while an earlier scheduled stop has not fired.
      for (const source of voice.sources) source.node.stop(stopTime)
      return
    }
    for (const source of voice.sources) {
      if (source.kind === 'release') this.#discardSource(voice, source)
      else source.node.stop(time)
    }
    const tail = this.#createSource(voice, voice.audioBuffer, false, time, 'release')
    tail.start(
      time,
      calculateSustainReleaseOffset(voice.zone, voice.playbackRate, voice.startTime, time),
    )
    tail.stop(stopTime)
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
    const { gain, output, releasePlaybackClockSecond: releaseTime, startTime, zone } = voice
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
    // One-shot zones ignore the Note length: they end with their sample or a forced release.
    const release = zone.triggerMode === 'gated' ? zone.amplitudeEnvelope.release! : null
    if (release !== null) {
      scheduleSampleInstrumentEnvelopeTransition(gain.gain, gainAtRelease, 0, releaseTime, release)
    }

    const source = this.#createSource(voice, resource.audioBuffer)
    source.start(startTime, zone.startOffsetSecond)
    if (release !== null) {
      this.#endSourcesAt(voice, releaseTime, release.durationSecond, zone.loop.kind === 'sustain')
    }
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
      if (voice.sources.size === 0) this.#disconnectVoice(voice)
    }
    const activeSource = Object.freeze({ handleEnded, kind, node: source })
    voice.sources.add(activeSource)
    source.addEventListener('ended', handleEnded, { once: true })
    return source
  }

  #createVoiceOutput(context: BaseAudioContext, pan: number, startTime: number): AudioNode {
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner()
      panner.pan.setValueAtTime(pan, startTime)
      return panner
    }
    if (pan !== 0) throw new Error('Stereo panning is unavailable in this AudioContext')
    // Capability fallback preserves centered output without inventing a different pan law.
    return context.createGain()
  }

  #createVoiceGainAndOutput(
    context: BaseAudioContext,
    plan: ScheduledSampleVoicePlan,
    startTime: number,
  ): { readonly gain: GainNode; readonly output: AudioNode } {
    const gain = context.createGain()
    try {
      return Object.freeze({ gain, output: this.#createVoiceOutput(context, plan.pan, startTime) })
    } catch (error) {
      gain.disconnect()
      throw error
    }
  }

  #planPolyphonyAdmission(
    plan: ScheduledSampleVoicePlan,
    startTime: number,
  ): SampleInstrumentVoicePolyphonyAdmission {
    const soundingVoices = [...this.#voices].filter((voice) => !voice.polyphonyRetired)
    const instrumentSoundingVoiceCount = soundingVoices.reduce(
      (count, voice) => count + Number(voice.plan.instrumentDeviceId === plan.instrumentDeviceId),
      0,
    )
    const instrumentLimitReached =
      instrumentSoundingVoiceCount >= SAMPLE_VOICE_POLICY.maximumInstrumentSoundingVoiceCount
    const runtimeLimitReached =
      soundingVoices.length >= SAMPLE_VOICE_POLICY.maximumRuntimeSoundingVoiceCount
    if (!instrumentLimitReached && !runtimeLimitReached) return Object.freeze({ kind: 'admit' })

    const retirementVoiceCount = this.#voices.size - soundingVoices.length
    if (retirementVoiceCount >= SAMPLE_VOICE_POLICY.maximumRetirementVoiceCount) {
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
          stableToken: voice.stableToken,
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
    for (const voice of this.#voices) {
      if (voice === newVoice || voice.zone.exclusiveGroup?.offByGroupId !== groupId) continue
      try {
        this.#releaseVoice(voice, newVoice.startTime, voice.zone.exclusiveGroup.offMode)
      } catch (error) {
        // Keep the new voice valid, but surface a deterministic cleanup failure to diagnostics.
        this.#stopAndDisconnectVoice(voice)
        throw new Error(
          `Voice ${voice.plan.occurrenceKey} could not be choked: ${errorDetail(error)}`,
          { cause: error },
        )
      }
    }
  }

  /** Starts a forced release, unless an earlier one already covers it. */
  #releaseVoice(voice: ActiveSampleVoice, requestedTime: number, mode: 'fast' | 'normal'): void {
    if (!this.#output.isRunning()) {
      this.#stopAndDisconnectVoice(voice)
      return
    }
    const releaseTime = Math.max(requestedTime, this.#output.audioContext.currentTime)
    const normalRelease = mode === 'normal' ? voice.zone.amplitudeEnvelope.release : null
    const releaseMode: ActiveSampleVoiceForcedRelease['mode'] =
      normalRelease === null ? 'fast' : 'normal'
    const release = normalRelease ?? FAST_RELEASE
    const previousForcedRelease = voice.forcedRelease
    if (
      previousForcedRelease !== null &&
      releaseTime >= previousForcedRelease.startTime &&
      !(releaseMode === 'fast' && previousForcedRelease.mode === 'normal')
    ) {
      return
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
      // Only the zone's own release of a voice still in its sustain loop moves to the tail.
      this.#endSourcesAt(
        voice,
        releaseTime,
        release.durationSecond,
        releaseMode === 'normal' &&
          voice.zone.loop.kind === 'sustain' &&
          releaseTime >= voice.startTime &&
          releaseTime < voice.releasePlaybackClockSecond,
      )
    } catch (error) {
      this.#stopAndDisconnectVoice(voice)
      throw new Error(
        `Voice ${voice.plan.occurrenceKey} release could not be scheduled: ${errorDetail(error)}`,
        { cause: error },
      )
    }
    voice.forcedRelease = Object.freeze({
      mode: releaseMode,
      segment: release,
      startGain,
      startTime: releaseTime,
    })
  }

  #runningContext(): BaseAudioContext {
    if (!this.#output.isRunning()) throw new Error('Sample voices need a running audio output')
    return this.#output.audioContext
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
    this.#voices.delete(voice)
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
