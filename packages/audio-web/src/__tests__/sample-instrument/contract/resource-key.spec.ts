import { describe, expect, it } from 'vitest'

import { resolveSampleResourceUrl } from '#internal/sample-instrument/contract/resource-key'

describe('Sample resource URL resolution', () => {
  it.each([
    ['samples/Piano#Bright.wav', 'samples/Piano%23Bright.wav'],
    ['samples/Piano?Take.wav', 'samples/Piano%3FTake.wav'],
    ['https:sample.wav', 'https%3Asample.wav'],
    ['samples/100%25.wav', 'samples/100%2525.wav'],
  ] as const)('keeps logical filename characters inside the asset root', (key, encodedPath) => {
    const url = resolveSampleResourceUrl(new URL('https://studio.test/assets/bank/'), key)

    expect(url.href).toBe(`https://studio.test/assets/bank/${encodedPath}`)
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  })
})
