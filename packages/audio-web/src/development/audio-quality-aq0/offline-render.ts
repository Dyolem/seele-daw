import type { ScheduledSampleVoicePlan } from '@seele-daw/playback'

import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import type { ActiveWebAudioOutput } from '#internal/context/audio-context-runtime'
import {
  AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND,
  AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  audioQualitySecondToFrame,
  createAudioQualityPreparedResources,
  createAudioQualityReferenceSineBuffer,
} from '#internal/development/audio-quality-aq0/fixture'
import {
  SampleInstrumentVoiceRuntime,
  type SampleInstrumentVoicePolyphonyStatistics,
  type SampleInstrumentVoiceScheduleOutcome,
  type SampleInstrumentVoiceScheduleResult,
  type SampleInstrumentVoiceRuntimeStatistics,
} from '#internal/sample-instrument/voice/voice-runtime'
import type { PreparedAudibleMidiSampleResources } from '#internal/sample-instrument/loading/prepare-plan-resources'

export interface AudioQualityOfflineRenderResult {
  readonly channels: readonly Float32Array[]
  readonly polyphonyStatisticsAfterDispose: SampleInstrumentVoicePolyphonyStatistics
  readonly polyphonyStatisticsAfterRender: SampleInstrumentVoicePolyphonyStatistics
  readonly polyphonyStatisticsAfterSchedule: SampleInstrumentVoicePolyphonyStatistics
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
  readonly scheduleResults: readonly SampleInstrumentVoiceScheduleResult[]
}

export interface AudioQualityOfflineRenderOptions {
  readonly acceptedScheduleOutcomes?: readonly SampleInstrumentVoiceScheduleOutcome[]
  readonly createPreparedResources: (
    context: OfflineAudioContext,
  ) => PreparedAudibleMidiSampleResources
  readonly onScheduled?: (
    runtime: SampleInstrumentVoiceRuntime,
    results: readonly SampleInstrumentVoiceScheduleResult[],
  ) => void
  readonly plans: readonly ScheduledSampleVoicePlan[]
  readonly renderDurationSecond: number
}

interface OfflineRuntimeContextAdapter {
  readonly audioContext: AudioContext
  finishScheduling(): void
}

function requireOfflineAudioContextConstructor(): typeof OfflineAudioContext {
  const Constructor = globalThis.OfflineAudioContext
  if (Constructor === undefined) {
    throw new TypeError('OfflineAudioContext is unavailable in this browser')
  }
  return Constructor
}

function createOfflineRuntimeContextAdapter(
  context: OfflineAudioContext,
): OfflineRuntimeContextAdapter {
  // OfflineAudioContext is suspended before startRendering(); only its scheduling view is adapted.
  // Native node creation, automation, rendering, and the resulting PCM stay on the real context.
  let scheduling = true
  const audioContext = new Proxy(context, {
    get(target, property) {
      if (property === 'state' && scheduling) return 'running'
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as unknown as AudioContext
  return Object.freeze({
    audioContext,
    finishScheduling: () => {
      scheduling = false
    },
  })
}

function createOutput(
  context: OfflineAudioContext,
  runtimeAudioContext: AudioContext,
): ActiveWebAudioOutput {
  const projectMaster = context.createGain()
  const outputCalibration = context.createGain()
  projectMaster.gain.setValueAtTime(1, 0)
  outputCalibration.gain.setValueAtTime(AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain, 0)
  projectMaster.connect(outputCalibration)
  outputCalibration.connect(context.destination)
  return Object.freeze({
    audioContext: runtimeAudioContext,
    masterInput: projectMaster,
    setMasterGainAtTime: (gain: number, audioContextSecond: number) => {
      projectMaster.gain.setValueAtTime(gain, audioContextSecond)
    },
  })
}

function collectChannels(buffer: AudioBuffer): readonly Float32Array[] {
  return Object.freeze(
    Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel)),
  )
}

export async function renderAudioQualityPlans(
  options: AudioQualityOfflineRenderOptions,
): Promise<AudioQualityOfflineRenderResult> {
  const { plans } = options
  if (plans.length === 0) {
    throw new TypeError('Audio Quality offline render requires at least one Voice Plan')
  }
  if (!Number.isFinite(options.renderDurationSecond) || options.renderDurationSecond <= 0) {
    throw new TypeError('Audio Quality render duration must be a finite positive second')
  }
  const OfflineAudioContextConstructor = requireOfflineAudioContextConstructor()
  const context = new OfflineAudioContextConstructor(
    2,
    audioQualitySecondToFrame(options.renderDurationSecond),
    AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  )
  const contextAdapter = createOfflineRuntimeContextAdapter(context)
  const runtime = new SampleInstrumentVoiceRuntime({
    output: createOutput(context, contextAdapter.audioContext),
    preparedResources: options.createPreparedResources(context),
  })
  try {
    runtime.advanceGeneration(1 as ScheduledSampleVoicePlan['engineGeneration'])
    const results: SampleInstrumentVoiceScheduleResult[] = []
    const acceptedScheduleOutcomes = options.acceptedScheduleOutcomes ?? ['scheduled']
    for (const plan of plans) {
      const result = runtime.schedule(plan)
      if (!acceptedScheduleOutcomes.includes(result.outcome)) {
        throw new TypeError(`Audio Quality Voice was not scheduled: ${result.outcome}`)
      }
      results.push(result)
    }
    const scheduleResults = Object.freeze(results)
    options.onScheduled?.(runtime, scheduleResults)
    const polyphonyStatisticsAfterSchedule = runtime.polyphonyStatistics

    const renderRequest = context.startRendering()
    contextAdapter.finishScheduling()
    const rendered = await renderRequest
    await Promise.resolve()
    const polyphonyStatisticsAfterRender = runtime.polyphonyStatistics
    const runtimeStatisticsAfterRender = runtime.statistics
    runtime.dispose()
    return Object.freeze({
      channels: collectChannels(rendered),
      polyphonyStatisticsAfterDispose: runtime.polyphonyStatistics,
      polyphonyStatisticsAfterRender,
      polyphonyStatisticsAfterSchedule,
      runtimeStatisticsAfterDispose: runtime.statistics,
      runtimeStatisticsAfterRender,
      scheduleResults,
    })
  } catch (error) {
    contextAdapter.finishScheduling()
    runtime.dispose()
    throw error
  }
}

export function renderAudioQualityAq0Plans(
  plans: readonly ScheduledSampleVoicePlan[],
): Promise<AudioQualityOfflineRenderResult> {
  return renderAudioQualityPlans({
    createPreparedResources: (context) =>
      createAudioQualityPreparedResources(createAudioQualityReferenceSineBuffer(context)),
    plans,
    renderDurationSecond: AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND,
  })
}
