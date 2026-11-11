import {
  defineStudioAction,
  defineStudioContext,
  type StudioActionCompletion,
  type StudioActionIdsOf,
} from '@/workbench/actions/studio-action'

export interface ArrangementKeyboardTarget {
  isFocused(): boolean
  execute(): StudioActionCompletion
}

export const ARRANGEMENT_CLIP_CONTEXT = defineStudioContext<ArrangementKeyboardTarget>({
  id: 'arrangement-clip',
  label: 'Focused arrangement clip',
  priority: 2,
  ownsEnter: true,
  isActive: (clip) => clip.isFocused(),
})

export const ARRANGEMENT_BAR_CONTEXT = defineStudioContext<ArrangementKeyboardTarget>({
  id: 'arrangement-bar',
  label: 'Focused arrangement bar',
  priority: 2,
  ownsEnter: true,
  isActive: (bar) => bar.isFocused(),
})

export const ARRANGEMENT_ACTIONS = [
  defineStudioAction({
    id: 'arrangement.clip.open',
    context: ARRANGEMENT_CLIP_CONTEXT,
    label: 'Open MIDI clip',
    description: 'Select the focused MIDI clip and open it in the editor.',
    category: 'arrangement',
    keywords: ['打开', '片段', 'Clip'],
    keys: ['Enter'],
    resolve: (clip) => ({ execute: () => clip.execute() }),
  }),
  defineStudioAction({
    id: 'arrangement.clip.create',
    context: ARRANGEMENT_BAR_CONTEXT,
    label: 'Create MIDI clip',
    description: 'Create an empty MIDI clip at the focused track and bar.',
    category: 'arrangement',
    keywords: ['创建', '小节', '片段', 'Clip'],
    keys: ['Enter'],
    resolve: (bar) => ({ execute: () => bar.execute() }),
  }),
] as const

declare module '@/workbench/actions/studio-action' {
  interface StudioActionIds extends StudioActionIdsOf<typeof ARRANGEMENT_ACTIONS> {}
}
