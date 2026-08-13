import {
  SampleResourceKeyError,
  assertSafeSampleResourceKey,
} from '#internal/sample-instrument/contract/resource-key'
import {
  StructuredDataError,
  readArray,
  readBoolean,
  readDataObject,
  readInteger,
  readNonBlankString,
  readRequiredValue,
  readString,
  type DataObject,
} from '#internal/sample-instrument/contract/structured-data'

const MIDI_SAMPLE_SYNTH_ENGINE = 'MIDISampleSynth'

export interface BuiltInSoundbankSourceRequest {
  readonly expectedGeneralMidiProgram: number
  readonly generalMidiIndex: unknown
  readonly selectedCatalog: unknown
  readonly soundbankMap: unknown
  readonly sourceSlug: string
}

export interface BuiltInSoundbankSourceSelection {
  readonly catalogRelativePath: string
  readonly displayName: string
  readonly embeddedMappingEntryKey: string
  readonly generalMidiProgram: number
  readonly mappingRelativePath: string
  readonly sourceSlug: string
  readonly wavArchiveRelativePath: string
}

export type BuiltInSoundbankSourceErrorCode =
  | 'ambiguous-source'
  | 'inconsistent-source'
  | 'invalid-source'
  | 'missing-source'
  | 'unsafe-source-path'

export class BuiltInSoundbankSourceError extends TypeError {
  readonly code: BuiltInSoundbankSourceErrorCode
  readonly detail: string
  readonly path: string

  constructor(code: BuiltInSoundbankSourceErrorCode, path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'BuiltInSoundbankSourceError'
    this.code = code
    this.detail = message
    this.path = path
  }
}

function fail(code: BuiltInSoundbankSourceErrorCode, path: string, message: string): never {
  throw new BuiltInSoundbankSourceError(code, path, message)
}

function readObjectProperty(object: DataObject, key: string, path: string): DataObject {
  return readDataObject(readRequiredValue(object, key, path), `${path}.${key}`)
}

function readStringProperty(object: DataObject, key: string, path: string): string {
  return readString(readRequiredValue(object, key, path), `${path}.${key}`)
}

function readNonBlankStringProperty(object: DataObject, key: string, path: string): string {
  return readNonBlankString(readRequiredValue(object, key, path), `${path}.${key}`)
}

function readSafeRelativePath(object: DataObject, key: string, path: string): string {
  const value = readNonBlankStringProperty(object, key, path)
  try {
    assertSafeSampleResourceKey(value)
  } catch (error) {
    if (error instanceof SampleResourceKeyError) {
      fail('unsafe-source-path', `${path}.${key}`, error.detail)
    }
    throw error
  }
  return value
}

function assertEqual(
  actual: string | number | boolean,
  expected: string | number | boolean,
  path: string,
): void {
  if (actual !== expected) {
    fail('inconsistent-source', path, `expected ${JSON.stringify(expected)}`)
  }
}

function readHttpsBasename(input: unknown, path: string): string {
  const value = readString(input, path)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StructuredDataError(path, 'expected an absolute URL')
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
    throw new StructuredDataError(path, 'expected a plain HTTPS asset URL')
  }
  const encodedBasename = url.pathname.split('/').at(-1)
  try {
    return decodeURIComponent(encodedBasename ?? '')
  } catch {
    throw new StructuredDataError(path, 'asset URL has invalid percent encoding')
  }
}

function findCatalogEntry(catalogInput: unknown, sourceSlug: string): DataObject {
  const matches: DataObject[] = []
  for (const [index, entryInput] of readArray(catalogInput, '$selectedCatalog').entries()) {
    const path = `$selectedCatalog[${index}]`
    const entry = readDataObject(entryInput, path)
    if (readNonBlankStringProperty(entry, 'slug', path) === sourceSlug) matches.push(entry)
  }
  if (matches.length === 0) fail('missing-source', '$selectedCatalog', 'Soundbank slug is absent')
  if (matches.length > 1) {
    fail('ambiguous-source', '$selectedCatalog', 'Soundbank slug appears more than once')
  }
  const match = matches[0]
  if (match === undefined) fail('missing-source', '$selectedCatalog', 'Soundbank slug is absent')
  return match
}

function validateSelectedCatalogEntry(
  entry: DataObject,
  sourceSlug: string,
  displayName: string,
  wavArchiveFileName: string,
): void {
  const path = '$selectedCatalog[]'
  assertEqual(readStringProperty(entry, 'synth', path), MIDI_SAMPLE_SYNTH_ENGINE, `${path}.synth`)
  assertEqual(readStringProperty(entry, 'name', path), displayName, `${path}.name`)
  assertEqual(readStringProperty(entry, 'slug', path), sourceSlug, `${path}.slug`)
  const archive = readObjectProperty(entry, 'archive', path)
  assertEqual(
    readHttpsBasename(readRequiredValue(archive, 'wav', `${path}.archive`), `${path}.archive.wav`),
    wavArchiveFileName,
    `${path}.archive.wav`,
  )
}

