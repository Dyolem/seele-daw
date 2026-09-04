import { BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS } from './built-in-general-midi-local-instruments'
import { prepareBuiltInLocalInstrumentSet } from './prepare-built-in-local-instrument-set'

await prepareBuiltInLocalInstrumentSet({
  instruments: BUILT_IN_GENERAL_MIDI_LOCAL_INSTRUMENTS,
  inventoryRelativePath: 'measurements/general-midi/preparation-inventory.json',
  label: 'General MIDI',
  reportSchema: 'seele.local-general-midi-preparation-inventory',
  reportSchemaVersion: 1,
})
