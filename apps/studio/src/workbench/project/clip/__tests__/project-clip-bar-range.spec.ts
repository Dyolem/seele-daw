import {
  createInitialProjectSession,
  createTimeSignatureEventRecord,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureDenominator,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { createProjectClipBarRange } from '@/workbench/project/clip/project-clip-bar-range'
import { ProjectClipError } from '@/workbench/project/clip/project-clip-error'

function createSnapshot() {
  return createInitialProjectSession({
    projectId: parseProjectId('project-clip-bar-range'),
    projectName: 'Clip Bar Range',
    tempoEventId: parseTempoEventId('tempo-clip-bar-range'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-clip-bar-range'),
  }).getSnapshot()
}

describe('Project Clip bar range', () => {
  it.each([
    { targetTick: 0, expectedStartTick: 0 },
    { targetTick: 3_839, expectedStartTick: 0 },
    { targetTick: 3_840, expectedStartTick: 3_840 },
    { targetTick: 8_000, expectedStartTick: 7_680 },
  ])(
    'snaps Tick $targetTick to a one-bar 4/4 range',
    ({ targetTick, expectedStartTick }) => {
      expect(createProjectClipBarRange(createSnapshot(), parseTick(targetTick))).toEqual({
        startTick: expectedStartTick,
        spanTick: 3_840,
      })
    },
  )

  it('derives the bar span from the initial numerator and denominator', () => {
    const snapshot = createSnapshot()
    const threeEightSnapshot = Object.freeze({
      ...snapshot,
      timeSignatureEvents: Object.freeze([
        createTimeSignatureEventRecord({
          id: parseTimeSignatureEventId('meter-clip-three-eight'),
          tick: parseTick(0),
          numerator: parseTimeSignatureNumerator(3),
          denominator: parseTimeSignatureDenominator(8),
        }),
      ]),
    })

    expect(createProjectClipBarRange(threeEightSnapshot, parseTick(2_879))).toEqual({
      startTick: 1_440,
      spanTick: 1_440,
    })
  })

  it('fails closed instead of guessing when the initial meter is missing', () => {
    const snapshot = Object.freeze({
      ...createSnapshot(),
      timeSignatureEvents: Object.freeze([]),
    })

    expect(() => createProjectClipBarRange(snapshot, parseTick(0))).toThrowError(
      expect.objectContaining<Partial<ProjectClipError>>({
        name: 'ProjectClipError',
        code: 'initial-time-signature-missing',
      }),
    )
  })
})
