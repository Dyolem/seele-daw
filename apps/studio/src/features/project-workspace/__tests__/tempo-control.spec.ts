import {
  createTempoEventRecord,
  parseTempoBpm,
  parseTempoEventId,
  parseTick,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PROJECT_TEMPO_EDITING_FRACTION_DIGITS,
  PROJECT_TEMPO_CONTROL_MODE,
  createProjectTempoControlPresentation,
  formatProjectTempoBpm,
  parseProjectTempoInput,
  roundProjectTempoBpmForEditing,
} from '@/features/project-workspace/tempo/tempo-control'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'

function positionTick(value: number): ProjectPlaybackVisualPosition['positionTick'] {
  return value as ProjectPlaybackVisualPosition['positionTick']
}

describe('Project Tempo control projection', () => {
  it('shares one Studio precision rule across formatting, input, and graphical editing', () => {
    expect(PROJECT_TEMPO_EDITING_FRACTION_DIGITS).toBe(2)
    expect(roundProjectTempoBpmForEditing(143.999_884_800_092_16)).toBe(144)
    expect(roundProjectTempoBpmForEditing(120.125)).toBe(120.13)
  })

  it.each([
    [143.999_884_800_092_16, '144'],
    [120, '120'],
    [120.5, '120.5'],
    [120.25, '120.25'],
  ])('formats %s BPM with at most two visible decimals', (bpm, expected) => {
    expect(formatProjectTempoBpm(parseTempoBpm(bpm))).toBe(expected)
  })

  it('selects the current Tempo Map step at the continuous playhead position', () => {
    const initial = createTempoEventRecord({
      bpm: parseTempoBpm(120),
      id: parseTempoEventId('tempo-control-initial'),
      tick: parseTick(0),
    })
    const later = createTempoEventRecord({
      bpm: parseTempoBpm(90.25),
      id: parseTempoEventId('tempo-control-later'),
      tick: parseTick(960),
    })

    expect(createProjectTempoControlPresentation([later, initial], positionTick(959.9))).toEqual({
      bpm: initial.bpm,
      displayBpm: '120',
      mode: PROJECT_TEMPO_CONTROL_MODE.TEMPO_MAP,
    })
    expect(createProjectTempoControlPresentation([later, initial], positionTick(960))).toEqual({
      bpm: later.bpm,
      displayBpm: '90.25',
      mode: PROJECT_TEMPO_CONTROL_MODE.TEMPO_MAP,
    })
    expect(createProjectTempoControlPresentation([initial], positionTick(12_345))).toEqual({
      bpm: initial.bpm,
      displayBpm: '120',
      mode: PROJECT_TEMPO_CONTROL_MODE.SINGLE,
    })
  })

  it('accepts only the Studio two-decimal editing surface within the Core range', () => {
    expect(parseProjectTempoInput(' 120.25 ')).toEqual({
      status: 'accepted',
      bpm: parseTempoBpm(120.25),
    })
    expect(parseProjectTempoInput('5')).toEqual({
      status: 'accepted',
      bpm: parseTempoBpm(5),
    })
    expect(parseProjectTempoInput('999.')).toEqual({
      status: 'accepted',
      bpm: parseTempoBpm(999),
    })
    expect(parseProjectTempoInput('120.125')).toEqual({
      status: 'rejected',
      message: 'Tempo supports at most two decimal places.',
    })
    expect(parseProjectTempoInput('4.99')).toEqual({
      status: 'rejected',
      message: 'Tempo must be from 5 through 999 BPM.',
    })
    expect(parseProjectTempoInput('fast')).toEqual({
      status: 'rejected',
      message: 'Tempo must be a decimal number.',
    })
  })
})
