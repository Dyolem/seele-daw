import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DEVICE_DEFINITION_VERSION_MIN,
  DomainValueError,
  createDeviceDescriptor,
  parseDeviceId,
  parseDeviceTypeId,
  parseJsonValue,
  parseParameterId,
  type DeviceDescriptor,
  type JsonValue,
} from '#internal/index'

describe('JsonValue', () => {
  it.each([null, 'lead', true, false, 0, -12.5])('accepts the JSON primitive %s', (value) => {
    expect(parseJsonValue(value)).toBe(value)
  })

  it('deeply copies nested arrays, objects, and shared acyclic values', () => {
    const shared = { waveform: 'sine' }
    const input = {
      layers: [shared, shared],
      modulation: {
        enabled: true,
        amounts: [0.25, 0.5],
      },
    }

    const parsed = parseJsonValue(input)

    input.layers[0]!.waveform = 'square'
    input.modulation.amounts.push(0.75)

    expect(parsed).toEqual({
      layers: [{ waveform: 'sine' }, { waveform: 'sine' }],
      modulation: {
        enabled: true,
        amounts: [0.25, 0.5],
      },
    })
    expect(parsed).not.toBe(input)

    const parsedLayers = (parsed as { readonly layers: readonly JsonValue[] }).layers
    expect(parsedLayers[0]).not.toBe(parsedLayers[1])
    expectTypeOf(parsed).toEqualTypeOf<JsonValue>()
  })

  it('accepts null-prototype objects and safely preserves special JSON keys', () => {
    const input = Object.create(null) as Record<string, unknown>
    Object.defineProperty(input, '__proto__', {
      enumerable: true,
      value: { safe: true },
    })
    Object.defineProperty(input, 'constructor', {
      enumerable: true,
      value: 'device-owned-value',
    })

    const parsed = parseJsonValue(input) as { readonly [key: string]: JsonValue }

    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true)
    expect(parsed.__proto__).toEqual({ safe: true })
    expect(parsed.constructor).toBe('device-owned-value')
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
  })

  it.each([
    undefined,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1n,
    Symbol('state'),
    () => undefined,
    new Date(),
    new Map(),
    new Set(),
  ])('rejects the non-JSON value %s', (value) => {
    expect(() => parseJsonValue(value)).toThrow(DomainValueError)
  })

  it('rejects class instances', () => {
    class DeviceState {
      readonly value = 1
    }

    expect(() => parseJsonValue(new DeviceState())).toThrow(DomainValueError)
  })

  it('rejects sparse arrays and arrays with custom properties', () => {
    const sparse = Array<unknown>(2)
    sparse[1] = 'second'

    const extended = ['first'] as string[] & { label?: string }
    extended.label = 'not serialized by JSON arrays'

    expect(() => parseJsonValue(sparse)).toThrow(DomainValueError)
    expect(() => parseJsonValue(extended)).toThrow(DomainValueError)
  })

  it('rejects accessor, non-enumerable, and symbol properties', () => {
    const accessor = {
      get value() {
        return 1
      },
    }
    const nonEnumerable = {}
    Object.defineProperty(nonEnumerable, 'hidden', { value: true })
    const symbolProperty = { [Symbol('hidden')]: true }

    expect(() => parseJsonValue(accessor)).toThrow(DomainValueError)
    expect(() => parseJsonValue(nonEnumerable)).toThrow(DomainValueError)
    expect(() => parseJsonValue(symbolProperty)).toThrow(DomainValueError)
  })

  it('rejects direct and indirect circular references', () => {
    const direct: Record<string, unknown> = {}
    direct.self = direct

    const first: Record<string, unknown> = {}
    const second: Record<string, unknown> = { first }
    first.second = second

    expect(() => parseJsonValue(direct)).toThrow(DomainValueError)
    expect(() => parseJsonValue(first)).toThrow(DomainValueError)
  })
})

describe('DeviceDescriptor', () => {
  function createInput() {
    return {
      id: parseDeviceId('device-1'),
      typeId: parseDeviceTypeId('seele.basic-synth'),
      definitionVersion: DEVICE_DEFINITION_VERSION_MIN,
      enabled: true,
      parameters: {
        [parseParameterId('oscillator.waveform')]: 'saw',
        [parseParameterId('filter.cutoff')]: 12_000,
        [parseParameterId('modulation.routes')]: [{ source: 'lfo-1', amount: 0.5 }],
      },
      opaqueState: {
        vendorData: {
          revision: 3,
          bytes: [1, 2, 3],
        },
      },
    }
  }

  it('creates a fresh descriptor and deeply copies device-owned state', () => {
    const input = createInput()
    const descriptor = createDeviceDescriptor(input)

    ;(input.parameters['modulation.routes'] as Array<{ amount: number }>)[0]!.amount = 1
    ;(input.opaqueState.vendorData.bytes as number[]).push(4)

    expect(descriptor).not.toBe(input)
    expect(descriptor.parameters).not.toBe(input.parameters)
    expect(descriptor.parameters[parseParameterId('modulation.routes')]).toEqual([
      { source: 'lfo-1', amount: 0.5 },
    ])
    expect(descriptor.opaqueState).toEqual({
      vendorData: {
        revision: 3,
        bytes: [1, 2, 3],
      },
    })
    expect(descriptor.opaqueState).not.toBe(input.opaqueState)
    expectTypeOf(descriptor).toEqualTypeOf<DeviceDescriptor>()
  })

  it('preserves unknown parameters, opaque fields, and an absent opaque state', () => {
    const unknownParameterId = parseParameterId('future.parameter')
    const descriptor = createDeviceDescriptor({
      ...createInput(),
      parameters: {
        [unknownParameterId]: { futureShape: ['still', 'preserved'] },
      },
      opaqueState: null,
    })

    expect(descriptor.parameters[unknownParameterId]).toEqual({
      futureShape: ['still', 'preserved'],
    })
    expect(descriptor.opaqueState).toBeNull()
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects the invalid definition version %s',
    (definitionVersion) => {
      expect(() =>
        createDeviceDescriptor({
          ...createInput(),
          definitionVersion,
        }),
      ).toThrow(DomainValueError)
    },
  )

  it('validates enabled, parameter IDs, and all recursive JSON values at runtime', () => {
    expect(() =>
      createDeviceDescriptor({
        ...createInput(),
        enabled: 1 as never,
      }),
    ).toThrow(DomainValueError)

    expect(() =>
      createDeviceDescriptor({
        ...createInput(),
        parameters: { ' padded ': true } as never,
      }),
    ).toThrow(DomainValueError)

    expect(() =>
      createDeviceDescriptor({
        ...createInput(),
        opaqueState: { invalid: undefined } as never,
      }),
    ).toThrow(DomainValueError)
  })
})