function validateGeneralMidiIndex(
  input: unknown,
  expectedProgram: number,
  sourceSlug: string,
): void {
  const root = readDataObject(input, '$generalMidiIndex')
  const programPath = `$generalMidiIndex.${expectedProgram}`
  const program = readDataObject(
    readRequiredValue(root, String(expectedProgram), '$generalMidiIndex'),
    programPath,
  )
  assertEqual(
    readInteger(
      readRequiredValue(program, 'programChange', programPath),
      `${programPath}.programChange`,
    ),
    expectedProgram,
    `${programPath}.programChange`,
  )
  assertEqual(
    readNonBlankStringProperty(program, 'canonicalSoundbank', programPath),
    sourceSlug,
    `${programPath}.canonicalSoundbank`,
  )

  const candidates = readArray(
    readRequiredValue(program, 'soundbanks', programPath),
    `${programPath}.soundbanks`,
  )
  let matchCount = 0
  for (const [index, candidateInput] of candidates.entries()) {
    const path = `${programPath}.soundbanks[${index}]`
    const candidate = readDataObject(candidateInput, path)
    if (readNonBlankStringProperty(candidate, 'slug', path) !== sourceSlug) continue
    matchCount += 1
    assertEqual(
      readStringProperty(candidate, 'engine', path),
      MIDI_SAMPLE_SYNTH_ENGINE,
      `${path}.engine`,
    )
    assertEqual(
      readBoolean(
        readRequiredValue(candidate, 'isCanonicalForProgram', path),
        `${path}.isCanonicalForProgram`,
      ),
      true,
      `${path}.isCanonicalForProgram`,
    )
  }
  if (matchCount === 0)
    fail('missing-source', `${programPath}.soundbanks`, 'canonical entry is absent')
  if (matchCount > 1) {
    fail('ambiguous-source', `${programPath}.soundbanks`, 'canonical entry appears more than once')
  }
}

