import type { InjectionKey } from 'vue'
import type { PianoRollToolActionTarget } from '@/features/piano-roll/types/piano-roll-tool-action-target'
import type { ArrangementActionTargets } from '@/features/project-workspace/actions/project-workbench-action-context'
import type { ProjectWorkbenchActionTarget } from '@/features/project-workspace/actions/project-workbench-actions'
import type { TempoTrackPreviewController } from '@/features/project-workspace/tempo-track/types/tempo-track-preview'
import type { TempoEventActionContext } from '@/features/project-workspace/tempo-track/types/tempo-event-actions'
import type { StudioActionTargetSlot } from '@/workbench/actions/studio-action-target'
import type { StudioInterfaceActionTarget } from '@/workbench/actions/studio-interface-actions'
import type { StudioActionVueContext } from '@/workbench/actions/vue/studio-action-context'
import type { StudioEditorActionContext } from '@/workbench/actions/vue/studio-editor-action-context'
import type { ProjectClipVueContext } from '@/workbench/project/clip/vue/project-clip-context'
import type { ProjectEntryVueContext } from '@/workbench/project/entry/vue/project-entry-context'
import type { ProjectMidiImportVueContext } from '@/workbench/project/midi-import/vue/project-midi-import-context'
import type { ProjectMidiNoteVueContext } from '@/workbench/project/midi-note/vue/project-midi-note-context'
import type { ProjectMidiSustainPedalVueContext } from '@/workbench/project/midi-sustain-pedal/vue/project-midi-sustain-pedal-context'
import type { ProjectNavigationDecisionVueContext } from '@/workbench/project/navigation/vue/project-navigation-decision-context'
import type { ProjectPlaybackVueContext } from '@/workbench/project/playback/vue/project-playback-context'
import type { ProjectTempoEventVueContext } from '@/workbench/project/tempo-event/vue/project-tempo-event-context'
import type { ProjectTrackVueContext } from '@/workbench/project/track/vue/project-track-context'
import type { ActiveProjectVueContext } from '@/workbench/project/vue/active-project-context'

/** The Studio symbol catalogue. Contexts and providers share these typed, module-local keys. */
export const ACTIVE_PROJECT_CONTEXT_KEY: InjectionKey<ActiveProjectVueContext> = Symbol(
  'seele/studio/ActiveProjectVueContext',
)

export const ARRANGEMENT_ACTION_TARGETS_KEY: InjectionKey<ArrangementActionTargets> = Symbol(
  'seele/studio/ArrangementActionTargets',
)

export const PIANO_ROLL_TOOL_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<PianoRollToolActionTarget>
> = Symbol('seele/studio/PianoRollToolActionTarget')

export const PROJECT_CLIP_CONTEXT_KEY: InjectionKey<ProjectClipVueContext> = Symbol(
  'seele/studio/ProjectClipVueContext',
)

export const PROJECT_ENTRY_CONTEXT_KEY: InjectionKey<ProjectEntryVueContext> = Symbol(
  'seele/studio/ProjectEntryVueContext',
)

export const PROJECT_MIDI_IMPORT_CONTEXT_KEY: InjectionKey<ProjectMidiImportVueContext> = Symbol(
  'seele/studio/ProjectMidiImportVueContext',
)

export const PROJECT_MIDI_NOTE_CONTEXT_KEY: InjectionKey<ProjectMidiNoteVueContext> = Symbol(
  'seele/studio/ProjectMidiNoteVueContext',
)

export const PROJECT_MIDI_SUSTAIN_PEDAL_CONTEXT_KEY: InjectionKey<ProjectMidiSustainPedalVueContext> =
  Symbol('seele/studio/ProjectMidiSustainPedalVueContext')

export const PROJECT_NAVIGATION_DECISION_CONTEXT_KEY: InjectionKey<ProjectNavigationDecisionVueContext> =
  Symbol('seele/studio/ProjectNavigationDecisionVueContext')

export const PROJECT_PLAYBACK_CONTEXT_KEY: InjectionKey<ProjectPlaybackVueContext> = Symbol(
  'seele/studio/ProjectPlaybackVueContext',
)

export const PROJECT_TEMPO_EVENT_CONTEXT_KEY: InjectionKey<ProjectTempoEventVueContext> = Symbol(
  'seele/studio/ProjectTempoEventVueContext',
)

export const PROJECT_TRACK_CONTEXT_KEY: InjectionKey<ProjectTrackVueContext> = Symbol(
  'seele/studio/ProjectTrackVueContext',
)

export const PROJECT_WORKBENCH_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<ProjectWorkbenchActionTarget>
> = Symbol('seele/studio/ProjectWorkbenchActionTarget')

export const STUDIO_ACTION_CONTEXT_KEY: InjectionKey<StudioActionVueContext> = Symbol(
  'seele/studio/StudioActionVueContext',
)

export const STUDIO_EDITOR_ACTION_CONTEXT_KEY: InjectionKey<StudioEditorActionContext> = Symbol(
  'seele/studio/StudioEditorActionContext',
)

export const STUDIO_INTERFACE_ACTION_TARGET_KEY: InjectionKey<
  StudioActionTargetSlot<StudioInterfaceActionTarget>
> = Symbol('seele/studio/StudioInterfaceActionTarget')

export const TEMPO_EVENT_ACTION_CONTEXT_KEY: InjectionKey<TempoEventActionContext> = Symbol(
  'seele/studio/TempoEventActionContext',
)

export const TEMPO_TRACK_PREVIEW_KEY: InjectionKey<TempoTrackPreviewController> = Symbol(
  'seele/studio/TempoTrackPreviewController',
)

/** Each keyboard claim must have an independent lifetime, including nested suspensions. */
export function createKeyboardInputOwner(): symbol {
  return Symbol('seele/studio/keyboard-input-owner')
}
