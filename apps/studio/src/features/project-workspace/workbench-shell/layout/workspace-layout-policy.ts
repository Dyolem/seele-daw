import {
  PROJECT_WORKBENCH_DOCK_MODE,
  type ProjectWorkbenchDockMode,
} from '@/features/project-workspace/workbench-shell/project-workbench-dock'

export const WORKSPACE_DEFAULT_DOCK_HEIGHT = 360
export const WORKSPACE_MINIMUM_DOCK_HEIGHT = 240
export const WORKSPACE_MINIMUM_ARRANGEMENT_HEIGHT = 200
export const WORKSPACE_SPLITTER_HEIGHT = 12
export const WORKSPACE_DOCK_HEADER_HEIGHT = 44
export const WORKSPACE_ARRANGEMENT_SUMMARY_HEIGHT = 32

export function resolveWorkspaceLayout(
  height: number,
  mode: ProjectWorkbenchDockMode,
  preferredHeight: number,
  maximized: boolean,
  activePane: 'arrangement' | 'midi',
) {
  const available = Math.max(0, height)
  const maximum = Math.max(
    WORKSPACE_MINIMUM_DOCK_HEIGHT,
    available - WORKSPACE_MINIMUM_ARRANGEMENT_HEIGHT - WORKSPACE_SPLITTER_HEIGHT,
  )
  if (mode === PROJECT_WORKBENCH_DOCK_MODE.FULLSCREEN)
    return {
      dockHeight: available,
      arrangementHeight: 0,
      splitterHeight: 0,
      arrangementCompact: false,
      dockMode: mode,
      maximum,
    }
  if (mode === PROJECT_WORKBENCH_DOCK_MODE.CLOSED)
    return {
      dockHeight: 0,
      arrangementHeight: available,
      splitterHeight: 0,
      arrangementCompact: false,
      dockMode: mode,
      maximum,
    }
  if (
    mode === PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED ||
    (available <
      WORKSPACE_MINIMUM_ARRANGEMENT_HEIGHT +
        WORKSPACE_MINIMUM_DOCK_HEIGHT +
        WORKSPACE_SPLITTER_HEIGHT &&
      activePane === 'arrangement')
  ) {
    const dockHeight = Math.min(WORKSPACE_DOCK_HEADER_HEIGHT, available)
    return {
      dockHeight,
      arrangementHeight: available - dockHeight,
      splitterHeight: 0,
      arrangementCompact: false,
      dockMode: PROJECT_WORKBENCH_DOCK_MODE.MINIMIZED,
      maximum,
    }
  }
  if (
    available <
    WORKSPACE_MINIMUM_ARRANGEMENT_HEIGHT + WORKSPACE_MINIMUM_DOCK_HEIGHT + WORKSPACE_SPLITTER_HEIGHT
  ) {
    const arrangementHeight = Math.min(WORKSPACE_ARRANGEMENT_SUMMARY_HEIGHT, available)
    return {
      dockHeight: available - arrangementHeight,
      arrangementHeight,
      splitterHeight: 0,
      arrangementCompact: true,
      dockMode: mode,
      maximum,
    }
  }
  const dockHeight = maximized
    ? maximum
    : Math.min(maximum, Math.max(WORKSPACE_MINIMUM_DOCK_HEIGHT, preferredHeight))
  return {
    dockHeight,
    arrangementHeight: available - dockHeight - WORKSPACE_SPLITTER_HEIGHT,
    splitterHeight: WORKSPACE_SPLITTER_HEIGHT,
    arrangementCompact: false,
    dockMode: mode,
    maximum,
  }
}
