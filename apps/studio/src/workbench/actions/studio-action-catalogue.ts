import {
  STUDIO_ACTION,
  type StudioActionDescriptor,
  type StudioActionId,
} from '@/workbench/actions/studio-action'

/** Product metadata exists independently of the mounted feature and its current capability. */
const DESCRIPTORS = {
  [STUDIO_ACTION.PROJECT_SAVE]: {
    label: 'Save',
    description: 'Save the current project.',
    category: 'project',
    keywords: ['保存', 'project'],
  },
  [STUDIO_ACTION.HISTORY_UNDO]: {
    label: 'Undo',
    description: 'Undo the last project edit.',
    category: 'history',
    keywords: ['撤销'],
  },
  [STUDIO_ACTION.HISTORY_REDO]: {
    label: 'Redo',
    description: 'Redo the last undone project edit.',
    category: 'history',
    keywords: ['重做'],
  },
  [STUDIO_ACTION.PLAYBACK_TOGGLE]: {
    label: 'Play / pause',
    description: 'Play or pause the current project.',
    category: 'playback',
    keywords: ['播放', '暂停', 'transport'],
  },
  [STUDIO_ACTION.PLAYBACK_RETURN_TO_START]: {
    label: 'Return to last start position',
    description: 'Stop playback and return to the last start position.',
    category: 'playback',
    keywords: ['返回', '起点', 'transport'],
  },
  [STUDIO_ACTION.PROJECTS_SHOW]: {
    label: 'Projects',
    description: 'Return to the project list.',
    category: 'project',
    keywords: ['项目', '导航'],
  },
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI]: {
    label: 'Import MIDI as new project…',
    description: 'Create a project from a MIDI file.',
    category: 'project',
    keywords: ['导入', 'MIDI'],
  },
  [STUDIO_ACTION.PROJECT_IMPORT_MIDI_TRACKS]: {
    label: 'Import MIDI as new tracks…',
    description: 'Add the tracks from a MIDI file to the current project.',
    category: 'project',
    keywords: ['导入', '轨道', 'MIDI'],
  },
  [STUDIO_ACTION.MIDI_EDITOR_OPEN]: {
    label: 'Open MIDI editor',
    description: 'Open or restore the MIDI editor dock.',
    category: 'interface',
    keywords: ['钢琴卷帘', '面板', 'dock'],
  },
  [STUDIO_ACTION.EDITOR_SELECTION_DELETE]: {
    label: 'Delete selection',
    description:
      'Delete selected notes, sustain pedal events, or a removable tempo event in one project edit.',
    category: 'editor',
    keywords: ['删除', '选择', 'Note', 'CC64', 'Tempo'],
  },
  [STUDIO_ACTION.EDITOR_SELECTION_CLEAR]: {
    label: 'Clear selection',
    description: 'Clear the selection in the focused editor when it supports clearing.',
    category: 'editor',
    keywords: ['清空', '取消选择', 'Note', 'CC64'],
  },
  [STUDIO_ACTION.INTERACTION_CANCEL]: {
    label: 'Cancel interaction',
    description: 'Cancel the active editing gesture or timeline locate without clearing selection.',
    category: 'editor',
    keywords: ['取消', '拖动', '手势', 'Tempo', '定位'],
  },
  [STUDIO_ACTION.ARRANGEMENT_CLIP_OPEN]: {
    label: 'Open MIDI clip',
    description: 'Select the focused MIDI clip and open it in the editor.',
    category: 'arrangement',
    keywords: ['打开', '片段', 'Clip'],
  },
  [STUDIO_ACTION.ARRANGEMENT_CLIP_CREATE]: {
    label: 'Create MIDI clip',
    description: 'Create an empty MIDI clip at the focused track and bar.',
    category: 'arrangement',
    keywords: ['创建', '小节', '片段', 'Clip'],
  },
  [STUDIO_ACTION.PIANO_ROLL_TOOL_CURSOR]: {
    label: 'Cursor tool',
    description: 'Select the piano roll cursor tool.',
    category: 'editor',
    keywords: ['选择工具', '光标'],
  },
  [STUDIO_ACTION.PIANO_ROLL_TOOL_PENCIL]: {
    label: 'Pencil tool',
    description: 'Select the piano roll pencil tool.',
    category: 'editor',
    keywords: ['画笔', '铅笔', '音符'],
  },
  [STUDIO_ACTION.PIANO_ROLL_SNAP_TOGGLE]: {
    label: 'Toggle snap',
    description: 'Turn piano roll grid snapping on or off.',
    category: 'editor',
    keywords: ['吸附', '网格', 'Grid'],
  },
  [STUDIO_ACTION.NOTIFICATIONS_FOCUS]: {
    label: 'Focus notifications',
    description: 'Move keyboard focus to the notification area.',
    category: 'interface',
    keywords: ['通知', '焦点', 'toast'],
  },
  [STUDIO_ACTION.SHORTCUTS_SHOW]: {
    label: 'Keyboard shortcuts',
    description: 'Find keyboard shortcuts and editor controls.',
    category: 'interface',
    keywords: ['快捷键', '按键', '帮助', 'settings'],
  },
} satisfies Readonly<Record<StudioActionId, Omit<StudioActionDescriptor, 'actionId'>>>

for (const descriptor of Object.values(DESCRIPTORS)) {
  Object.freeze(descriptor.keywords)
  Object.freeze(descriptor)
}
Object.freeze(DESCRIPTORS)

export function describeStudioAction(actionId: StudioActionId): StudioActionDescriptor {
  return Object.freeze({ actionId, ...DESCRIPTORS[actionId] })
}
