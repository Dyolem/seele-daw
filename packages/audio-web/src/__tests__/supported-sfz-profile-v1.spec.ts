import { describe, expect, it } from 'vitest'

import { SEELE_SUPPORTED_SFZ_PROFILE_V1 } from '#internal/sample-instrument/supported-sfz-profile-v1'

describe('Seele Supported SFZ Profile V1', () => {
  it('declares the exact source semantics that Manifest V1 can execute', () => {
    expect(SEELE_SUPPORTED_SFZ_PROFILE_V1).toEqual({
      id: 'seele.supported-sfz-profile',
      version: 1,
      headers: ['global', 'group', 'region'],
      opcodes: [
        'sample',
        'key',
        'lokey',
        'hikey',
        'pitch_keycenter',
        'tune',
        'offset',
        'loop_mode',
        'loop_start',
        'loop_end',
        'ampeg_attack',
        'ampeg_attack_shape',
        'ampeg_release',
        'ampeg_release_shape',
        'group',
        'off_by',
        'off_mode',
      ],
      loopModes: ['no_loop', 'one_shot', 'loop_continuous', 'loop_sustain'],
      audioMediaTypes: ['audio/wav'],
      tuneCentRange: { minimum: -100, maximum: 100 },
    })
    expect(Object.isFrozen(SEELE_SUPPORTED_SFZ_PROFILE_V1)).toBe(true)
    expect(Object.isFrozen(SEELE_SUPPORTED_SFZ_PROFILE_V1.opcodes)).toBe(true)
  })
})
