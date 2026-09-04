import { BUILT_IN_PRESET_LOCAL_INSTRUMENTS } from './built-in-preset-local-instruments'
import { prepareBuiltInLocalInstrumentSet } from './prepare-built-in-local-instrument-set'

await prepareBuiltInLocalInstrumentSet({
  instruments: BUILT_IN_PRESET_LOCAL_INSTRUMENTS,
  inventoryRelativePath: 'measurements/built-in-presets/preparation-inventory.json',
  label: 'Built-in Preset',
  reportSchema: 'seele.built-in-preset-local-preparation-inventory',
  reportSchemaVersion: 1,
})
