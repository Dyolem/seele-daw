import {
  createInitialProjectSession,
  createMidiClipRecord,
  createTimeSignatureEventRecord,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  parseTimeSignatureNumerator,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
  AudibleMidiTimelineError,
  deriveAudibleMidiTimelineRange,
} from '#internal/timeline/audible-midi-timeline'
import {
  createAudibleMidiProjectFixture,
  replaceCompilerFixtureSnapshot,
} from '#internal/__tests__/support/audible-midi-project-fixture'

function createEmptySnapshot() {
  return createInitialProjectSession({
    projectId: parseProjectId('project-audible-midi-timeline'),
    projectName: 'Audible MIDI Timeline',
    tempoEventId: parseTempoEventId('tempo-audible-midi-timeline'),
    timeSignatureEventId: parseTimeSignatureEventId('meter-audible-midi-timeline'),
  }).getSnapshot()
}

describe('Audible MIDI Timeline', () => {
  it('derives a frozen 150-bar minimum from the initial Project time signature', () => {
    const range = deriveAudibleMidiTimelineRange(createEmptySnapshot())

    expect(range).toEqual({
      contentEndTick: 0,
      initialBarSpanTick: 3_840,
      minimumTimelineEndTick: 576_000,
      timelineBarCount: AUDIBLE_MIDI_MINIMUM_TIMELINE_BAR_COUNT,
      timelineEndTick: 576_000,
    })
    expect(Object.isFrozen(range)).toBe(true)
  })

  it('uses the initial meter without treating later meter events as a persisted view extent', () => {
    const snapshot = createEmptySnapshot()
    const range = deriveAudibleMidiTimelineRange(
      replaceCompilerFixtureSnapshot(snapshot, {
        timeSignatureEvents: [
          createTimeSignatureEventRecord({
            denominator: 8,
            id: snapshot.timeSignatureEvents[0]!.id,
            numerator: parseTimeSignatureNumerator(3),
            tick: parseTick(0),
          }),
          createTimeSignatureEventRecord({
            denominator: 4,
            id: parseTimeSignatureEventId('meter-audible-midi-timeline-later'),
            numerator: parseTimeSignatureNumerator(7),
            tick: parseTick(14_400),
          }),
        ],
      }),
    )

    expect(range).toMatchObject({
      initialBarSpanTick: 1_440,
      minimumTimelineEndTick: 216_000,
      timelineBarCount: 150,
      timelineEndTick: 216_000,
    })
  })

  it('extends to the exact furthest Clip end and reports a final partial bar', () => {
    const { records, snapshot } = createAudibleMidiProjectFixture()
    const extendedClip = createMidiClipRecord({
      ...records.pianoClip,
      spanTick: parseTick(1_920),
      startTick: parseTick(576_000),
    })
    const range = deriveAudibleMidiTimelineRange(
      replaceCompilerFixtureSnapshot(snapshot, {
        clips: [records.alternateClip, extendedClip],
      }),
    )

    expect(range).toMatchObject({
      contentEndTick: 577_920,
      minimumTimelineEndTick: 576_000,
      timelineBarCount: 151,
      timelineEndTick: 577_920,
    })
  })

  it.each([
    ['initial-time-signature-missing', []],
    [
      'initial-time-signature-ambiguous',
      [
        createEmptySnapshot().timeSignatureEvents[0]!,
        createEmptySnapshot().timeSignatureEvents[0]!,
      ],
    ],
  ] as const)('fails closed with %s when the initial meter is not unique', (code, events) => {
    const snapshot = createEmptySnapshot()

    expect(() =>
      deriveAudibleMidiTimelineRange(
        replaceCompilerFixtureSnapshot(snapshot, { timeSignatureEvents: events }),
      ),
    ).toThrow(expect.objectContaining({ code }) as AudibleMidiTimelineError)
  })
})
