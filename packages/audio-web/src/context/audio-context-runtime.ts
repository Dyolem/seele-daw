import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'

export type WebAudioContextRuntimeState =
  | 'closed'
  | 'disposed'
  | 'dormant'
  | 'interrupted'
  | 'running'
  | 'suspended'
  | 'unknown'

export interface WebAudioContextRuntimeStatistics {
  readonly audioContextCreated: boolean
  readonly masterNodeCount: number
  readonly outputCalibrationNodeCount: number
  readonly state: WebAudioContextRuntimeState
}

export interface ActiveWebAudioOutput {
  readonly audioContext: AudioContext
  readonly masterInput: AudioNode
  setMasterGainAtTime(gain: number, audioContextSecond: number): void
}

export interface WebAudioContextRuntimeOptions {
  readonly audioContextFactory?: () => AudioContext
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function readContextState(context: AudioContext): WebAudioContextRuntimeState {
  const state = String(context.state)
  switch (state) {
    case 'closed':
    case 'interrupted':
    case 'running':
    case 'suspended':
      return state
    default:
      return 'unknown'
  }
}

function createDefaultAudioContext(): AudioContext {
  const AudioContextConstructor = globalThis.AudioContext
  if (AudioContextConstructor === undefined) throw new Error('Web Audio is unavailable')
  return new AudioContextConstructor()
}

/** Owns the user-activated AudioContext, Project master stage, and fixed output calibration. */
export class WebAudioContextRuntime {
  readonly #audioContextFactory: () => AudioContext
  #activationRequest: Promise<ActiveWebAudioOutput> | null = null
  #audioContext: AudioContext | null = null
  #masterGain: GainNode | null = null
  #outputCalibrationGain: GainNode | null = null
  #output: ActiveWebAudioOutput | null = null
  #disposed = false

  constructor(options: WebAudioContextRuntimeOptions = {}) {
    this.#audioContextFactory = options.audioContextFactory ?? createDefaultAudioContext
  }

  get statistics(): WebAudioContextRuntimeStatistics {
    let state: WebAudioContextRuntimeState
    if (this.#disposed) state = 'disposed'
    else if (this.#audioContext === null) state = 'dormant'
    else state = readContextState(this.#audioContext)

    return Object.freeze({
      audioContextCreated: this.#audioContext !== null,
      masterNodeCount: this.#masterGain === null ? 0 : 1,
      outputCalibrationNodeCount: this.#outputCalibrationGain === null ? 0 : 1,
      state,
    })
  }

  async activate(): Promise<ActiveWebAudioOutput> {
    this.#assertUsable()
    const existingRequest = this.#activationRequest
    if (existingRequest !== null) return existingRequest

    const request = this.#activate()
    this.#activationRequest = request
    try {
      return await request
    } finally {
      if (this.#activationRequest === request) this.#activationRequest = null
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return
    this.#disposed = true
    const context = this.#audioContext
    const masterGain = this.#masterGain
    const outputCalibrationGain = this.#outputCalibrationGain
    this.#audioContext = null
    this.#masterGain = null
    this.#outputCalibrationGain = null
    this.#output = null

    for (const node of [masterGain, outputCalibrationGain]) {
      try {
        node?.disconnect()
      } catch {
        // The graph is already unreachable; context.close() remains the authoritative cleanup.
      }
    }
    if (context !== null && readContextState(context) !== 'closed') {
      try {
        await context.close()
      } catch (error) {
        throw new Error(`AudioContext close failed: ${errorDetail(error)}`, { cause: error })
      }
    }
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error('The audio output is disposed')
  }

  async #activate(): Promise<ActiveWebAudioOutput> {
    let context = this.#audioContext
    if (context === null) {
      try {
        context = this.#audioContextFactory()
      } catch (error) {
        throw new Error(`AudioContext creation failed: ${errorDetail(error)}`, { cause: error })
      }
      this.#audioContext = context
      let masterGain: GainNode | null = null
      let outputCalibrationGain: GainNode | null = null
      try {
        masterGain = context.createGain()
        outputCalibrationGain = context.createGain()
        masterGain.gain.setValueAtTime(1, context.currentTime)
        outputCalibrationGain.gain.setValueAtTime(
          AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain,
          context.currentTime,
        )
        masterGain.connect(outputCalibrationGain)
        outputCalibrationGain.connect(context.destination)
        this.#masterGain = masterGain
        this.#outputCalibrationGain = outputCalibrationGain
        this.#output = Object.freeze({
          audioContext: context,
          masterInput: masterGain,
          setMasterGainAtTime: (gain: number, audioContextSecond: number) =>
            this.#setMasterGainAtTime(gain, audioContextSecond),
        })
      } catch (error) {
        this.#audioContext = null
        this.#masterGain = null
        this.#outputCalibrationGain = null
        this.#output = null
        for (const node of [masterGain, outputCalibrationGain]) {
          try {
            node?.disconnect()
          } catch {
            // Closing the rejected context remains the authoritative failure cleanup.
          }
        }
        try {
          if (readContextState(context) !== 'closed') await context.close()
        } catch {
          // Graph creation is the primary failure; the rejected context is no longer retained.
        }
        throw new Error(`Master output creation failed: ${errorDetail(error)}`, { cause: error })
      }
    }

    this.#assertUsable()

    let state = readContextState(context)
    if (state === 'suspended' || state === 'interrupted') {
      try {
        await context.resume()
      } catch (error) {
        throw new Error(`AudioContext resume failed: ${errorDetail(error)}`, { cause: error })
      }
      this.#assertUsable()
      state = readContextState(context)
    }
    if (state !== 'running') throw new Error(`AudioContext is ${state}`)
    return this.#output!
  }

  #setMasterGainAtTime(gain: number, audioContextSecond: number): void {
    const context = this.#audioContext
    const masterGain = this.#masterGain
    if (context === null || masterGain === null) throw new Error('The audio output is disposed')
    masterGain.gain.setValueAtTime(gain, Math.max(audioContextSecond, context.currentTime))
  }
}
