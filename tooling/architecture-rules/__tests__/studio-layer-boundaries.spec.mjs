import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { studioFeatureOf, studioLayerImportViolation } from '../studio-layer-boundaries.mjs'

const root = path.resolve('studio-layer-fixture')
const studio = 'apps/studio/src'
const at = (file) => path.join(root, studio, file)
const violation = (source, target) => studioLayerImportViolation(root, at(source), at(target))

describe('Studio layer boundaries', () => {
  it('lets a layer import its own level and the ones below it', () => {
    for (const [source, target] of [
      ['workbench/edits/note-edits.ts', 'ui/stores/ui-toast-store'],
      ['workbench/actions/studio-action.ts', 'workbench/keyboard'],
      ['features/piano-roll/README.ts', 'workbench/timeline/layout'],
      ['features/project-workspace/Shell.vue', 'features/piano-roll/components/Surface.vue'],
      ['development/audio-quality-aq0/main.ts', 'workbench/instrument/catalogue'],
      ['router/index.ts', 'features/project-entry/ProjectEntryPage.vue'],
      ['bootstrap/studio-application.ts', 'router/project-navigation-guard'],
      ['main.ts', 'bootstrap/studio-application'],
      ['App.vue', 'features/project-navigation/Dialog.vue'],
    ]) {
      assert.equal(violation(source, target), null, `${source} → ${target}`)
    }
  })

  it('rejects an import from a lower layer into a higher one, type-only or not', () => {
    for (const [source, target] of [
      ['ui/components/UiButton.vue', 'workbench/studio-services'],
      [
        'workbench/actions/studio-actions.ts',
        'features/piano-roll/actions/piano-roll-tool-actions',
      ],
      ['workbench/studio-services.ts', 'bootstrap/studio-action-runtime'],
      ['features/project-entry/ProjectEntryPage.vue', 'router/index'],
      ['features/project-workspace/Page.vue', 'bootstrap/studio-application'],
      ['router/index.ts', 'bootstrap/studio-application'],
      ['bootstrap/studio-application.ts', 'main'],
    ]) {
      assert.match(violation(source, target), /下层不导入上层/, `${source} → ${target}`)
    }
  })

  it('leaves tests and files outside Studio alone', () => {
    assert.equal(violation('workbench/__tests__/support.ts', 'bootstrap/studio-application'), null)
    assert.equal(
      studioLayerImportViolation(
        root,
        path.join(root, 'packages/editor/src/index.ts'),
        at('bootstrap/studio-application'),
      ),
      null,
    )
    assert.equal(violation('workbench/edits/note-edits.ts', '../../../packages/editor/src/x'), null)
  })

  it('names the feature a file belongs to', () => {
    assert.equal(studioFeatureOf(root, at('features/piano-roll/actions/tools.ts')), 'piano-roll')
    assert.equal(studioFeatureOf(root, at('features/piano-roll')), null)
    assert.equal(studioFeatureOf(root, at('workbench/edits/note-edits.ts')), null)
    assert.equal(studioFeatureOf(root, path.join(root, 'packages/editor/src/index.ts')), null)
  })
})
