import {
  createInitialProjectSession,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import { createProjectMidiClipPresentations } from '@/features/project-workspace/project-clip-presentation'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { createProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

describe('createProjectMidiClipPresentations', () => {
  it('sorts MIDI Clips by timeline position and resolves inherited Track color', () => {
    const projectId = parseProjectId('clip-presentation-project')
    const session = createInitialProjectSession({
      projectId,
      projectName: 'Clip Presentation',
      tempoEventId: parseTempoEventId('clip-presentation-tempo'),
      timeSignatureEventId: parseTimeSignatureEventId('clip-presentation-meter'),
    })
    const activeState: ReadyActiveProjectState = Object.freeze({
      phase: ACTIVE_PROJECT_PHASE.READY,
      projectId,
      session,
      modelRevision: session.modelRevision,
      contentStateId: session.contentStateId,
      savedRevision: session.modelRevision,
      savedContentStateId: session.contentStateId,
      isDirty: false,
      saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
      saveFailure: null,
      recoveryFailures: Object.freeze([]),
    })
    const track = createProjectTrackCoordinator({
      activeProject: { state: activeState },
      createRandomValue: () => 0,
      createUniqueId: (() => {
        const identities = ['clip-presentation-track', 'clip-presentation-device']
        return () => identities.shift() ?? 'unused-clip-presentation-track-id'
      })(),
    }).addInstrumentTrack()
    const clips = createProjectClipCoordinator({
      activeProject: { state: activeState },
      createUniqueId: (() => {
        const identities = [
          'clip-presentation-later',
          'clip-presentation-later-source',
          'clip-presentation-earlier',
          'clip-presentation-earlier-source',
        ]
        return () => identities.shift() ?? 'unused-clip-presentation-clip-id'
      })(),
    })

    clips.addEmptyMidiClip({ targetTick: parseTick(3_840), trackId: track.trackId })
    clips.addEmptyMidiClip({ targetTick: parseTick(0), trackId: track.trackId })

    const snapshot = session.getSnapshot()
    const presentations = createProjectMidiClipPresentations(snapshot)

    expect(presentations.map((clip) => clip.id)).toEqual([
      'clip-presentation-earlier',
      'clip-presentation-later',
    ])
    expect(presentations[0]).toMatchObject({
      color: snapshot.tracks[0]?.color,
      muted: false,
      name: 'Instrument 1',
      spanTick: 3_840,
      startTick: 0,
      trackId: track.trackId,
    })
    expect(Object.isFrozen(presentations)).toBe(true)
    expect(Object.isFrozen(presentations[0])).toBe(true)
  })
})
