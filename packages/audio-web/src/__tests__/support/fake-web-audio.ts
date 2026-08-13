export type FakeAudioParamEvent =
  | { readonly kind: 'cancel-and-hold'; readonly time: number }
  | { readonly kind: 'linear-ramp'; readonly time: number; readonly value: number }
  | { readonly kind: 'set'; readonly time: number; readonly value: number }

export class FakeAudioParam {
  readonly events: FakeAudioParamEvent[] = []
  cancelAndHoldFailure: Error | null = null
  value = 0

  setValueAtTime(value: number, startTime: number): AudioParam {
    this.value = value
    this.events.push(Object.freeze({ kind: 'set', time: startTime, value }))
    return this as unknown as AudioParam
  }

  linearRampToValueAtTime(value: number, endTime: number): AudioParam {
    this.value = value
    this.events.push(Object.freeze({ kind: 'linear-ramp', time: endTime, value }))
    return this as unknown as AudioParam
  }

  cancelAndHoldAtTime(cancelTime: number): AudioParam {
    if (this.cancelAndHoldFailure !== null) throw this.cancelAndHoldFailure
    this.events.push(Object.freeze({ kind: 'cancel-and-hold', time: cancelTime }))
    return this as unknown as AudioParam
  }
}

export class FakeAudioNode {
  readonly connections: AudioNode[] = []
  disconnectCallCount = 0

  connect(destination: AudioNode): AudioNode {
    this.connections.push(destination)
    return destination
  }

  disconnect(): void {
    this.disconnectCallCount += 1
    this.connections.length = 0
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam()
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam()
}

export interface FakeBufferSourceStart {
  readonly duration: number | null
  readonly offset: number
  readonly when: number
}

export class FakeAudioBufferSourceNode extends FakeAudioNode {
  readonly playbackRate = new FakeAudioParam()
  readonly starts: FakeBufferSourceStart[] = []
  readonly stops: number[] = []
  buffer: AudioBuffer | null = null
  loop = false
  loopEnd = 0
  loopStart = 0
  #endedListeners = new Set<EventListenerOrEventListenerObject>()

  get endedListenerCount(): number {
    return this.#endedListeners.size
  }

  start(when = 0, offset = 0, duration?: number): void {
    this.starts.push(Object.freeze({ duration: duration ?? null, offset, when }))
  }

  stop(when = 0): void {
    this.stops.push(when)
  }

  addEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
    if (type === 'ended' && callback !== null) this.#endedListeners.add(callback)
  }

  removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null): void {
    if (type === 'ended' && callback !== null) this.#endedListeners.delete(callback)
  }

  finish(): void {
    const event = new Event('ended')
    for (const listener of this.#endedListeners) {
      if (typeof listener === 'function') listener.call(this, event)
      else listener.handleEvent(event)
    }
  }
}

export interface FakeAudioContextOptions {
  readonly close?: () => Promise<void>
  readonly createGain?: () => FakeGainNode
  readonly stereoPannerAvailable?: boolean
  readonly currentTime?: number
  readonly resume?: () => Promise<void>
  readonly state?: AudioContextState | 'interrupted'
}

export class FakeAudioContext {
  readonly bufferSources: FakeAudioBufferSourceNode[] = []
  readonly destinationNode = new FakeAudioNode()
  readonly gainNodes: FakeGainNode[] = []
  readonly pannerNodes: FakeStereoPannerNode[] = []
  readonly destination = this.destinationNode as unknown as AudioDestinationNode
  currentTime: number
  state: AudioContextState | 'interrupted'
  closeCallCount = 0
  resumeCallCount = 0
  readonly #closeImplementation: () => Promise<void>
  readonly #createGainImplementation: () => FakeGainNode
  readonly #resumeImplementation: (() => Promise<void>) | null

  constructor(options: FakeAudioContextOptions = {}) {
    this.currentTime = options.currentTime ?? 0
    this.state = options.state ?? 'running'
    this.#closeImplementation = options.close ?? (async () => undefined)
    this.#createGainImplementation = options.createGain ?? (() => new FakeGainNode())
    this.#resumeImplementation = options.resume ?? null
    if (options.stereoPannerAvailable === false) {
      Object.defineProperty(this, 'createStereoPanner', { value: undefined })
    }
  }

  createGain(): GainNode {
    const node = this.#createGainImplementation()
    this.gainNodes.push(node)
    return node as unknown as GainNode
  }

  createStereoPanner(): StereoPannerNode {
    const node = new FakeStereoPannerNode()
    this.pannerNodes.push(node)
    return node as unknown as StereoPannerNode
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode()
    this.bufferSources.push(node)
    return node as unknown as AudioBufferSourceNode
  }

  async resume(): Promise<void> {
    this.resumeCallCount += 1
    if (this.#resumeImplementation !== null) await this.#resumeImplementation()
    this.state = 'running'
  }

  async close(): Promise<void> {
    this.closeCallCount += 1
    await this.#closeImplementation()
    this.state = 'closed'
  }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext
  }

  get endedListenerCount(): number {
    return this.bufferSources.reduce((total, source) => total + source.endedListenerCount, 0)
  }
}

export function createFakeAudioBuffer(duration = 8): AudioBuffer {
  const sampleRate = 48_000
  const length = Math.round(duration * sampleRate)
  return Object.freeze({
    duration,
    length,
    numberOfChannels: 2,
    sampleRate,
  } as AudioBuffer)
}
