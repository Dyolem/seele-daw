import {
  parsePositiveTick,
  parseProjectId,
  parseTick,
  type ProjectId,
  type Tick,
} from '@seele-daw/project-core'
import { shallowRef } from 'vue'

import type {
  ProjectPianoRollPresentation,
  ProjectPianoRollTrackPresentation,
} from '@/features/piano-roll/types/piano-roll-presentation'
import {
  presentProjectWorkbenchActions,
  type ProjectWorkbenchActionControls,
} from '@/features/project-workspace/actions/project-workbench-action-controls'
import type { ProjectMidiClipPresentation } from '@/features/project-workspace/project-clip-presentation'
import type { ProjectTrackPresentation } from '@/features/project-workspace/project-track-presentation'
import {
  PROJECT_WORKSPACE_KEY,
  type ProjectWorkspace,
  type ProjectWorkspaceSession,
} from '@/features/project-workspace/project-workspace'
import { createTestStudioActionRuntime } from '@/workbench/actions/__tests__/support/studio-action-test-support'
import { createTestSession } from '@/workbench/project/__tests__/active-project-test-support'

export interface TestProjectWorkspaceOptions {
  readonly actionControls?: ProjectWorkbenchActionControls
  readonly barSpanTick?: Tick
  readonly clips?: readonly ProjectMidiClipPresentation[]
  readonly pianoRoll?: ProjectPianoRollPresentation | null
  readonly pianoRollTrack?: ProjectPianoRollTrackPresentation | null
  readonly projectId?: ProjectId
  readonly session?: ProjectWorkspaceSession
  readonly timeSignatureNumerator?: number
  readonly timelineEndTick?: Tick
  readonly tracks?: readonly ProjectTrackPresentation[]
}

/**
 * A workspace whose values a test sets directly, for views mounted below the Shell. Spread
 * `provide` into the mount's `global.provide`; write the refs to change what the views see.
 */
export function createTestProjectWorkspace(options: TestProjectWorkspaceOptions = {}) {
  const projectId = options.projectId ?? parseProjectId('project-workspace-test')
  const actions = createTestStudioActionRuntime().runtime
  const refs = {
    actionControls: shallowRef(
      options.actionControls ?? presentProjectWorkbenchActions(actions.actions, actions.keyboard),
    ),
    clips: shallowRef(options.clips ?? Object.freeze([])),
    pianoRoll: shallowRef(options.pianoRoll ?? null),
    pianoRollTrack: shallowRef(options.pianoRollTrack ?? null),
    project: shallowRef(
      Object.freeze({
        barSpanTick: options.barSpanTick ?? parsePositiveTick(3_840),
        projectId,
        projectName: 'Test Project',
        timeSignatureDenominator: 4,
        timeSignatureNumerator: options.timeSignatureNumerator ?? 4,
      }),
    ),
    projectId: shallowRef(projectId),
    session: shallowRef(options.session ?? createTestSession(projectId)),
    timelineEndTick: shallowRef(options.timelineEndTick ?? parseTick(576_000)),
    tracks: shallowRef(options.tracks ?? Object.freeze([])),
  }
  const workspace: ProjectWorkspace = Object.freeze(refs)
  return { provide: { [PROJECT_WORKSPACE_KEY as symbol]: workspace }, refs }
}
