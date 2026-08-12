import { describe, expect, it } from 'vitest'

import {
  BuiltInSoundbankSourceError,
  resolveBuiltInSoundbankSource,
  validateBuiltInSoundbankCatalog,
} from '../built-in-soundbank-source'

const SOURCE_SLUG = 'studio-grand-source-v1'
const DIRECTORY = `soundbanks/MIDISampleSynth/${SOURCE_SLUG}`

function createFixture() {
  const archiveFileName = `${SOURCE_SLUG}-wav.zip`
  return {
    generalMidiIndex: {
      0: {
        canonicalSoundbank: SOURCE_SLUG,
        name: 'Acoustic Grand Piano',
        programChange: 0,
        soundbanks: [
          {
            engine: 'MIDISampleSynth',
            isCanonicalForProgram: true,
            name: 'Studio Grand',
            slug: SOURCE_SLUG,
          },
        ],
      },
    },
    selectedCatalog: [
      {
        archive: { wav: `https://static.example.test/${archiveFileName}` },
        name: 'Studio Grand',
        slug: SOURCE_SLUG,
        synth: 'MIDISampleSynth',
      },
    ],
    soundbankCatalog: {
      archive: { wav: `https://static.example.test/${archiveFileName}` },
      name: 'Studio Grand',
      slug: SOURCE_SLUG,
      synth: 'MIDISampleSynth',
    },
    soundbankMap: {
      bySlug: {
        [SOURCE_SLUG]: {
          archives: {
            wav: {
              available: true,
              fileName: archiveFileName,
              relativePath: `${DIRECTORY}/${archiveFileName}`,
              selectedForDownload: true,
            },
          },
          catalogFile: {
            fileName: `${SOURCE_SLUG}.catalog.json`,
            relativePath: `${DIRECTORY}/${SOURCE_SLUG}.catalog.json`,
          },
          directory: DIRECTORY,
          engine: 'MIDISampleSynth',
          generalMidi: {
            canonicalSoundbank: SOURCE_SLUG,
            isCanonicalForProgram: true,
            programChange: 0,
          },
          mappingFile: {
            fileName: `${SOURCE_SLUG}.mapping.json`,
            relativePath: `${DIRECTORY}/${SOURCE_SLUG}.mapping.json`,
          },
          name: 'Studio Grand',
          slug: SOURCE_SLUG,
        },
      },
    },
  }
}

describe('built-in Soundbank source selection', () => {
  it('resolves one canonical source without retaining remote URLs', () => {
    const fixture = createFixture()
    const selection = resolveBuiltInSoundbankSource({
      expectedGeneralMidiProgram: 0,
      generalMidiIndex: fixture.generalMidiIndex,
      selectedCatalog: fixture.selectedCatalog,
      soundbankMap: fixture.soundbankMap,
      sourceSlug: SOURCE_SLUG,
    })

    expect(selection).toEqual({
      catalogRelativePath: `${DIRECTORY}/${SOURCE_SLUG}.catalog.json`,
      displayName: 'Studio Grand',
      embeddedMappingEntryKey: `${SOURCE_SLUG}.json`,
      generalMidiProgram: 0,
      mappingRelativePath: `${DIRECTORY}/${SOURCE_SLUG}.mapping.json`,
      sourceSlug: SOURCE_SLUG,
      wavArchiveRelativePath: `${DIRECTORY}/${SOURCE_SLUG}-wav.zip`,
    })
    expect(JSON.stringify(selection)).not.toContain('https://')
    expect(() => validateBuiltInSoundbankCatalog(fixture.soundbankCatalog, selection)).not.toThrow()
  })

  it.each([
    {
      code: 'ambiguous-source',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.selectedCatalog.push(structuredClone(fixture.selectedCatalog[0]!))
      },
    },
    {
      code: 'unsafe-source-path',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.soundbankMap.bySlug[SOURCE_SLUG]!.mappingFile.relativePath = '../mapping.json'
      },
    },
    {
      code: 'inconsistent-source',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.generalMidiIndex[0].canonicalSoundbank = 'another-source'
      },
    },
  ] as const)('rejects $code source drift', ({ code, mutate }) => {
    const fixture = createFixture()
    mutate(fixture)

    expect(() =>
      resolveBuiltInSoundbankSource({
        expectedGeneralMidiProgram: 0,
        generalMidiIndex: fixture.generalMidiIndex,
        selectedCatalog: fixture.selectedCatalog,
        soundbankMap: fixture.soundbankMap,
        sourceSlug: SOURCE_SLUG,
      }),
    ).toThrowError(expect.objectContaining<Partial<BuiltInSoundbankSourceError>>({ code }))
  })
})
