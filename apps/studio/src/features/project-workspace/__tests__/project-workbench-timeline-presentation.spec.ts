import { parseTick } from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  describeProjectTimelineMusicalPosition,
  formatProjectTimelineMusicalPosition,
  formatProjectTimelineTime,
} from '@/features/project-workspace/timeline/presentation'

describe('Project Timeline presentation', () => {
  it('formats an exact position against the fixed Arrangement meter grid', () => {
    const input = {
      barSpanTick: parseTick(3_840),
      tick: parseTick(13_680),
      timeSignatureNumerator: 4,
    }

    expect(formatProjectTimelineMusicalPosition(input)).toBe('Bar 4, beat 3, offset 240')
    expect(describeProjectTimelineMusicalPosition(input)).toBe(
      'Bar 4, beat 3, offset 240 within beat; Project Tick 13680',
    )
  })

  it('uses the meter beat span instead of assuming every beat is one quarter note', () => {
    expect(
      formatProjectTimelineMusicalPosition({
        barSpanTick: parseTick(2_880),
        tick: parseTick(5_400),
        timeSignatureNumerator: 6,
      }),
    ).toBe('Bar 2, beat 6, offset 120')
  })

  it('formats Project time without normalizing or rounding its precise source value', () => {
    expect(formatProjectTimelineTime(65.4329)).toBe('01:05.432')
    expect(formatProjectTimelineTime(-1)).toBe('00:00.000')
    expect(formatProjectTimelineTime(Number.NaN)).toBe('00:00.000')
  })
})
