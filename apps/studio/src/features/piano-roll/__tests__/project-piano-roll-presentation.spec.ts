import {
  createInitialProjectSession,
  createMidiLoop,
  parseProjectId,
  parseTempoEventId,
  parseTick,
  parseTimeSignatureEventId,
  type ProjectSnapshot,
} from '@seele-daw/project-core'
import { describe, expect, it } from 'vitest'

import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  createProjectPianoRollPresentation,
  createProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import {
  ACTIVE_PROJECT_PHASE,
  ACTIVE_PROJECT_SAVE_STATUS,
  type ReadyActiveProjectState,
} from '@/workbench/project/active-project-state'
import { createProjectClipCoordinator } from '@/workbench/project/clip/project-clip-coordinator'
import { createProjectTrackCoordinator } from '@/workbench/project/track/project-track-coordinator'

function createFixture() {
  const projectId = parseProjectId('piano-roll-presentation-project')
  const session = createInitialProjectSession({
    projectId,
    projectName: 'Piano Roll Presentation',
    tempoEventId: parseTempoEventId('piano-roll-presentation-tempo'),
    timeSignatureEventId: parseTimeSignatureEventId('piano-roll-presentation-meter'),
  })
  const activeState: ReadyActiveProjectState = Object.freeze({
    contentStateId: session.contentStateId,
    isDirty: false,
    modelRevision: session.modelRevision,
    phase: ACTIVE_PROJECT_PHASE.READY,
    projectId,
    recoveryFailures: Object.freeze([]),
    savedContentStateId: session.contentStateId,
    savedRevision: session.modelRevision,
    saveFailure: null,
    saveStatus: ACTIVE_PROJECT_SAVE_STATUS.IDLE,
    session,
  })
  const track = createProjectTrackCoordinator({
    activeProject: { state: activeState },
    createRandomValue: () => 0,
    createUniqueId: (() => {
      const ids = ['piano-roll-presentation-track', 'piano-roll-presentation-device']
      return () => ids.shift() ?? 'unused-piano-roll-presentation-track-id'
    })(),
  }).addInstrumentTrack()
  const clip = createProjectClipCoordinator({
    activeProject: { state: activeState },
    createUniqueId: (() => {
      const ids = ['piano-roll-presentation-clip', 'piano-roll-presentation-source']
      return () => ids.shift() ?? 'unused-piano-roll-presentation-clip-id'
    })(),
  }).addEmptyMidiClip({
    targetTick: parseTick(3_840),
    trackId: track.trackId,
  })

  return { clip, session, track }
}

describe('Project Piano Roll Presentation', () => {
  it('resolves the selected Clip ownership window and inherited Track color', () => {
    const fixture = createFixture()
    const snapshot = fixture.session.getSnapshot()
    const track = snapshot.tracks.find(({ id }) => id === fixture.track.trackId)

    const presentation = createProjectPianoRollPresentation(snapshot, fixture.clip.clipId)

    expect(presentation).toMatchObject({
      clipId: fixture.clip.clipId,
      color: track?.color,
      projectId: snapshot.project.id,
      startTick: 3_840,
      status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
      trackId: fixture.track.trackId,
    })
    if (presentation?.status !== PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY) {
      throw new Error('Expected a ready Piano Roll presentation')
    }
    expect(presentation.context).toMatchObject({
      clipId: fixture.clip.clipId,
      sourceStartTick: 0,
      sourceEndTick: 3_840,
    })
    expect(presentation.snapshot).toBe(snapshot)
  })

  it('keeps a valid looped Clip visible as explicitly unsupported', () => {
    const fixture = createFixture()
    const snapshot = fixture.session.getSnapshot()
    const clip = snapshot.clips.find(({ id }) => id === fixture.clip.clipId)
    if (clip === undefined) throw new Error('Fixture Clip is missing')

    const loopedSnapshot: ProjectSnapshot = Object.freeze({
      ...snapshot,
      clips: Object.freeze([
        Object.freeze({
          ...clip,
          loop: createMidiLoop({
            sourceSpanTick: clip.spanTick,
            sourceStartTick: parseTick(0),
          }),
        }),
      ]),
    })

    expect(createProjectPianoRollPresentation(loopedSnapshot, fixture.clip.clipId)).toMatchObject({
      reason: 'looped-clip',
      status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.UNSUPPORTED,
    })
  })

  it('projects the selected Instrument Track with one explicit Active Clip', () => {
    const fixture = createFixture()
    const snapshot = fixture.session.getSnapshot()
    const presentation = createProjectPianoRollTrackPresentation(
      snapshot,
      fixture.track.trackId,
      fixture.clip.clipId,
    )

    expect(presentation).toMatchObject({
      projectId: snapshot.project.id,
      status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
      trackId: fixture.track.trackId,
    })
    if (presentation?.status !== PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY) {
      throw new Error('Expected a ready Track Piano Roll presentation')
    }
    expect(presentation.readModel).toMatchObject({
      activeClipId: fixture.clip.clipId,
      modelRevision: snapshot.modelRevision,
      trackId: fixture.track.trackId,
    })
    expect(presentation.snapshot).toBe(snapshot)
    expect(presentation.readModel.clips[0]?.clip).toMatchObject({
      clipId: fixture.clip.clipId,
      endTick: 7_680,
      startTick: 3_840,
    })
  })
})
