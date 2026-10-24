export function createBuiltInZone(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  const fileName = typeof overrides.fileName === 'string' ? overrides.fileName : '060-Fixture'
  return {
    crossfade: 0,
    fileName,
    loopEnd: null,
    loopStart: null,
    maxRange: 60,
    midiNumber: 60,
    minRange: 60,
    urls: {
      m4a: `https://static.example.test/${encodeURIComponent(fileName)}.m4a`,
      wav: `https://static.example.test/${encodeURIComponent(fileName)}.wav`,
    },
    ...overrides,
  }
}

export function createBuiltInMapping(
  overrides: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    category: 'instrument',
    color: '000000',
    defaultOctave: 48,
    defaultPreset: '',
    filters: ['instrument-type-keyboards'],
    instrumentSlug: 'piano',
    isDeprecated: false,
    name: 'Fixture Instrument',
    release: 0.1,
    samples: [createBuiltInZone()],
    slug: 'fixture-instrument-v1',
    subTitle: 'Fixture',
    synth: 'MIDISampleSynth',
    updatedAt: '2026-08-12T00:00:00Z',
    userInterfaces: ['keyboard'],
    ...overrides,
  }
}
