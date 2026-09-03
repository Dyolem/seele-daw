import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STUDIO_GRAND_LOCAL_INSTRUMENT } from './built-in-score-core-local-instruments'
import { prepareBuiltInLocalSampleInstrument } from './prepare-built-in-local-sample-instrument'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const localSoundbankRoot = resolve(repositoryRoot, 'apps/studio/public/soundbanks')

const result = await prepareBuiltInLocalSampleInstrument({
  definition: STUDIO_GRAND_LOCAL_INSTRUMENT.preparation,
  localSoundbankRoot,
})
const relativeOutputDirectory = relative(repositoryRoot, result.outputDirectory)
console.log(
  result.status === 'created'
    ? `Prepared Studio Grand local assets in ${relativeOutputDirectory}.`
    : `Studio Grand local assets are already current in ${relativeOutputDirectory}.`,
)
