import { describe, expect, it, vi } from 'vitest'

import {
  WebAudioContextRuntime,
  type WebAudioContextRuntimeError,
} from '#internal/context/audio-context-runtime'
import { AUDIO_QUALITY_V1A_RENDER_POLICY } from '#internal/audio-quality/render-policy'
import { FakeAudioContext, FakeGainNode } from '#internal/__tests__/support/fake-web-audio'

describe('Web Audio context runtime', () => {
  it('creates and resumes a single context only after activation', async () => {
    const context = new FakeAudioContext({ currentTime: 3, state: 'suspended' })
    let createCount = 0
    const runtime = new WebAudioContextRuntime({
      audioContextFactory: () => {
        createCount += 1
        return context.asAudioContext()
      },
    })

    expect(runtime.statistics).toEqual({
      audioContextCreated: false,
      masterNodeCount: 0,
      outputCalibrationNodeCount: 0,
      state: 'dormant',
    })

    const [first, second] = await Promise.all([runtime.activate(), runtime.activate()])

    expect(first).toBe(second)
    expect(createCount).toBe(1)
    expect(context.resumeCallCount).toBe(1)
    expect(context.gainNodes).toHaveLength(2)
    expect(context.gainNodes[0]?.gain.events).toEqual([{ kind: 'set', time: 3, value: 1 }])
    expect(context.gainNodes[1]?.gain.events).toEqual([
      {
        kind: 'set',
        time: 3,
        value: AUDIO_QUALITY_V1A_RENDER_POLICY.outputCalibrationGain,
      },
    ])
    expect(context.gainNodes[0]?.connections).toEqual([context.gainNodes[1]])
    expect(context.gainNodes[1]?.connections).toEqual([context.destination])
    expect(runtime.statistics).toEqual({
      audioContextCreated: true,
      masterNodeCount: 1,
      outputCalibrationNodeCount: 1,
      state: 'running',
    })
  })

  it('schedules validated master gain no earlier than current context time', async () => {
    const context = new FakeAudioContext({ currentTime: 5 })
    const output = await new WebAudioContextRuntime({
      audioContextFactory: () => context.asAudioContext(),
    }).activate()

    output.setMasterGainAtTime(0.75, 2)
    output.setMasterGainAtTime(1.25, 8)

    expect(context.gainNodes[0]?.gain.events.slice(1)).toEqual([
      { kind: 'set', time: 5, value: 0.75 },
      { kind: 'set', time: 8, value: 1.25 },
    ])
    expect(() => output.setMasterGainAtTime(5, 8)).toThrowError(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'invalid-master-gain',
      }),
    )
    expect(() => output.setMasterGainAtTime(1, Number.NaN)).toThrowError(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'invalid-schedule-time',
      }),
    )
  })

  it.each(['closed', 'unknown'] as const)(
    'rejects a context that cannot enter running state from %s',
    async (state) => {
      const context = new FakeAudioContext({ state: state as AudioContextState })
      const runtime = new WebAudioContextRuntime({
        audioContextFactory: () => context.asAudioContext(),
      })

      await expect(runtime.activate()).rejects.toEqual(
        expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
          code: 'audio-context-unavailable',
        }),
      )
    },
  )

  it('reports context creation, graph creation, and resume failures with stable codes', async () => {
    const createFailure = new WebAudioContextRuntime({
      audioContextFactory: () => {
        throw new TypeError('fixture create failure')
      },
    })
    await expect(createFailure.activate()).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'audio-context-create-failed',
      }),
    )

    const rejectedMaster = new FakeGainNode()
    let graphGainCreationCount = 0
    const graphContext = new FakeAudioContext({
      createGain: () => {
        graphGainCreationCount += 1
        if (graphGainCreationCount === 1) return rejectedMaster
        throw new TypeError('fixture graph failure')
      },
    })
    await expect(
      new WebAudioContextRuntime({
        audioContextFactory: () => graphContext.asAudioContext(),
      }).activate(),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'audio-graph-create-failed',
      }),
    )
    expect(graphGainCreationCount).toBe(2)
    expect(rejectedMaster.disconnectCallCount).toBe(1)
    expect(graphContext.closeCallCount).toBe(1)
    expect(graphContext.state).toBe('closed')

    const resumeContext = new FakeAudioContext({
      resume: async () => {
        throw new TypeError('fixture resume failure')
      },
      state: 'interrupted',
    })
    await expect(
      new WebAudioContextRuntime({
        audioContextFactory: () => resumeContext.asAudioContext(),
      }).activate(),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'audio-context-resume-failed',
      }),
    )
  })

  it('uses the platform factory lazily and reports an unavailable AudioContext', async () => {
    const runtime = new WebAudioContextRuntime()

    await expect(runtime.activate()).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({
        code: 'audio-context-unavailable',
      }),
    )
    expect(runtime.statistics.state).toBe('dormant')
  })

  it('disconnects and closes its graph exactly once on disposal', async () => {
    const master = new FakeGainNode()
    const calibration = new FakeGainNode()
    const gains = [master, calibration]
    const context = new FakeAudioContext({ createGain: () => gains.shift()! })
    const runtime = new WebAudioContextRuntime({
      audioContextFactory: () => context.asAudioContext(),
    })
    const output = await runtime.activate()

    await runtime.dispose()
    await runtime.dispose()

    expect(master.disconnectCallCount).toBe(1)
    expect(calibration.disconnectCallCount).toBe(1)
    expect(context.closeCallCount).toBe(1)
    expect(runtime.statistics).toEqual({
      audioContextCreated: false,
      masterNodeCount: 0,
      outputCalibrationNodeCount: 0,
      state: 'disposed',
    })
    await expect(runtime.activate()).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({ code: 'disposed' }),
    )
    expect(() => output.setMasterGainAtTime(1, 0)).toThrowError(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({ code: 'disposed' }),
    )
  })

  it('closes immediately when disposed during a pending resume', async () => {
    let finishResume: (() => void) | undefined
    const context = new FakeAudioContext({
      resume: () =>
        new Promise<void>((resolve) => {
          finishResume = resolve
        }),
      state: 'suspended',
    })
    const runtime = new WebAudioContextRuntime({
      audioContextFactory: () => context.asAudioContext(),
    })
    const activation = runtime.activate()

    await vi.waitFor(() => expect(finishResume).toBeDefined())
    await runtime.dispose()
    expect(context.closeCallCount).toBe(1)
    expect(context.gainNodes[0]?.disconnectCallCount).toBe(1)
    expect(context.gainNodes[1]?.disconnectCallCount).toBe(1)

    finishResume?.()

    await expect(activation).rejects.toEqual(
      expect.objectContaining<Partial<WebAudioContextRuntimeError>>({ code: 'disposed' }),
    )
  })
})
