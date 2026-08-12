const SUPPORTED_HEADERS = Object.freeze(['global', 'group', 'region'] as const)

const SUPPORTED_OPCODES = Object.freeze([
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
] as const)

const SUPPORTED_LOOP_MODES = Object.freeze([
  'no_loop',
  'one_shot',
  'loop_continuous',
  'loop_sustain',
] as const)

/** Exact SFZ authoring subset that can compile into Manifest V1 without silent fallback. */
export const SEELE_SUPPORTED_SFZ_PROFILE_V1 = Object.freeze({
  id: 'seele.supported-sfz-profile',
  version: 1,
  headers: SUPPORTED_HEADERS,
  opcodes: SUPPORTED_OPCODES,
  loopModes: SUPPORTED_LOOP_MODES,
  audioMediaTypes: Object.freeze(['audio/wav'] as const),
  tuneCentRange: Object.freeze({ minimum: -100, maximum: 100 }),
})
