import { strict as assert } from 'node:assert'
import path from 'node:path'
import { describe, it } from 'node:test'
import { pianoRollImportViolation } from '../piano-roll-boundaries.mjs'

const root = path.resolve('piano-roll-boundary-fixture')
const feature = 'apps/studio/src/features/piano-roll'
const components = `${feature}/components`
const check = (source, target) =>
  pianoRollImportViolation(root, path.join(root, source), path.join(root, target))

describe('Piano Roll feature boundaries', () => {
  it('keeps private hooks and contracts inside their component owner', () => {
    const surface = `${components}/track-surface/ProjectPianoRollTrackSurface.vue`
    for (const target of ['hooks/use-track-layout', 'types/track-placement']) {
      assert.equal(check(surface, `${components}/track-surface/${target}`), null)
      for (const consumer of [
        `${components}/clip-focus/ProjectPianoRollSurface.vue`,
        `${components}/track-surface-lookalike/Other.vue`,
        `${feature}/types/piano-roll-presentation.ts`,
        'apps/studio/src/features/project-workspace/ProjectWorkspacePage.vue',
      ])
        assert.match(check(consumer, `${components}/track-surface/${target}`), /私有实现/)
    }
  })

  it('permits components and shared contracts across owners without a barrel', () => {
    const consumer = `${components}/clip-focus/ProjectPianoRollSurface.vue`
    assert.equal(check(consumer, `${components}/sustain-pedal/PianoRollSustainPedalLane.vue`), null)
    assert.equal(check(consumer, `${feature}/types/piano-roll-sustain-pedal`), null)
    assert.equal(check(consumer, `${components}/PianoRollToolControls.vue`), null)
    assert.equal(
      check(
        `${components}/clip-focus/types/clip-focus.ts`,
        `${feature}/types/piano-roll-sustain-pedal`,
      ),
      null,
    )
  })

  it('prevents contracts from depending on implementations and production from importing tests', () => {
    assert.match(
      check(
        `${feature}/types/piano-roll-sustain-pedal.ts`,
        `${components}/sustain-pedal/PianoRollSustainPedalLane.vue`,
      ),
      /共享契约不能反向依赖/,
    )
    assert.match(
      check(
        `${components}/clip-focus/types/clip-focus.ts`,
        `${components}/clip-focus/hooks/use-note-interaction`,
      ),
      /共享契约不能反向依赖/,
    )
    assert.match(
      check(
        `${components}/clip-focus/ProjectPianoRollSurface.vue`,
        `${feature}/__tests__/support/piano-roll-resize-observer-test-support`,
      ),
      /禁止导入测试/,
    )
    assert.equal(
      check(
        `${feature}/__tests__/ProjectPianoRollSurface.spec.ts`,
        `${components}/clip-focus/hooks/use-note-interaction`,
      ),
      null,
    )
  })

  it('leaves unmigrated features alone and ignores unrelated lookalikes', () => {
    assert.equal(
      check(
        'apps/studio/src/features/other/Surface.vue',
        'apps/studio/src/features/piano-roll-extra/components/clip-focus/hooks/use-model',
      ),
      null,
    )
    assert.equal(
      pianoRollImportViolation(root, path.join(root, feature, 'Example.ts'), undefined),
      null,
    )
  })
})
