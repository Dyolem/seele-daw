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
  type SampleInstrumentVoiceRuntimeStatistics,
} from '#internal/sample-instrument/voice/voice-runtime'

export interface AudioQualityAq0OfflineRenderResult {
  readonly channels: readonly Float32Array[]
  readonly runtimeStatisticsAfterDispose: SampleInstrumentVoiceRuntimeStatistics
  readonly runtimeStatisticsAfterRender: SampleInstrumentVoiceRuntimeStatistics
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

export async function renderAudioQualityAq0Plans(
  plans: readonly ScheduledSampleVoicePlan[],
): Promise<AudioQualityAq0OfflineRenderResult> {
  if (plans.length === 0) throw new TypeError('AQ0 offline render requires at least one Voice Plan')
  const OfflineAudioContextConstructor = requireOfflineAudioContextConstructor()
  const context = new OfflineAudioContextConstructor(
    2,
    audioQualitySecondToFrame(AUDIO_QUALITY_AQ0_RENDER_DURATION_SECOND),
    AUDIO_QUALITY_AQ0_SAMPLE_RATE_HZ,
  )
  const contextAdapter = createOfflineRuntimeContextAdapter(context)
  const runtime = new SampleInstrumentVoiceRuntime({
    output: createOutput(context, contextAdapter.audioContext),
    preparedResources: createAudioQualityPreparedResources(
      createAudioQualityReferenceSineBuffer(context),
    ),
  })
  try {
    runtime.advanceGeneration(1 as ScheduledSampleVoicePlan['engineGeneration'])
    for (const plan of plans) {
      const result = runtime.schedule(plan)
      if (result.outcome !== 'scheduled') {
        throw new TypeError(`AQ0 Voice was not scheduled: ${result.outcome}`)
      }
    }

    const renderRequest = context.startRendering()
    contextAdapter.finishScheduling()
    const rendered = await renderRequest
    await Promise.resolve()
    const runtimeStatisticsAfterRender = runtime.statistics
    runtime.dispose()
    return Object.freeze({
      channels: collectChannels(rendered),
      runtimeStatisticsAfterDispose: runtime.statistics,
      runtimeStatisticsAfterRender,
    })
  } catch (error) {
    contextAdapter.finishScheduling()
    runtime.dispose()
    throw error
  }
}
