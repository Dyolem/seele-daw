import { BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS } from './built-in-score-core-local-instruments'
import { prepareBuiltInLocalInstrumentSet } from './prepare-built-in-local-instrument-set'

await prepareBuiltInLocalInstrumentSet({
  instruments: BUILT_IN_SCORE_CORE_LOCAL_INSTRUMENTS,
  inventoryRelativePath: 'measurements/score-core/preparation-inventory.json',
  label: 'Score Core',
  reportSchema: 'seele.local-score-core-preparation-inventory',
  reportSchemaVersion: 2,
})
