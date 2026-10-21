import { describe, expect, it } from 'vitest'
import { resolveControllerLaneLayout } from '@/features/piano-roll/layout/controller-lane-policy'

describe('Controller lane layout', () => {
  it('reserves note space, constrains only the displayed height, and restores the preference', () => {
    expect(resolveControllerLaneLayout(600, true, 180)).toMatchObject({
      visible: true,
      bodyHeight: 180,
    })
    expect(resolveControllerLaneLayout(315, true, 180)).toMatchObject({
      visible: true,
      bodyHeight: 97,
    })
    expect(resolveControllerLaneLayout(250, true, 180)).toMatchObject({
      visible: false,
      canExpand: false,
      bodyHeight: 0,
    })
    expect(resolveControllerLaneLayout(600, true, 180)).toMatchObject({
      visible: true,
      bodyHeight: 180,
    })
    expect(resolveControllerLaneLayout(600, false, 180)).toMatchObject({
      visible: false,
      canExpand: true,
    })
  })
})
