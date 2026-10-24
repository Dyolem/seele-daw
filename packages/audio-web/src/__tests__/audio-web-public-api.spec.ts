import { expect, it } from 'vitest'

import * as audioWeb from '#internal/index'

it('exposes only the playback runtime to the Studio Composition Root', () => {
  expect(Object.keys(audioWeb)).toEqual(['createWebAudioPlaybackRuntime'])
})
