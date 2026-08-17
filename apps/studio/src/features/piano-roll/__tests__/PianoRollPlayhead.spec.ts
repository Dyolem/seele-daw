import { createInitialPianoRollViewport, createPianoRollClipContext } from '@seele-daw/editor'
import {
  createMidiClipRecord,
  createMidiSourceRecord,
  parseClipId,
  parseMidiPitch,
  parseMidiSourceId,
  parsePositiveTick,
  parseProjectColor,
  parseProjectId,
  parseTick,
  parseTrackId,
} from '@seele-daw/project-core'
import { mount } from '@vue/test-utils'
import { nextTick, shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'

import PianoRollPlayhead from '@/features/piano-roll/playhead/PianoRollPlayhead.vue'
import {
  PROJECT_PIANO_ROLL_PRESENTATION_STATUS,
  type ReadyProjectPianoRollPresentation,
} from '@/features/piano-roll/project-piano-roll-presentation'
import type { ProjectPlaybackCoordinator } from '@/workbench/project/playback/project-playback-coordinator'
import {
  PROJECT_PLAYBACK_PHASE,
  type ProjectPlaybackState,
} from '@/workbench/project/playback/project-playback-state'
import type { ProjectPlaybackVisualPosition } from '@/workbench/project/playback/project-playback-visual-position'
import {
  PROJECT_PLAYBACK_CONTEXT_KEY,
  type ProjectPlaybackVueContext,
} from '@/workbench/project/playback/vue/project-playback-context'

const PROJECT_ID = parseProjectId('piano-roll-playhead-project')
const OTHER_PROJECT_ID = parseProjectId('piano-roll-playhead-other-project')
const INITIAL_STATE = Object.freeze<ProjectPlaybackState>({
  diagnostics: Object.freeze([]),
  failureCause: null,
  feedback: null,
  modelRevision: null,
  phase: PROJECT_PLAYBACK_PHASE.PLAYING,
  planStatus: null,
  positionProjectSecond: 0,
  projectId: PROJECT_ID,
})

function createPresentation(startTick = parseTick(3_840)) {
  const source = createMidiSourceRecord({
    id: parseMidiSourceId('piano-roll-playhead-source'),
    lengthTick: parsePositiveTick(3_840),
  })
  const clip = createMidiClipRecord({
    color: null,
    id: parseClipId('piano-roll-playhead-clip'),
    loop: null,
    muted: false,
    name: 'Playhead Clip',
    sourceId: source.id,
    sourceOffsetTick: parseTick(0),
    spanTick: parsePositiveTick(3_840),
    startTick,
    trackId: parseTrackId('piano-roll-playhead-track'),
  })
  const presentation: ReadyProjectPianoRollPresentation = Object.freeze({
    clipId: clip.id,
    color: parseProjectColor('#8B5CF6'),
    context: createPianoRollClipContext(clip, source),
    muted: false,
    name: clip.name,
    projectId: PROJECT_ID,
    startTick: clip.startTick,
    status: PROJECT_PIANO_ROLL_PRESENTATION_STATUS.READY,
    trackId: clip.trackId,
  })
  return presentation
}

function createFixture() {
  const presentation = createPresentation()
  const visualPosition = shallowRef<ProjectPlaybackVisualPosition>(
    Object.freeze({
      modelRevision: null,
      phase: PROJECT_PLAYBACK_PHASE.PLAYING,
      positionProjectSecond: 1,
      positionTick: 4_800 as ProjectPlaybackVisualPosition['positionTick'],
      projectId: PROJECT_ID,
    }),
  )
  const state = shallowRef(INITIAL_STATE)
  const coordinator: ProjectPlaybackCoordinator = Object.freeze({
    dispose() {},
    pause: () => false,
    play: async () => false,
    readVisualPosition: () => visualPosition.value,
    returnToStart: () => false,
    state: INITIAL_STATE,
    subscribe: () => () => undefined,
    togglePlayPause: () => false,
  })
  const context: ProjectPlaybackVueContext = Object.freeze({
    projectPlayback: coordinator,
    state,
    visualPosition,
  })
  const viewport = createInitialPianoRollViewport(presentation.context, {
    heightCssPixel: 250,
    maximumPitch: parseMidiPitch(72),
    minimumPitch: parseMidiPitch(48),
    widthCssPixel: 960,
  })
  const wrapper = mount(PianoRollPlayhead, {
    props: { presentation, viewport },
    global: {
      provide: {
        [PROJECT_PLAYBACK_CONTEXT_KEY as symbol]: context,
      },
    },
  })

  return { presentation, visualPosition, wrapper }
}

describe('PianoRollPlayhead', () => {
  it('moves one transform-only layer and follows Clip, project and editor lifecycle', async () => {
    const fixture = createFixture()

    expect(fixture.wrapper.get('.project-piano-roll__playhead').attributes('style')).toBe(
      'transform: translate3d(240px, 0, 0);',
    )
    expect(fixture.wrapper.html()).not.toContain('left:')

    fixture.visualPosition.value = Object.freeze({
      ...fixture.visualPosition.value,
      positionTick: 3_839.5 as ProjectPlaybackVisualPosition['positionTick'],
    })
    await nextTick()
    expect(fixture.wrapper.find('.project-piano-roll__playhead').exists()).toBe(false)

    fixture.visualPosition.value = Object.freeze({
      ...fixture.visualPosition.value,
      positionTick: 6_720 as ProjectPlaybackVisualPosition['positionTick'],
    })
    await fixture.wrapper.setProps({
      presentation: createPresentation(parseTick(5_760)),
    })
    expect(fixture.wrapper.get('.project-piano-roll__playhead').attributes('style')).toBe(
      'transform: translate3d(240px, 0, 0);',
    )

    fixture.visualPosition.value = Object.freeze({
      ...fixture.visualPosition.value,
      projectId: OTHER_PROJECT_ID,
    })
    await nextTick()
    expect(fixture.wrapper.find('.project-piano-roll__playhead').exists()).toBe(false)

    fixture.wrapper.unmount()
    expect(fixture.wrapper.element.isConnected).toBe(false)
  })
})