function resolveSource(request: BuiltInSoundbankSourceRequest): BuiltInSoundbankSourceSelection {
  if (!Number.isInteger(request.expectedGeneralMidiProgram)) {
    throw new StructuredDataError('$request.expectedGeneralMidiProgram', 'expected an integer')
  }
  const sourceSlug = readNonBlankString(request.sourceSlug, '$request.sourceSlug')
  const root = readDataObject(request.soundbankMap, '$soundbankMap')
  const bySlug = readObjectProperty(root, 'bySlug', '$soundbankMap')
  const entryPath = `$soundbankMap.bySlug.${sourceSlug}`
  const entry = readDataObject(
    readRequiredValue(bySlug, sourceSlug, '$soundbankMap.bySlug'),
    entryPath,
  )
  const displayName = readNonBlankStringProperty(entry, 'name', entryPath)
  assertEqual(readNonBlankStringProperty(entry, 'slug', entryPath), sourceSlug, `${entryPath}.slug`)
  assertEqual(
    readStringProperty(entry, 'engine', entryPath),
    MIDI_SAMPLE_SYNTH_ENGINE,
    `${entryPath}.engine`,
  )

  const expectedDirectory = `soundbanks/${MIDI_SAMPLE_SYNTH_ENGINE}/${sourceSlug}`
  assertEqual(
    readSafeRelativePath(entry, 'directory', entryPath),
    expectedDirectory,
    `${entryPath}.directory`,
  )

  const catalogFile = readObjectProperty(entry, 'catalogFile', entryPath)
  const mappingFile = readObjectProperty(entry, 'mappingFile', entryPath)
  const archives = readObjectProperty(entry, 'archives', entryPath)
  const wavArchive = readObjectProperty(archives, 'wav', `${entryPath}.archives`)
  const catalogFileName = `${sourceSlug}.catalog.json`
  const mappingFileName = `${sourceSlug}.mapping.json`
  const wavArchiveFileName = `${sourceSlug}-wav.zip`
  assertEqual(
    readNonBlankStringProperty(catalogFile, 'fileName', `${entryPath}.catalogFile`),
    catalogFileName,
    `${entryPath}.catalogFile.fileName`,
  )
  assertEqual(
    readNonBlankStringProperty(mappingFile, 'fileName', `${entryPath}.mappingFile`),
    mappingFileName,
    `${entryPath}.mappingFile.fileName`,
  )
  assertEqual(
    readNonBlankStringProperty(wavArchive, 'fileName', `${entryPath}.archives.wav`),
    wavArchiveFileName,
    `${entryPath}.archives.wav.fileName`,
  )
  assertEqual(
    readBoolean(
      readRequiredValue(wavArchive, 'available', `${entryPath}.archives.wav`),
      `${entryPath}.archives.wav.available`,
    ),
    true,
    `${entryPath}.archives.wav.available`,
  )
  assertEqual(
    readBoolean(
      readRequiredValue(wavArchive, 'selectedForDownload', `${entryPath}.archives.wav`),
      `${entryPath}.archives.wav.selectedForDownload`,
    ),
    true,
    `${entryPath}.archives.wav.selectedForDownload`,
  )

  const generalMidi = readObjectProperty(entry, 'generalMidi', entryPath)
  assertEqual(
    readInteger(
      readRequiredValue(generalMidi, 'programChange', `${entryPath}.generalMidi`),
      `${entryPath}.generalMidi.programChange`,
    ),
    request.expectedGeneralMidiProgram,
    `${entryPath}.generalMidi.programChange`,
  )
  assertEqual(
    readNonBlankStringProperty(generalMidi, 'canonicalSoundbank', `${entryPath}.generalMidi`),
    sourceSlug,
    `${entryPath}.generalMidi.canonicalSoundbank`,
  )
  assertEqual(
    readBoolean(
      readRequiredValue(generalMidi, 'isCanonicalForProgram', `${entryPath}.generalMidi`),
      `${entryPath}.generalMidi.isCanonicalForProgram`,
    ),
    true,
    `${entryPath}.generalMidi.isCanonicalForProgram`,
  )

  validateSelectedCatalogEntry(
    findCatalogEntry(request.selectedCatalog, sourceSlug),
    sourceSlug,
    displayName,
    wavArchiveFileName,
  )
  validateGeneralMidiIndex(request.generalMidiIndex, request.expectedGeneralMidiProgram, sourceSlug)

  const selection = Object.freeze({
    catalogRelativePath: readSafeRelativePath(
      catalogFile,
      'relativePath',
      `${entryPath}.catalogFile`,
    ),
    displayName,
    embeddedMappingEntryKey: `${sourceSlug}.json`,
    generalMidiProgram: request.expectedGeneralMidiProgram,
    mappingRelativePath: readSafeRelativePath(
      mappingFile,
      'relativePath',
      `${entryPath}.mappingFile`,
    ),
    sourceSlug,
    wavArchiveRelativePath: readSafeRelativePath(
      wavArchive,
      'relativePath',
      `${entryPath}.archives.wav`,
    ),
  })
  assertEqual(
    selection.catalogRelativePath,
    `${expectedDirectory}/${catalogFileName}`,
    `${entryPath}.catalogFile.relativePath`,
  )
  assertEqual(
    selection.mappingRelativePath,
    `${expectedDirectory}/${mappingFileName}`,
    `${entryPath}.mappingFile.relativePath`,
  )
  assertEqual(
    selection.wavArchiveRelativePath,
    `${expectedDirectory}/${wavArchiveFileName}`,
    `${entryPath}.archives.wav.relativePath`,
  )
  return selection
}

export function resolveBuiltInSoundbankSource(
  request: BuiltInSoundbankSourceRequest,
): BuiltInSoundbankSourceSelection {
  try {
    return resolveSource(request)
  } catch (error) {
    if (error instanceof BuiltInSoundbankSourceError) throw error
    if (error instanceof StructuredDataError) {
      throw new BuiltInSoundbankSourceError('invalid-source', error.path, error.detail)
    }
    throw error
  }
}

export function validateBuiltInSoundbankCatalog(
  input: unknown,
  selection: BuiltInSoundbankSourceSelection,
): void {
  try {
    const path = '$soundbankCatalog'
    const catalog = readDataObject(input, path)
    assertEqual(
      readNonBlankStringProperty(catalog, 'slug', path),
      selection.sourceSlug,
      `${path}.slug`,
    )
    assertEqual(readStringProperty(catalog, 'name', path), selection.displayName, `${path}.name`)
    assertEqual(
      readStringProperty(catalog, 'synth', path),
      MIDI_SAMPLE_SYNTH_ENGINE,
      `${path}.synth`,
    )
    const archive = readObjectProperty(catalog, 'archive', path)
    const expectedArchiveFileName = selection.wavArchiveRelativePath.split('/').at(-1) ?? ''
    assertEqual(
      readHttpsBasename(
        readRequiredValue(archive, 'wav', `${path}.archive`),
        `${path}.archive.wav`,
      ),
      expectedArchiveFileName,
      `${path}.archive.wav`,
    )
  } catch (error) {
    if (error instanceof BuiltInSoundbankSourceError) throw error
    if (error instanceof StructuredDataError) {
      throw new BuiltInSoundbankSourceError('invalid-source', error.path, error.detail)
    }
    throw error
  }
}
